-- ============================================================
-- Cadastro vira pedido de acesso, com gestor por departamento
--
-- Idempotente. Depende de: 027_gatilhos_de_produto.sql
-- ============================================================

-- PROBLEMA
-- A tela de cadastro pede uma senha e cria a conta na hora. Isso é o contrário
-- do que o próprio aviso dela diz — "o acesso é por convite" — e abre o
-- sistema para quem souber o endereço: qualquer pessoa se cadastra e entra.
--
-- Além disso, ninguém responde por um departamento. Não há a quem avisar
-- quando alguém daquela área pede acesso, e a decisão sobe para o
-- administrador, que não sabe quem é quem em cada setor.
--
-- CORREÇÃO
-- Quem chega escolhe o departamento em vez da senha. O pedido vai para o
-- gestor daquele departamento, que decide e dispara o convite com a senha
-- provisória. A conta só passa a existir depois disso.

-- ------------------------------------------------------------
-- 1. Cada departamento tem um responsável
-- ------------------------------------------------------------

alter table departamentos
  add column if not exists gestor_id uuid references profiles(id) on delete set null;

comment on column departamentos.gestor_id is
  'Quem responde pelo departamento e recebe os pedidos de acesso dele. Sem gestor definido, o pedido vai para a administração — nunca fica sem destino.';

create index if not exists departamentos_gestor_idx
  on departamentos (gestor_id) where gestor_id is not null;

-- ------------------------------------------------------------
-- 2. O pedido de acesso
--
-- Tabela própria, e não uma conta desativada: quem pede ainda não é usuário do
-- sistema, e criar a conta antes da decisão deixaria contas fantasmas para
-- quem for recusado.
-- ------------------------------------------------------------

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  departamento text not null,
  mensagem text,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'recusado')),
  decidido_por uuid references profiles(id) on delete set null,
  decidido_em timestamptz,
  motivo_recusa text,
  created_at timestamptz not null default now()
);

create index if not exists access_requests_status_idx
  on public.access_requests (status, created_at desc);

-- Um pedido pendente por e-mail. Sem isto, recarregar a tela vira uma pilha de
-- pedidos iguais na fila de quem decide.
create unique index if not exists access_requests_email_pendente_idx
  on public.access_requests (lower(email)) where status = 'pendente';

alter table public.access_requests enable row level security;

-- Quem pede não tem sessão: a inserção precisa estar aberta. O que a protege é
-- o índice acima (um pendente por e-mail) e o fato de a linha não conceder
-- absolutamente nada — é um pedido, não um acesso.
drop policy if exists "Pedido de acesso: qualquer um pede" on public.access_requests;
create policy "Pedido de acesso: qualquer um pede"
  on public.access_requests for insert
  to anon, authenticated
  with check (status = 'pendente');

-- Ler e decidir é da gestão. Ninguém anônimo lê a fila: ela tem nome e e-mail
-- de quem pediu.
drop policy if exists "Pedido de acesso: leitura pela gestão" on public.access_requests;
create policy "Pedido de acesso: leitura pela gestão"
  on public.access_requests for select
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'));

drop policy if exists "Pedido de acesso: decisão pela gestão" on public.access_requests;
create policy "Pedido de acesso: decisão pela gestão"
  on public.access_requests for update
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ------------------------------------------------------------
-- 3. O pedido avisa quem responde pelo departamento
--
-- Sem gestor definido, vai para a administração. Um pedido sem destino é um
-- pedido que ninguém vê.
-- ------------------------------------------------------------

create or replace function public.notifica_pedido_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  destinos uuid[];
begin
  select case
    when d.gestor_id is not null then array[d.gestor_id]
    else public.ids_da_gestao()
  end into destinos
  from departamentos d
  where d.nome = new.departamento
  limit 1;

  destinos := coalesce(destinos, public.ids_da_gestao());

  insert into notifications (user_id, title, message, link, permissao, origem_id)
  select p.id,
         'Pedido de acesso ao sistema',
         new.nome || ' (' || new.email || ') pediu acesso pelo departamento '
           || new.departamento || '.',
         '/dashboard/admin/acessos',
         'admin:users:create',
         null
  from profiles p
  where p.id = any(destinos) and p.active = true;

  return new;
end;
$$;

drop trigger if exists pedido_de_acesso_notifica on public.access_requests;
create trigger pedido_de_acesso_notifica
  after insert on public.access_requests
  for each row execute function public.notifica_pedido_de_acesso();

revoke all on function public.notifica_pedido_de_acesso() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. A lista de departamentos precisa ser legível por quem ainda não entrou
--
-- A tela de pedido mostra os departamentos para escolher, e quem a usa não tem
-- sessão. Só nome e situação ficam visíveis — nada de quem criou ou quando.
-- ------------------------------------------------------------

create or replace view public.departamentos_publicos
with (security_invoker = false) as
  select nome from departamentos where ativo = true order by nome;

comment on view public.departamentos_publicos is
  'Apenas os nomes dos departamentos ativos, para a tela de pedido de acesso, que é usada por quem ainda não tem conta. Não expõe gestor, descrição nem datas.';

grant select on public.departamentos_publicos to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

-- Defina o gestor de cada departamento:
--   update departamentos set gestor_id = (select id from profiles where email = 'fulano@ocral.com.br')
--   where nome = 'DP';

-- Departamentos sem gestor (os pedidos deles vão para a administração):
--   select nome from departamentos where ativo and gestor_id is null;

-- Fila de pedidos:
--   select nome, email, departamento, status, created_at from access_requests
--   order by created_at desc;
