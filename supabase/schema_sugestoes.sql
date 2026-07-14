-- ============================================================
-- SCHEMA: Sugestões de Melhoria - OCRAL
-- Execute no Supabase Dashboard → SQL Editor → Run
-- Projeto: https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql/new
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Função updated_at (idempotente)
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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

-- Prioridade sugerida
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
create table if not exists public.improvement_suggestions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
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
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suggestions_user on public.improvement_suggestions(user_id);
create index if not exists idx_suggestions_status on public.improvement_suggestions(status);
create index if not exists idx_suggestions_created on public.improvement_suggestions(created_at desc);

-- Código sequencial SUG-YYYYMMDD-#### (só se code vazio)
create or replace function public.generate_suggestion_code()
returns trigger as $$
declare
  today text := to_char(now(), 'YYYYMMDD');
  seq integer;
begin
  if new.code is not null and length(trim(new.code)) > 0 then
    return new;
  end if;

  select count(*) + 1 into seq
  from public.improvement_suggestions
  where code like 'SUG-' || today || '-%';

  new.code := 'SUG-' || today || '-' || lpad(seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists suggestions_generate_code on public.improvement_suggestions;
create trigger suggestions_generate_code
  before insert on public.improvement_suggestions
  for each row
  execute function public.generate_suggestion_code();

drop trigger if exists suggestions_updated_at on public.improvement_suggestions;
create trigger suggestions_updated_at
  before update on public.improvement_suggestions
  for each row execute function public.update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.improvement_suggestions enable row level security;

-- Helper role (SECURITY DEFINER evita recursão)
create or replace function public.get_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "Usuário vê suas sugestões" on public.improvement_suggestions;
create policy "Usuário vê suas sugestões"
  on public.improvement_suggestions for select
  using (auth.uid() = user_id);

drop policy if exists "Admin e gestor veem todas sugestões" on public.improvement_suggestions;
create policy "Admin e gestor veem todas sugestões"
  on public.improvement_suggestions for select
  using (public.get_user_role() in ('super_admin', 'gestor'));

drop policy if exists "Usuário autenticado cria sugestão" on public.improvement_suggestions;
create policy "Usuário autenticado cria sugestão"
  on public.improvement_suggestions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza própria rascunho/enviada" on public.improvement_suggestions;
create policy "Usuário atualiza própria rascunho/enviada"
  on public.improvement_suggestions for update
  using (
    auth.uid() = user_id
    and status in ('rascunho', 'enviada')
  )
  with check (auth.uid() = user_id);

drop policy if exists "Admin e gestor atualizam qualquer sugestão" on public.improvement_suggestions;
create policy "Admin e gestor atualizam qualquer sugestão"
  on public.improvement_suggestions for update
  using (public.get_user_role() in ('super_admin', 'gestor'));

drop policy if exists "Usuário cancela própria enviada" on public.improvement_suggestions;
create policy "Usuário cancela própria enviada"
  on public.improvement_suggestions for delete
  using (
    auth.uid() = user_id
    and status in ('rascunho', 'enviada')
  );

-- Expor no schema cache do PostgREST (evita "Could not find the table in schema cache")
notify pgrst, 'reload schema';

comment on table public.improvement_suggestions is
  'Pedidos de melhoria enviados por qualquer usuário. A IA só clarifica o texto; a decisão de implementação fica com a equipe.';
