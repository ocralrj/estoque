-- ============================================================
-- SCHEMA: Sistema de Controle de Estoque - OCRAL
-- Versão SEGURA - Verifica antes de criar
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- Extensões necessárias
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM: roles de usuário (só cria se não existir)
-- ============================================================
do $$ begin
  create type user_role as enum ('super_admin', 'gestor', 'almoxarife', 'requisitante');
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- TABELA: profiles (só cria se não existir)
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null unique,
  full_name text,
  role user_role not null default 'requisitante',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: categories (só cria se não existir)
-- ============================================================
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: products (só cria se não existir)
-- ============================================================
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  description text,
  category_id uuid references categories(id),
  unit text not null,
  quantity_current integer not null default 0,
  quantity_minimum integer not null default 0,
  location text,
  active boolean not null default true,
  is_low_stock boolean generated always as (
    quantity_current <= quantity_minimum
  ) stored,
  created_by uuid references profiles(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: movements (só cria se não existir)
-- ============================================================
create table if not exists movements (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade not null,
  type text not null check (type in ('entrada', 'saida')),
  quantity integer not null check (quantity > 0),
  reason text not null,
  notes text,
  previous_quantity integer not null,
  new_quantity integer not null,
  created_by uuid references profiles(id) not null,
  created_at timestamptz not null default now()
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
      when new.email in ('administrador@ocral.com.br', 'jadirconsult@gmail.com') then 'super_admin'::user_role
      else 'requisitante'::user_role
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Criar trigger (drop antes se já existir)
drop trigger if exists on_auth_user_created on auth.users;
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

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

drop trigger if exists products_updated_at on products;
create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

-- ============================================================
-- FUNÇÃO: atualizar estoque após movimentação
-- ============================================================
create or replace function update_product_quantity()
returns trigger as $$
declare
  current_qty integer;
begin
  select quantity_current into current_qty
  from products
  where id = new.product_id;

  new.previous_quantity := current_qty;

  if new.type = 'entrada' then
    new.new_quantity := current_qty + new.quantity;
  else
    new.new_quantity := current_qty - new.quantity;
    if new.new_quantity < 0 then
      raise exception 'Quantidade insuficiente em estoque';
    end if;
  end if;

  update products
  set quantity_current = new.new_quantity
  where id = new.product_id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists movement_update_quantity on movements;
create trigger movement_update_quantity
  before insert on movements
  for each row execute function update_product_quantity();

-- ============================================================
-- RLS: habilitar em todas as tabelas
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table movements enable row level security;

-- ============================================================
-- RLS POLICIES: profiles (drop antes de criar)
-- ============================================================
drop policy if exists "Usuário vê seu próprio perfil" on profiles;
create policy "Usuário vê seu próprio perfil"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "Super admin e gestor veem todos os perfis" on profiles;
create policy "Super admin e gestor veem todos os perfis"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

drop policy if exists "Super admin atualiza qualquer perfil" on profiles;
create policy "Super admin atualiza qualquer perfil"
  on profiles for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "Usuário atualiza seu próprio perfil" on profiles;
create policy "Usuário atualiza seu próprio perfil"
  on profiles for update
  using (auth.uid() = id)
  with check (role = (select role from profiles where id = auth.uid()));

-- ============================================================
-- RLS POLICIES: categories
-- ============================================================
drop policy if exists "Todos veem categorias" on categories;
create policy "Todos veem categorias"
  on categories for select
  using (auth.role() = 'authenticated');

drop policy if exists "Super admin e gestor gerenciam categorias" on categories;
create policy "Super admin e gestor gerenciam categorias"
  on categories for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor')
    )
  );

-- ============================================================
-- RLS POLICIES: products
-- ============================================================
drop policy if exists "Todos veem produtos ativos" on products;
create policy "Todos veem produtos ativos"
  on products for select
  using (auth.role() = 'authenticated' and active = true);

drop policy if exists "Super admin vê todos os produtos" on products;
create policy "Super admin vê todos os produtos"
  on products for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "Super admin, gestor e almoxarife gerenciam produtos" on products;
create policy "Super admin, gestor e almoxarife gerenciam produtos"
  on products for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor', 'almoxarife')
    )
  );

-- ============================================================
-- RLS POLICIES: movements
-- ============================================================
drop policy if exists "Todos veem movimentações" on movements;
create policy "Todos veem movimentações"
  on movements for select
  using (auth.role() = 'authenticated');

drop policy if exists "Almoxarife registra movimentações" on movements;
create policy "Almoxarife registra movimentações"
  on movements for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'gestor', 'almoxarife')
    )
  );

-- ============================================================
-- DADOS INICIAIS: categorias padrão (só insere se não existir)
-- ============================================================
insert into categories (name, description)
select * from (values
  ('Material de Escritório', 'Papéis, canetas, pastas e outros materiais de escritório'),
  ('Informática', 'Computadores, notebooks, monitores e periféricos'),
  ('Impressoras', 'Impressoras, scanners e equipamentos de impressão'),
  ('Consumíveis de Impressão', 'Cartuchos, toners e ribbons'),
  ('Material de Limpeza', 'Produtos e equipamentos de limpeza e higiene')
) as v(name, description)
where not exists (select 1 from categories where categories.name = v.name);
