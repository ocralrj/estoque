-- ============================================================
-- SCHEMA: Sugestões de Melhoria - OCRAL
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- Status do pedido de melhoria
do $$ begin
  create type suggestion_status as enum (
    'rascunho',
    'enviada',
    'em_analise',
    'planejada',
    'em_andamento',
    'concluida',
    'recusada'
  );
exception when duplicate_object then null;
end $$;

-- Prioridade sugerida (pelo autor ou revisor)
do $$ begin
  create type suggestion_priority as enum (
    'baixa',
    'media',
    'alta'
  );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- TABELA: improvement_suggestions
-- ============================================================
create table if not exists improvement_suggestions (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  raw_idea text not null,
  summary text not null,
  what_wanted text,
  why_wanted text,
  conversation jsonb not null default '[]'::jsonb,
  status suggestion_status not null default 'enviada',
  priority suggestion_priority not null default 'media',
  module_hint text,
  admin_notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suggestions_user on improvement_suggestions(user_id);
create index if not exists idx_suggestions_status on improvement_suggestions(status);
create index if not exists idx_suggestions_created on improvement_suggestions(created_at desc);

-- Código sequencial SUG-YYYYMMDD-####
create or replace function generate_suggestion_code()
returns trigger as $$
declare
  today text := to_char(now(), 'YYYYMMDD');
  seq integer;
begin
  select count(*) + 1 into seq
  from improvement_suggestions
  where code like 'SUG-' || today || '-%';

  new.code := 'SUG-' || today || '-' || lpad(seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists suggestions_generate_code on improvement_suggestions;
create trigger suggestions_generate_code
  before insert on improvement_suggestions
  for each row
  when (new.code is null or new.code = '')
  execute function generate_suggestion_code();

drop trigger if exists suggestions_updated_at on improvement_suggestions;
create trigger suggestions_updated_at
  before update on improvement_suggestions
  for each row execute function update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table improvement_suggestions enable row level security;

-- Helper role (se ainda não existir — idempotente com fix_rls)
create or replace function public.get_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "Usuário vê suas sugestões" on improvement_suggestions;
create policy "Usuário vê suas sugestões"
  on improvement_suggestions for select
  using (auth.uid() = user_id);

drop policy if exists "Admin e gestor veem todas sugestões" on improvement_suggestions;
create policy "Admin e gestor veem todas sugestões"
  on improvement_suggestions for select
  using (public.get_user_role() in ('super_admin', 'gestor'));

drop policy if exists "Usuário autenticado cria sugestão" on improvement_suggestions;
create policy "Usuário autenticado cria sugestão"
  on improvement_suggestions for insert
  with check (auth.uid() = user_id and auth.role() = 'authenticated');

drop policy if exists "Usuário atualiza própria rascunho/enviada" on improvement_suggestions;
create policy "Usuário atualiza própria rascunho/enviada"
  on improvement_suggestions for update
  using (
    auth.uid() = user_id
    and status in ('rascunho', 'enviada')
  )
  with check (auth.uid() = user_id);

drop policy if exists "Admin e gestor atualizam qualquer sugestão" on improvement_suggestions;
create policy "Admin e gestor atualizam qualquer sugestão"
  on improvement_suggestions for update
  using (public.get_user_role() in ('super_admin', 'gestor'));

drop policy if exists "Usuário cancela própria enviada" on improvement_suggestions;
create policy "Usuário cancela própria enviada"
  on improvement_suggestions for delete
  using (
    auth.uid() = user_id
    and status in ('rascunho', 'enviada')
  );

comment on table improvement_suggestions is
  'Pedidos de melhoria enviados por qualquer usuário. A IA só clarifica o texto; a decisão de implementação fica com a equipe.';
