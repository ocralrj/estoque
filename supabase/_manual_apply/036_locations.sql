-- ============================================================
-- TABELA: locations (localização de produtos)
-- ============================================================

create table if not exists locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Atualizar produtos para usar location_id (FK para locations)
-- ============================================================

-- Verificar se a coluna location ainda é texto (migração ainda não aplicada)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'products'
    and column_name = 'location'
    and data_type = 'text'
  ) then
    -- Criar tabela de locais com os valores distintos existentes
    insert into locations (name, description)
    select distinct location, 'Localização migrada do produto'
    from products
    where location is not null and trim(location) <> ''
    on conflict (name) do nothing;

    -- Adicionar coluna temporária para o UUID da localização
    alter table products add column if not exists location_id uuid;

    -- Atualizar o location_id com base no nome da localização
    update products
    set location_id = l.id
    from locations l
    where products.location = l.name;

    -- Remover a coluna de texto antiga
    alter table products drop column location;

    -- Renomear a coluna de UUID para location
    alter table products rename column location_id to location;

    -- Adicionar chave estrangeira
    alter table products
      add constraint products_location_fkey
      foreign key (location) references locations(id)
      on delete set null;
  end if;
end $$;

-- ============================================================
-- RLS e Permissões para locations
-- ============================================================

alter table locations enable row level security;

drop policy if exists "locations_select" on locations;
create policy "locations_select" on locations
  for select to authenticated
  using (true);

drop policy if exists "locations_manage" on locations;
create policy "locations_manage" on locations
  for all to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife'));

-- Permissões no catálogo
insert into permissions (module, resource, action, description) values
  ('admin', 'locations', 'read', 'Ver localizações'),
  ('admin', 'locations', 'create', 'Criar localizações'),
  ('admin', 'locations', 'update', 'Editar localizações'),
  ('admin', 'locations', 'delete', 'Excluir localizações')
on conflict (module, resource, action) do nothing;
