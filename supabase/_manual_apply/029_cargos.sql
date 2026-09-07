-- ============================================================
-- Cargos, e as pessoas de cada departamento
--
-- Idempotente. Depende de: 028_solicitacao_de_acesso.sql
-- ============================================================

-- PROBLEMA
-- O sistema sabe o que cada pessoa PODE fazer (o grupo, o nível, as
-- permissões) e onde ela trabalha (o departamento), mas não sabe o que ela FAZ.
-- São coisas diferentes: duas pessoas no mesmo grupo de permissões podem ser
-- uma auxiliar e uma coordenadora, e quem olha a lista não tem como distinguir.
--
-- Cargo não é permissão, e de propósito: misturar os dois faria toda promoção
-- virar uma mexida em segurança.

-- ------------------------------------------------------------
-- 1. A tabela de cargos
-- ------------------------------------------------------------

create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  ativo boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cargos is
  'O que a pessoa faz na empresa. Não concede acesso nenhum: quem decide o que ela pode é o grupo. Separados de propósito — misturados, toda promoção viraria uma mexida em segurança.';

create index if not exists cargos_ativo_idx on public.cargos (ativo, nome);

alter table public.cargos enable row level security;

-- Todo mundo lê: o cargo aparece ao lado do nome nas listas de equipe.
drop policy if exists "Cargos: leitura autenticada" on public.cargos;
create policy "Cargos: leitura autenticada"
  on public.cargos for select
  to authenticated
  using (true);

drop policy if exists "Cargos: gestão administra" on public.cargos;
create policy "Cargos: gestão administra"
  on public.cargos for all
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ------------------------------------------------------------
-- 2. A pessoa tem um cargo
-- ------------------------------------------------------------

alter table profiles
  add column if not exists cargo_id uuid references public.cargos(id) on delete set null;

comment on column profiles.cargo_id is
  'Cargo da pessoa. `on delete set null`: extinguir um cargo não pode apagar ninguém nem tirar acesso de quem o ocupava.';

create index if not exists profiles_cargo_idx on profiles (cargo_id) where cargo_id is not null;

-- Mexer no cargo alheio é da gestão, como o departamento e o grupo. Sem isto,
-- a política de auto-edição do perfil deixaria qualquer pessoa se promover a
-- Diretor na lista da equipe.
create or replace function public.profiles_protege_campos_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  papel text;
  nivel_de_quem_edita integer;
  nivel_alvo integer;
begin
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
    if new.cargo_id is distinct from old.cargo_id then
      raise exception 'Apenas a gestão define o cargo.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Apenas a gestão ativa ou desativa contas.';
    end if;
    if new.status is distinct from old.status then
      if not (
        old.status = 'ferias'
        and new.status = 'ativo'
        and old.retorno_previsto is not null
        and old.retorno_previsto <= (now() at time zone 'America/Sao_Paulo')::date
      ) then
        raise exception 'Apenas a gestão altera o status de acesso.';
      end if;
    end if;
    return new;
  end if;

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
-- 3. O catálogo passa a conhecer cargos
--
-- Sem isto a tela existiria e nenhum grupo poderia recebê-la — foi o que
-- aconteceu com os certificados, que estão no catálogo e não têm tela.
-- ------------------------------------------------------------

insert into permissions (module, resource, action, description) values
  ('admin', 'cargos', 'read',   'Ver cargos'),
  ('admin', 'cargos', 'create', 'Criar cargos'),
  ('admin', 'cargos', 'update', 'Editar cargos'),
  ('admin', 'cargos', 'delete', 'Excluir cargos')
on conflict (module, resource, action) do nothing;

-- Quem já administra usuários passa a administrar cargos: é a mesma pessoa
-- fazendo a mesma coisa, e deixá-la sem a permissão nova esconderia a tela de
-- quem acabou de pedi-la.
insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g
cross join permissions p
where p.module = 'admin' and p.resource = 'cargos'
  and exists (
    select 1 from group_permissions gp
    join permissions pu on pu.id = gp.permission_id
    where gp.group_id = g.id
      and pu.module = 'admin' and pu.resource = 'users' and pu.action = 'update'
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 4. updated_at
-- ------------------------------------------------------------

drop trigger if exists cargos_updated_at on public.cargos;
create trigger cargos_updated_at
  before update on public.cargos
  for each row execute function public.update_updated_at();

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

-- Pessoas por departamento, com cargo:
--   select p.departamento, coalesce(c.nome, 'sem cargo') as cargo,
--          coalesce(p.full_name, p.email) as pessoa
--   from profiles p left join cargos c on c.id = p.cargo_id
--   where p.active order by p.departamento, c.nome;
