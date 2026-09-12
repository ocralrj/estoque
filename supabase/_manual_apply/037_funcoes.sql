-- ============================================================
-- Funções: o papel da pessoa deixa de ser enum e vira cadastro
--
-- Idempotente. Depende de: 036_locations.sql
-- ============================================================

-- PROBLEMA
-- "Função" era o enum `user_role`, com quatro valores cravados no banco. Criar
-- uma quinta função — Diretoria, Comprador, Conferente — exigia alterar o
-- enum, e o enum é lido por `get_user_role()`, que por sua vez decide dezenas
-- de policies de RLS. Na prática, ninguém podia criar uma função.
--
-- CORREÇÃO
-- Uma tabela `funcoes` com hierarquia própria, no mesmo vocabulário dos grupos:
-- `nivel` de 1 a 99, MENOR = MAIS ALTO. O papel do enum vira consequência do
-- nível, calculado por `papel_do_nivel()` — a mesma função que os grupos já
-- usam desde a 014.
--
-- Assim a função é dado (pode nascer, ser renomeada e morrer) e a autorização
-- continua sendo enum (as policies não mudam uma linha). Quem cria "Diretoria"
-- no nível 20 ganha um rótulo novo com as permissões de Gestor, e nada em RLS
-- precisa saber que "Diretoria" existe.

-- ------------------------------------------------------------
-- 1. O catálogo de funções
-- ------------------------------------------------------------

create table if not exists public.funcoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  -- 1 a 99, menor = mais alto. Mesmo vocabulário de user_groups.nivel.
  nivel integer not null default 40,
  -- Derivado do nível por gatilho. Existe como coluna, e não como cálculo em
  -- cada consulta, porque é ele que casa com profiles.role.
  papel_base user_role not null default 'requisitante',
  ativo boolean not null default true,
  -- As quatro originais: podem ser renomeadas, nunca excluídas nem movidas de
  -- nível. Sem isso, apagar "Super Admin" deixaria o sistema sem quem o
  -- administre, e nenhuma tela teria como desfazer.
  sistema boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.funcoes is
  'Funções do sistema. O nível (1-99, menor = mais alto) define a hierarquia e, por ele, o papel herdado. Cargo é o que a pessoa faz; função é o que ela é na hierarquia; grupo é o que ela pode.';

comment on column public.funcoes.nivel is
  'Hierarquia: 1 é o topo, 99 a base. Mesma escala de user_groups.nivel, de propósito — duas escalas diferentes para a mesma pergunta divergiriam.';

comment on column public.funcoes.papel_base is
  'Papel do enum user_role de onde a função herda permissões. Calculado do nível por gatilho: não se grava à mão.';

do $$
begin
  alter table public.funcoes drop constraint if exists funcoes_nivel_check;
  alter table public.funcoes add constraint funcoes_nivel_check
    check (nivel between 1 and 99);
end $$;

create index if not exists funcoes_nivel_idx on public.funcoes (nivel);
create index if not exists funcoes_ativo_idx on public.funcoes (ativo, nivel);

-- ------------------------------------------------------------
-- 2. O papel é consequência do nível
-- ------------------------------------------------------------

create or replace function public.funcoes_projeta_papel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.papel_base := public.papel_do_nivel(new.nivel)::user_role;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.funcoes_projeta_papel is
  'Mantém papel_base coerente com o nível. Sem isto seria possível cadastrar uma função de nível 10 herdando permissões de requisitante — e a regra de "quem edita quem" passaria a ver como superior alguém sem poder nenhum.';

drop trigger if exists funcoes_projeta_papel on public.funcoes;
create trigger funcoes_projeta_papel
  before insert or update on public.funcoes
  for each row execute function public.funcoes_projeta_papel();

-- ------------------------------------------------------------
-- 3. As quatro de sistema são intocáveis no que importa
-- ------------------------------------------------------------

create or replace function public.funcoes_protege_sistema()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception 'A função "%" é do sistema e não pode ser excluída.', old.nome;
    end if;
    return old;
  end if;

  if old.sistema then
    if new.nivel is distinct from old.nivel then
      raise exception 'A função "%" é do sistema: o nível hierárquico dela não muda.', old.nome;
    end if;
    if new.sistema is distinct from old.sistema then
      raise exception 'A marca de sistema não se remove.';
    end if;
    if not new.ativo then
      raise exception 'A função "%" é do sistema e não pode ser desativada.', old.nome;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists funcoes_protege_sistema on public.funcoes;
create trigger funcoes_protege_sistema
  before update or delete on public.funcoes
  for each row execute function public.funcoes_protege_sistema();

-- ------------------------------------------------------------
-- 4. As quatro originais
-- ------------------------------------------------------------

insert into public.funcoes (nome, descricao, nivel, sistema) values
  ('Super Admin',   'Administra o sistema inteiro, inclusive outros administradores.', 10, true),
  ('Gestor',        'Gere estoque, GED, protocolos, usuários e departamentos.',        20, true),
  ('Almoxarife',    'Opera o estoque e trabalha os documentos do GED.',                30, true),
  ('Requisitante',  'Consulta o estoque e registra pedidos e sugestões.',              40, true)
on conflict (nome) do update
  set descricao = excluded.descricao,
      sistema   = true;

alter table public.funcoes enable row level security;

drop policy if exists "Funcoes: leitura autenticada" on public.funcoes;
create policy "Funcoes: leitura autenticada"
  on public.funcoes for select
  to authenticated
  using (true);

drop policy if exists "Funcoes: gestão administra" on public.funcoes;
create policy "Funcoes: gestão administra"
  on public.funcoes for all
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ------------------------------------------------------------
-- 5. A pessoa tem uma função
-- ------------------------------------------------------------

alter table profiles
  add column if not exists funcao_id uuid references public.funcoes(id) on delete set null;

comment on column profiles.funcao_id is
  'Função da pessoa. `on delete set null`: excluir uma função não pode tirar o acesso de ninguém — o papel já gravado em profiles.role continua valendo.';

create index if not exists profiles_funcao_idx on profiles (funcao_id);

-- Quem já existe recebe a função equivalente ao papel que tem hoje.
update profiles p
   set funcao_id = f.id
  from public.funcoes f
 where p.funcao_id is null
   and f.sistema
   and f.papel_base = p.role;

-- ------------------------------------------------------------
-- 6. Trocar a função projeta o papel
--
-- Mesmo desenho do gatilho de grupo da 014: projeta SÓ quando a função muda.
-- Projetar em toda atualização apagaria "Tornar super admin", que grava o papel
-- por outro caminho.
--
-- O nome começa com "y" para rodar DEPOIS de profiles_x_projeta_papel: quando
-- alguém troca função e grupo na mesma gravação, a função é a intenção
-- explícita — é o campo que a tela edita — e por isso é ela quem decide.
-- ------------------------------------------------------------

create or replace function public.profiles_projeta_funcao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_papel user_role;
begin
  if new.funcao_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.funcao_id is not distinct from old.funcao_id then
    return new;
  end if;

  select papel_base into v_papel from public.funcoes where id = new.funcao_id;
  if v_papel is null then
    return new;
  end if;

  new.role := v_papel;
  return new;
end;
$$;

drop trigger if exists profiles_y_projeta_funcao on profiles;
create trigger profiles_y_projeta_funcao
  before insert or update on profiles
  for each row execute function public.profiles_projeta_funcao();

-- ------------------------------------------------------------
-- 7. O nível hierárquico de uma pessoa, em um lugar só
--
-- Quem tem função usa o nível dela; quem ainda não tem cai no nível do grupo;
-- sem grupo, no nível equivalente ao papel. Nunca devolve nulo: uma comparação
-- de hierarquia com lado nulo é uma comparação que não acontece, e a regra de
-- "quem pode editar quem" falharia aberta.
-- ------------------------------------------------------------

create or replace function public.nivel_do_usuario(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select f.nivel from profiles p join public.funcoes f on f.id = p.funcao_id where p.id = p_user),
    (select g.nivel from profiles p join user_groups  g on g.id = p.group_id  where p.id = p_user),
    (select case p.role::text
              when 'super_admin'  then 10
              when 'gestor'       then 20
              when 'almoxarife'   then 30
              else 40
            end
       from profiles p where p.id = p_user),
    99
  );
$$;

comment on function public.nivel_do_usuario is
  'Nível hierárquico efetivo: função, senão grupo, senão papel. Nunca nulo — hierarquia indefinida vira a base da escala, não permissão.';

grant execute on function public.nivel_do_usuario(uuid) to authenticated;
