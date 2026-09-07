-- ============================================================
-- Autorização por grupo e hierarquia
--
-- Idempotente. Depende de: 013_status_usuario.sql
-- ============================================================

-- PROBLEMA
-- O sistema tem dois mecanismos de autorização, e só um funciona.
--
-- O que funciona é o papel (super_admin, gestor, almoxarife, requisitante):
-- está em 36 políticas RLS, em todos os guardas de página e em todas as Server
-- Actions. O que não funciona são os grupos: as tabelas existem, há tela para
-- administrá-los, o catálogo tem 38 permissões e a função user_has_permission()
-- está no banco — mas nada no aplicativo as consulta. Tirar "excluir
-- documentos" de um grupo hoje não muda nada; o usuário continua excluindo.
--
-- CORREÇÃO
-- O grupo passa a ser a fonte única de autorização, com hierarquia:
--
--   profiles.group_id -> user_groups.nivel -> papel (projetado por gatilho)
--                     -> group_permissions -> permissions (controle fino)
--
-- O papel deixa de ser digitado à mão e passa a ser PROJEÇÃO do nível do grupo.
-- Assim as 36 políticas RLS continuam valendo, sem reescrita, como defesa em
-- profundidade — e a autorização fina passa a ser consultada de verdade pela
-- aplicação, que é o que faltava.
--
-- Nada é removido: quem já está cadastrado é migrado para o grupo equivalente
-- ao papel que tem hoje, e continua com o mesmo acesso.

-- ------------------------------------------------------------
-- 1. Hierarquia dos grupos
--
-- Número menor = mais poder, como em "nível 1 da empresa". A faixa vai até 99
-- para caber níveis intermediários criados depois sem renumerar os existentes.
-- ------------------------------------------------------------

alter table user_groups add column if not exists nivel integer not null default 40;
alter table user_groups add column if not exists sistema boolean not null default false;

comment on column user_groups.nivel is
  'Nível hierárquico: menor = mais poder. 10 Administrador, 20 Gestor, 30 Supervisor, 40 Operador. A faixa é larga de propósito, para caber níveis intermediários sem renumerar os existentes.';
comment on column user_groups.sistema is
  'true nos quatro grupos que sustentam a hierarquia base. Eles não podem ser excluídos: sem eles não há para onde projetar o papel.';

do $$ begin
  alter table user_groups drop constraint if exists user_groups_nivel_check;
  alter table user_groups add constraint user_groups_nivel_check
    check (nivel between 1 and 99);
end $$;

create index if not exists user_groups_nivel_idx on user_groups (nivel);

-- ------------------------------------------------------------
-- 2. O papel passa a ser projeção do nível
-- ------------------------------------------------------------

create or replace function public.papel_do_nivel(p_nivel integer)
returns text
language sql
immutable
as $$
  select case
    when p_nivel <= 10 then 'super_admin'
    when p_nivel <= 20 then 'gestor'
    when p_nivel <= 30 then 'almoxarife'
    else 'requisitante'
  end;
$$;

comment on function public.papel_do_nivel is
  'Converte o nível hierárquico do grupo no papel que a RLS já conhece. É a ponte que permite trocar a autorização da aplicação sem reescrever 36 políticas.';

-- ------------------------------------------------------------
-- 3. Grupos base, um por nível da hierarquia
-- ------------------------------------------------------------

insert into user_groups (name, description, nivel, sistema) values
  ('Administradores', 'Acesso total ao sistema, inclusive à administração de grupos e permissões', 10, true),
  ('Gestores',       'Gestão do acervo, do estoque e das pessoas, sem administrar permissões',      20, true),
  ('Supervisores',   'Opera estoque e GED, sem funções administrativas',                            30, true),
  ('Operadores',     'Consulta e registra o próprio trabalho',                                      40, true)
on conflict (name) do update
  set nivel = excluded.nivel,
      sistema = true,
      description = excluded.description;

-- A semeadura anterior criou "Almoxarifes" e "Requisitantes", que não fazem
-- parte da hierarquia base mas podem já ter gente dentro. Ganham o nível
-- equivalente em vez de virarem grupos órfãos no nível mais baixo.
-- ("Gestores" já é tratado acima, pelo próprio insert.)
update user_groups set nivel = 30 where name = 'Almoxarifes'   and not sistema;
update user_groups set nivel = 40 where name = 'Requisitantes' and not sistema;

-- ------------------------------------------------------------
-- 4. Cada usuário pertence a um grupo
--
-- Um grupo principal, e não a lista de group_members: é preciso haver uma
-- resposta única para "qual é o nível desta pessoa", senão a projeção do papel
-- seria ambígua. group_members continua existindo para agrupamentos avulsos.
-- ------------------------------------------------------------

alter table profiles add column if not exists group_id uuid references user_groups(id) on delete set null;

comment on column profiles.group_id is
  'Grupo principal. Define o nível hierárquico da pessoa, o papel projetado a partir dele e as permissões finas que ela recebe.';

create index if not exists profiles_group_id_idx on profiles (group_id);

-- Migração: cada pessoa entra no grupo equivalente ao papel que já tem, para
-- que ninguém ganhe nem perca acesso nesta mudança.
update profiles p
set group_id = g.id
from user_groups g
where p.group_id is null
  and g.sistema
  and g.nivel = case p.role::text
    when 'super_admin'  then 10
    when 'gestor'       then 20
    when 'almoxarife'   then 30
    else 40
  end;

-- ------------------------------------------------------------
-- 5. Projeção do papel, e a trava contra escalada
-- ------------------------------------------------------------

create or replace function public.profiles_projeta_papel()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nivel integer;
begin
  if new.group_id is null then
    return new;
  end if;

  -- Projeta SÓ quando o grupo muda.
  --
  -- Projetar em toda atualização parece mais coerente, mas apagaria qualquer
  -- mudança de papel feita por outro caminho: "Tornar super admin" grava o
  -- papel direto, e o gatilho o sobrescreveria de volta ao nível do grupo — a
  -- promoção não faria nada, sem erro nenhum na tela. Enquanto a aplicação não
  -- passar a promover trocando o grupo, os dois caminhos precisam conviver.
  if tg_op = 'UPDATE' and new.group_id is not distinct from old.group_id then
    return new;
  end if;

  select nivel into v_nivel from user_groups where id = new.group_id;
  if v_nivel is null then
    return new;
  end if;

  new.role := public.papel_do_nivel(v_nivel)::user_role;
  return new;
end;
$$;

-- O nome começa com "x" para que este gatilho rode DEPOIS de
-- profiles_protege_acesso: a proteção precisa julgar a intenção de quem editou
-- (a troca de grupo), e não a consequência automática dela (a troca de papel).
drop trigger if exists profiles_x_projeta_papel on profiles;
create trigger profiles_x_projeta_papel
  before insert or update on profiles
  for each row execute function public.profiles_projeta_papel();

-- A proteção ganha o grupo: sem isto, a política "Usuário atualiza seu próprio
-- perfil" deixaria qualquer pessoa se mudar para o grupo Administradores, que
-- agora é o caminho direto para o papel super_admin.
create or replace function public.profiles_protege_campos_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  papel text;
  nivel_de_quem_edita integer;
  nivel_alvo integer;
begin
  -- Sem sessão é a chave de serviço agindo no servidor (pré-cadastro), que já
  -- passou pela checagem de papel na aplicação.
  if auth.uid() is null then
    return new;
  end if;

  papel := public.get_user_role()::text;

  if papel not in ('super_admin', 'gestor') then
    if new.role is distinct from old.role then
      raise exception 'Apenas a gestão altera papéis.';
    end if;
    if new.group_id is distinct from old.group_id then
      raise exception 'Apenas a gestão altera o grupo de uma pessoa.';
    end if;
    if new.departamento is distinct from old.departamento then
      raise exception 'Apenas a gestão define o departamento.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Apenas a gestão ativa ou desativa contas.';
    end if;
    if new.status is distinct from old.status then
      if not (
        old.status = 'ferias'
        and new.status = 'ativo'
        and old.retorno_previsto is not null
        and old.retorno_previsto <= current_date
      ) then
        raise exception 'Apenas a gestão altera o status de acesso.';
      end if;
    end if;
    return new;
  end if;

  -- Gestão não promove ninguém acima de si mesma. Sem esta trava, o gestor
  -- moveria alguém (ou a si próprio) para o grupo Administradores e ganharia o
  -- papel máximo do sistema por um caminho lateral.
  if new.group_id is distinct from old.group_id and new.group_id is not null then
    select nivel into nivel_alvo from user_groups where id = new.group_id;
    select g.nivel into nivel_de_quem_edita
      from profiles p join user_groups g on g.id = p.group_id
      where p.id = auth.uid();

    if nivel_alvo is not null
       and nivel_de_quem_edita is not null
       and nivel_alvo < nivel_de_quem_edita then
      raise exception 'Você não pode mover alguém para um grupo acima do seu.';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 6. O catálogo passa a cobrir o sistema inteiro
--
-- O catálogo anterior parou no que existia quando foi escrito: não conhece
-- departamentos, protocolos, sugestões, busca, auditoria do GED nem os verbos
-- de exportar, importar e imprimir que a especificação pede. Uma permissão que
-- não existe no catálogo não pode ser concedida nem exigida.
--
-- Vocabulário de ações:
--   read     listar e abrir detalhes
--   create   incluir
--   update   alterar
--   delete   excluir
--   export   baixar em planilha ou CSV
--   print    gerar versão para impressão
--   import   carregar em lote
--   upload   anexar arquivo
--   download baixar arquivo
--   manage   ações próprias do recurso (responder, aprovar, configurar)
-- ------------------------------------------------------------

insert into permissions (module, resource, action, description) values
  -- Estoque
  ('estoque', 'products',    'export',   'Exportar produtos'),
  ('estoque', 'products',    'print',    'Imprimir produtos'),
  ('estoque', 'products',    'import',   'Importar produtos em lote'),
  ('estoque', 'movements',   'update',   'Editar movimentações'),
  ('estoque', 'movements',   'export',   'Exportar movimentações'),
  ('estoque', 'movements',   'print',    'Imprimir movimentações'),
  ('estoque', 'alerts',      'read',     'Ver alertas de estoque baixo'),
  ('estoque', 'reports',     'export',   'Exportar relatórios de estoque'),
  ('estoque', 'reports',     'print',    'Imprimir relatórios de estoque'),

  -- GED
  ('ged', 'documents', 'export',  'Exportar a listagem de documentos'),
  ('ged', 'documents', 'print',   'Imprimir a listagem de documentos'),
  ('ged', 'documents', 'manage',  'Definir quem lê e quem altera cada documento'),
  ('ged', 'search',    'read',    'Usar a busca do acervo'),
  ('ged', 'audit',     'read',    'Ver a auditoria de um documento'),
  ('ged', 'retention', 'manage',  'Definir temporalidade e descarte'),

  -- Protocolos
  ('protocolos', 'protocolos', 'read',   'Ver protocolos'),
  ('protocolos', 'protocolos', 'create', 'Abrir protocolos'),
  ('protocolos', 'protocolos', 'update', 'Editar protocolos'),
  ('protocolos', 'protocolos', 'delete', 'Excluir protocolos'),
  ('protocolos', 'protocolos', 'manage', 'Encaminhar e concluir protocolos'),
  ('protocolos', 'protocolos', 'export', 'Exportar protocolos'),
  ('protocolos', 'protocolos', 'print',  'Imprimir protocolos'),

  -- Sugestões
  ('sugestoes', 'minhas',  'read',   'Ver as próprias sugestões'),
  ('sugestoes', 'minhas',  'create', 'Enviar sugestões'),
  ('sugestoes', 'todas',   'read',   'Ver as sugestões de todos'),
  ('sugestoes', 'todas',   'manage', 'Responder e priorizar sugestões'),

  -- Administração
  ('admin', 'departamentos', 'read',   'Ver departamentos'),
  ('admin', 'departamentos', 'create', 'Criar departamentos'),
  ('admin', 'departamentos', 'update', 'Editar departamentos'),
  ('admin', 'departamentos', 'delete', 'Excluir departamentos'),
  ('admin', 'users',         'manage', 'Definir situação, grupo e departamento'),
  ('admin', 'audit',         'export', 'Exportar a auditoria')
on conflict (module, resource, action) do nothing;

-- ------------------------------------------------------------
-- 7. O que cada grupo base recebe
--
-- Só semeia grupo que ainda não tem permissão nenhuma: quem já configurou as
-- suas não pode ser sobrescrito por esta migração.
-- ------------------------------------------------------------

-- Administradores: tudo.
insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g cross join permissions p
where g.name = 'Administradores'
  and not exists (select 1 from group_permissions x where x.group_id = g.id)
on conflict do nothing;

-- Gestores: tudo, menos administrar grupos e permissões.
insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g cross join permissions p
where g.name = 'Gestores'
  and not (p.module = 'admin' and p.resource in ('groups', 'permissions'))
  and not exists (select 1 from group_permissions x where x.group_id = g.id)
on conflict do nothing;

-- Supervisores: estoque e GED por inteiro, sem administração e sem excluir.
insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g cross join permissions p
where g.name = 'Supervisores'
  and p.module in ('estoque', 'ged', 'protocolos', 'sugestoes')
  and p.action <> 'delete'
  and not exists (select 1 from group_permissions x where x.group_id = g.id)
on conflict do nothing;

-- Operadores: consultam, registram o próprio trabalho, não excluem nada.
insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g cross join permissions p
where g.name = 'Operadores'
  and (
    (p.module = 'estoque'    and p.resource in ('products', 'alerts') and p.action = 'read')
    or (p.module = 'ged'      and p.action in ('read', 'download'))
    or (p.module = 'protocolos' and p.action in ('read', 'create'))
    or (p.module = 'sugestoes'  and p.resource = 'minhas')
  )
  and not exists (select 1 from group_permissions x where x.group_id = g.id)
on conflict do nothing;

-- ------------------------------------------------------------
-- 8. As permissões da própria sessão, em uma consulta
--
-- Substitui get_user_permissions(p_user_id), que aceitava o id de qualquer
-- pessoa e por isso deixava consultar as permissões alheias. Esta lê apenas
-- auth.uid(): não há parâmetro para manipular.
-- ------------------------------------------------------------

create or replace function public.minhas_permissoes()
returns table (module text, resource text, action text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct p.module, p.resource, p.action
  from profiles perfil
  join group_permissions gp on gp.group_id = perfil.group_id
  join permissions p on p.id = gp.permission_id
  where perfil.id = auth.uid()
    and perfil.active = true
  union
  -- O administrador não depende do catálogo estar completo para administrar:
  -- se uma permissão nova for criada e ninguém a conceder, ele ainda precisa
  -- alcançar a tela que a concede.
  select p.module, p.resource, p.action
  from permissions p
  where public.get_user_role()::text = 'super_admin';
$$;

comment on function public.minhas_permissoes is
  'Permissões da sessão atual, vindas do grupo principal. Lê apenas auth.uid(): não recebe id de terceiro.';

-- ------------------------------------------------------------
-- 9. Nível hierárquico da sessão, para as travas de escalada
-- ------------------------------------------------------------

create or replace function public.meu_nivel()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select g.nivel from profiles p join user_groups g on g.id = p.group_id
      where p.id = auth.uid() and p.active = true),
    99
  );
$$;

-- ------------------------------------------------------------
-- 10. Leitura do próprio grupo
--
-- A pessoa precisa enxergar o grupo a que pertence para a tela saber o que
-- esconder. As políticas antigas só liberavam gestão.
-- ------------------------------------------------------------

drop policy if exists "Vê o próprio grupo" on user_groups;
create policy "Vê o próprio grupo"
  on user_groups for select
  to authenticated
  using (
    id = (select group_id from profiles where id = auth.uid())
    or public.get_user_role()::text in ('super_admin', 'gestor')
  );

-- Grupo do sistema não se apaga: sem ele não há para onde projetar o papel, e
-- quem estivesse nele ficaria sem nível.
--
-- Isto é um gatilho, e não uma política. Políticas permissivas se somam com OU:
-- a política `user_groups_super_admin_all`, que já existe e vale FOR ALL,
-- continuaria autorizando a exclusão por conta própria, e uma política restritiva
-- ao lado dela não barraria nada. O gatilho barra.
create or replace function public.user_groups_protege_sistema()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sistema then
    raise exception 'O grupo "%" sustenta a hierarquia e não pode ser excluído. Mova as pessoas para outro grupo em vez disso.', old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists user_groups_nao_apaga_sistema on user_groups;
create trigger user_groups_nao_apaga_sistema
  before delete on user_groups
  for each row execute function public.user_groups_protege_sistema();

-- O nível de um grupo do sistema também não muda: ele é o que ancora a
-- projeção do papel.
create or replace function public.user_groups_protege_nivel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sistema and new.nivel is distinct from old.nivel then
    raise exception 'O nível do grupo "%" é fixo: ele ancora a projeção do papel.', old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists user_groups_nivel_fixo on user_groups;
create trigger user_groups_nivel_fixo
  before update on user_groups
  for each row execute function public.user_groups_protege_nivel();

-- ------------------------------------------------------------
-- 11. Conferência
-- ------------------------------------------------------------

-- Cada pessoa, seu grupo, nível e papel projetado:
--   select p.email, g.name, g.nivel, p.role
--   from profiles p left join user_groups g on g.id = p.group_id
--   order by g.nivel nulls last, p.email;

-- Quantas permissões cada grupo recebeu:
--   select g.name, g.nivel, count(gp.permission_id)
--   from user_groups g left join group_permissions gp on gp.group_id = g.id
--   group by g.name, g.nivel order by g.nivel;

-- Ninguém deve ficar sem grupo:
--   select email, role from profiles where group_id is null;
