-- ============================================================
-- SCHEMA: Sistema de Certificados Digitais - OCRAL
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- Extensões necessárias
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM: roles de usuário
-- ============================================================
create type user_role as enum ('super_admin', 'gestor', 'uploader', 'viewer');

-- ============================================================
-- TABELA: profiles (estende auth.users do Supabase)
-- ============================================================
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null unique,
  full_name text,
  role user_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: groups (grupos de acesso)
-- ============================================================
create table groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: group_members (usuários em grupos)
-- ============================================================
create table group_members (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  added_by uuid references profiles(id),
  added_at timestamptz not null default now(),
  unique(group_id, user_id)
);

-- ============================================================
-- TABELA: certificates (metadados dos certificados)
-- ============================================================
create table certificates (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  issuer text not null,
  issued_to text not null,
  issued_date date not null,
  expiry_date date,
  category text,
  tags text[],
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references profiles(id) not null,
  is_expired boolean generated always as (
    expiry_date is not null and expiry_date < current_date
  ) stored,
  created_at timestamptz not null default now()
  -- imutável: sem updated_at por design
);

-- ============================================================
-- TABELA: certificate_access (quais grupos podem acessar)
-- ============================================================
create table certificate_access (
  id uuid primary key default uuid_generate_v4(),
  certificate_id uuid references certificates(id) on delete cascade not null,
  group_id uuid references groups(id) on delete cascade not null,
  granted_by uuid references profiles(id) not null,
  granted_at timestamptz not null default now(),
  unique(certificate_id, group_id)
);

-- ============================================================
-- TABELA: download_logs (auditoria de downloads)
-- ============================================================
create table download_logs (
  id uuid primary key default uuid_generate_v4(),
  certificate_id uuid references certificates(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  downloaded_at timestamptz not null default now(),
  ip_address text
);

-- ============================================================
-- FUNÇÃO: criar profile automaticamente ao registrar usuário
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.email = 'administrador@ocral.com.br' then 'super_admin'::user_role
      else 'viewer'::user_role
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================================
-- RLS: habilitar em todas as tabelas
-- ============================================================
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table certificates enable row level security;
alter table certificate_access enable row level security;
alter table download_logs enable row level security;

-- ============================================================
-- RLS POLICIES: profiles
-- ============================================================
create policy "Usuário vê seu próprio perfil"
  on profiles for select
  using (auth.uid() = id);

create policy "Super admin vê todos os perfis"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy "Super admin atualiza qualquer perfil"
  on profiles for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy "Usuário atualiza seu próprio perfil"
  on profiles for update
  using (auth.uid() = id)
  with check (role = (select role from profiles where id = auth.uid()));

-- ============================================================
-- RLS POLICIES: groups
-- ============================================================
create policy "Usuários autenticados veem grupos"
  on groups for select
  using (auth.role() = 'authenticated');

create policy "Super admin e gestor criam grupos"
  on groups for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

create policy "Super admin e gestor atualizam grupos"
  on groups for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

-- ============================================================
-- RLS POLICIES: group_members
-- ============================================================
create policy "Usuários veem membros dos seus grupos"
  on group_members for select
  using (auth.role() = 'authenticated');

create policy "Gestor e super admin gerenciam membros"
  on group_members for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

create policy "Gestor e super admin removem membros"
  on group_members for delete
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

-- ============================================================
-- RLS POLICIES: certificates
-- ============================================================
create policy "Uploader vê seus próprios certificados"
  on certificates for select
  using (uploaded_by = auth.uid());

create policy "Super admin e gestor veem todos os certificados"
  on certificates for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

create policy "Viewer vê certificados autorizados e não expirados"
  on certificates for select
  using (
    not is_expired and
    exists (
      select 1
      from certificate_access ca
      join group_members gm on gm.group_id = ca.group_id
      where ca.certificate_id = certificates.id
        and gm.user_id = auth.uid()
    )
  );

create policy "Uploader insere certificados"
  on certificates for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'uploader')
    )
  );

-- Sem UPDATE nem DELETE: certificados são imutáveis

-- ============================================================
-- RLS POLICIES: certificate_access
-- ============================================================
create policy "Gestor e super admin gerenciam acessos"
  on certificate_access for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

create policy "Gestor e super admin removem acessos"
  on certificate_access for delete
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

create policy "Usuários autenticados veem acessos"
  on certificate_access for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- RLS POLICIES: download_logs
-- ============================================================
create policy "Usuário vê seus próprios downloads"
  on download_logs for select
  using (user_id = auth.uid());

create policy "Super admin e gestor veem todos os downloads"
  on download_logs for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

create policy "Sistema insere logs de download"
  on download_logs for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE: bucket para certificados
-- Execute separadamente no Supabase Dashboard → Storage
-- ============================================================
-- insert into storage.buckets (id, name, public)
-- values ('certificates', 'certificates', false);

-- Storage policy: uploader pode fazer upload
-- create policy "Uploader faz upload"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'certificates' and
--     exists (
--       select 1 from profiles p
--       where p.id = auth.uid() and p.role in ('super_admin', 'uploader')
--     )
--   );

-- Storage policy: viewer autorizado pode baixar
-- create policy "Viewer autorizado baixa"
--   on storage.objects for select
--   using (
--     bucket_id = 'certificates' and
--     exists (
--       select 1
--       from certificates c
--       join certificate_access ca on ca.certificate_id = c.id
--       join group_members gm on gm.group_id = ca.group_id
--       where c.file_path = storage.objects.name
--         and gm.user_id = auth.uid()
--         and not c.is_expired
--     )
--   );
