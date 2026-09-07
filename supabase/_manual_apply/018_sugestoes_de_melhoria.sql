-- ============================================================
-- Sugestões de melhoria: a tabela que nunca foi criada
--
-- Idempotente. Depende de: 017_coluna_avatar.sql
-- ============================================================

-- PROBLEMA
-- As telas "Minhas Sugestões" e "Administração → Sugestões" consultam
-- `improvement_suggestions`, e essa tabela não existe neste banco. O
-- schema_sugestoes.sql, que a cria, nunca foi aplicado — a auditoria tabela a
-- tabela mostrou que ele é o único dos cinco arquivos de schema que ficou de
-- fora.
--
-- O QUE FOI DEIXADO DE FORA DE PROPÓSITO
-- O arquivo original também redefine duas funções, e aplicá-lo inteiro
-- desfaria correções posteriores:
--
--   get_user_role() — a versão de lá é
--       `select role from profiles where id = auth.uid()`,
--     sem `and active = true`. A migração 010 acrescentou essa condição
--     justamente para que uma conta desativada deixe de ter papel e perca o
--     acesso pela API, mesmo com um token ainda válido. Reaplicar a versão
--     antiga devolveria o acesso a quem foi desativado, silenciosamente.
--
--   update_updated_at() — a versão de lá vem sem `set search_path`, que a
--     migração 016 acabou de fixar em todas as funções.
--
-- Nenhuma das duas é recriada aqui. Elas já existem, corretas.

-- ------------------------------------------------------------
-- 1. Tipos
-- ------------------------------------------------------------

do $$ begin
  create type suggestion_status as enum (
    'rascunho', 'enviada', 'em_analise', 'planejada',
    'em_andamento', 'concluida', 'recusada'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type suggestion_priority as enum ('baixa', 'media', 'alta');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- 2. A tabela
-- ------------------------------------------------------------

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

-- `create table if not exists` não acrescenta coluna a uma tabela que já
-- existe — foi assim que profiles.avatar_url ficou anos ausente enquanto o
-- arquivo do schema a declarava. Cada coluna é garantida uma a uma.
alter table public.improvement_suggestions
  add column if not exists what_wanted text,
  add column if not exists why_wanted text,
  add column if not exists module_hint text,
  add column if not exists admin_notes text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_suggestions_user
  on public.improvement_suggestions (user_id);
create index if not exists idx_suggestions_status
  on public.improvement_suggestions (status);
create index if not exists idx_suggestions_created
  on public.improvement_suggestions (created_at desc);

-- ------------------------------------------------------------
-- 3. Código sequencial SUG-AAAAMMDD-0001
-- ------------------------------------------------------------

create or replace function public.generate_suggestion_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  hoje text := to_char(now(), 'YYYYMMDD');
  seq integer;
begin
  if new.code is not null and length(trim(new.code)) > 0 then
    return new;
  end if;

  select count(*) + 1 into seq
  from public.improvement_suggestions
  where code like 'SUG-' || hoje || '-%';

  new.code := 'SUG-' || hoje || '-' || lpad(seq::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists suggestions_generate_code on public.improvement_suggestions;
create trigger suggestions_generate_code
  before insert on public.improvement_suggestions
  for each row execute function public.generate_suggestion_code();

drop trigger if exists suggestions_updated_at on public.improvement_suggestions;
create trigger suggestions_updated_at
  before update on public.improvement_suggestions
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 4. RLS
--
-- Quem envia vê e edita a própria sugestão enquanto ela não entrou em análise;
-- depois disso ela é registro da equipe, e mexer nela seria reescrever o que
-- já foi respondido. A gestão vê e responde todas.
-- ------------------------------------------------------------

alter table public.improvement_suggestions enable row level security;

drop policy if exists "Usuário vê suas sugestões" on public.improvement_suggestions;
create policy "Usuário vê suas sugestões"
  on public.improvement_suggestions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admin e gestor veem todas sugestões" on public.improvement_suggestions;
create policy "Admin e gestor veem todas sugestões"
  on public.improvement_suggestions for select
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'));

drop policy if exists "Usuário autenticado cria sugestão" on public.improvement_suggestions;
create policy "Usuário autenticado cria sugestão"
  on public.improvement_suggestions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza própria rascunho/enviada" on public.improvement_suggestions;
create policy "Usuário atualiza própria rascunho/enviada"
  on public.improvement_suggestions for update
  to authenticated
  using (auth.uid() = user_id and status in ('rascunho', 'enviada'))
  with check (auth.uid() = user_id);

drop policy if exists "Admin e gestor atualizam qualquer sugestão" on public.improvement_suggestions;
create policy "Admin e gestor atualizam qualquer sugestão"
  on public.improvement_suggestions for update
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

drop policy if exists "Usuário cancela própria enviada" on public.improvement_suggestions;
create policy "Usuário cancela própria enviada"
  on public.improvement_suggestions for delete
  to authenticated
  using (auth.uid() = user_id and status in ('rascunho', 'enviada'));

comment on table public.improvement_suggestions is
  'Pedidos de melhoria enviados por qualquer usuário. A IA só clarifica o texto; a decisão de implementação fica com a equipe.';

-- ------------------------------------------------------------
-- 5. O PostgREST precisa reler o esquema
-- ------------------------------------------------------------

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------

-- A tabela responde?
--   select count(*) from improvement_suggestions;

-- get_user_role continua barrando conta desativada? (deve conter "active")
--   select prosrc from pg_proc where proname = 'get_user_role';
