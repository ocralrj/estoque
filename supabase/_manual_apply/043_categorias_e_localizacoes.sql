-- ============================================================
-- Categorias e localizações como cadastros do Estoque
--
-- Idempotente. Depende de: 034_permissao_no_banco.sql e 036_locations.sql
-- (Independe da 042_codigo_e_listagem_de_produtos.sql; a ordem entre as duas não importa.)
-- ============================================================

-- O QUE MUDA
--
-- 1. Status. Categoria e localização ganham `active`. Inativa some das novas
--    escolhas, mas o produto que já a usa continua com ela.
-- 2. Nome sem repetição, sem diferenciar maiúsculas nem espaços sobrando.
--    "Sala do TI" e "sala do ti " são o mesmo lugar: a 036 migrou a
--    localização em texto livre, e é justamente aí que o nome repetido nasce.
--    Os repetidos que já existirem são fundidos (ver seção 2).
-- 3. Exclusão física só do que nenhum produto usa. A localização era
--    `on delete set null`: apagar o local apagava, em silêncio, o endereço de
--    todos os produtos guardados nele. Passa a `restrict`, como a categoria.
-- 4. Produto novo (ou produto cuja categoria/localização é trocada) não aceita
--    cadastro inativo. A regra vale no banco, não só na tela.
-- 5. Quem cria, edita e exclui é decidido pela permissão do grupo
--    (`tem_permissao`), não mais pelo papel — as duas camadas passam a
--    concordar, como nas demais telas desde a 034.
-- 6. Localização entra no catálogo como `estoque:locations`. A permissão
--    `admin:locations` da 036 servia a uma tela em Administração que nunca
--    abriu; quem a tinha recebe a equivalente no Estoque.

-- ------------------------------------------------------------
-- 1. Status e data de alteração
-- ------------------------------------------------------------

alter table public.categories add column if not exists active boolean not null default true;
alter table public.categories add column if not exists updated_at timestamptz not null default now();

alter table public.locations add column if not exists active boolean not null default true;
alter table public.locations add column if not exists updated_at timestamptz not null default now();

create or replace function public.cadastro_estoque_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.cadastro_estoque_updated_at();

drop trigger if exists locations_updated_at on public.locations;
create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.cadastro_estoque_updated_at();

-- ------------------------------------------------------------
-- 2. Fundir nomes repetidos
--
-- Sem isto o índice único da seção 3 não pode ser criado. Fica o registro mais
-- antigo; os produtos dos demais passam para ele e os demais são removidos.
-- Nenhum produto perde categoria ou localização: só deixa de haver duas
-- linhas para a mesma coisa. Cada fusão aparece como aviso na saída.
-- ------------------------------------------------------------

do $$
declare
  d record;
begin
  for d in
    select
      lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as chave,
      array_agg(id order by created_at, id) as ids,
      array_agg(name order by created_at, id) as nomes
    from public.categories
    group by 1
    having count(*) > 1
  loop
    update public.products set category_id = d.ids[1]
    where category_id = any(d.ids[2:]);

    delete from public.categories where id = any(d.ids[2:]);

    raise notice 'Categorias fundidas em "%": %', d.nomes[1], d.nomes[2:];
  end loop;

  for d in
    select
      lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as chave,
      array_agg(id order by created_at, id) as ids,
      array_agg(name order by created_at, id) as nomes
    from public.locations
    group by 1
    having count(*) > 1
  loop
    update public.products set location = d.ids[1]
    where location = any(d.ids[2:]);

    delete from public.locations where id = any(d.ids[2:]);

    raise notice 'Localizações fundidas em "%": %', d.nomes[1], d.nomes[2:];
  end loop;
end $$;

-- Espaços sobrando no começo, no fim ou dobrados no meio.
update public.categories
set name = regexp_replace(btrim(name), '\s+', ' ', 'g')
where name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

update public.locations
set name = regexp_replace(btrim(name), '\s+', ' ', 'g')
where name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

-- ------------------------------------------------------------
-- 3. Nome obrigatório e único
--
-- O `unique` original diferencia maiúsculas. O índice sobre lower(name) é o
-- que impede "Informática" e "INFORMÁTICA" de coexistirem.
-- ------------------------------------------------------------

alter table public.categories drop constraint if exists categories_name_preenchido;
alter table public.categories
  add constraint categories_name_preenchido
  check (char_length(btrim(name)) > 0 and name = btrim(name));

alter table public.locations drop constraint if exists locations_name_preenchido;
alter table public.locations
  add constraint locations_name_preenchido
  check (char_length(btrim(name)) > 0 and name = btrim(name));

create unique index if not exists categories_name_unico_idx
  on public.categories (lower(name));

create unique index if not exists locations_name_unico_idx
  on public.locations (lower(name));

-- ------------------------------------------------------------
-- 4. Integridade referencial: não se apaga o que está em uso
-- ------------------------------------------------------------

alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.categories(id)
  on delete restrict;

alter table public.products drop constraint if exists products_location_fkey;
alter table public.products
  add constraint products_location_fkey
  foreign key (location) references public.locations(id)
  on delete restrict;

-- A contagem de uso e a exclusão consultam products por localização.
create index if not exists idx_products_location on public.products (location);

-- ------------------------------------------------------------
-- 5. Cadastro inativo não entra em produto
--
-- Só olha a categoria/localização quando ela é definida agora: no INSERT, ou
-- no UPDATE que a troca. Editar outro campo de um produto que já usa uma
-- categoria inativa continua funcionando — é o histórico que se quer manter.
-- Id inexistente não é tratado aqui: a chave estrangeira já recusa.
-- ------------------------------------------------------------

create or replace function public.produto_exige_cadastro_ativo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.category_id is not null
     and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and exists (
       select 1 from categories c where c.id = new.category_id and not c.active
     )
  then
    raise exception 'A categoria escolhida está inativa e não pode ser usada em produtos.';
  end if;

  if new.location is not null
     and (tg_op = 'INSERT' or new.location is distinct from old.location)
     and exists (
       select 1 from locations l where l.id = new.location and not l.active
     )
  then
    raise exception 'A localização escolhida está inativa e não pode ser usada em produtos.';
  end if;

  return new;
end;
$$;

revoke all on function public.produto_exige_cadastro_ativo() from public, anon, authenticated;

drop trigger if exists products_cadastro_ativo on public.products;
create trigger products_cadastro_ativo
  before insert or update of category_id, location on public.products
  for each row execute function public.produto_exige_cadastro_ativo();

-- ------------------------------------------------------------
-- 6. Permissões no catálogo
-- ------------------------------------------------------------

insert into permissions (module, resource, action, description) values
  ('estoque', 'locations', 'read',   'Ver localizações'),
  ('estoque', 'locations', 'create', 'Criar localizações'),
  ('estoque', 'locations', 'update', 'Editar localizações'),
  ('estoque', 'locations', 'delete', 'Excluir localizações')
on conflict (module, resource, action) do nothing;

-- Quem tem a ação em categorias recebe a mesma em localizações: são cadastros
-- irmãos, e até hoje ninguém pôde configurar a de localização em separado.
insert into group_permissions (group_id, permission_id)
select distinct gp.group_id, pl.id
from group_permissions gp
join permissions pc
  on pc.id = gp.permission_id
 and pc.module = 'estoque' and pc.resource = 'categories'
join permissions pl
  on pl.module = 'estoque' and pl.resource = 'locations' and pl.action = pc.action
where not exists (
  select 1 from group_permissions x
  where x.group_id = gp.group_id and x.permission_id = pl.id
);

-- Quem recebeu a permissão antiga em Administração leva a equivalente.
insert into group_permissions (group_id, permission_id)
select distinct gp.group_id, pl.id
from group_permissions gp
join permissions pa
  on pa.id = gp.permission_id
 and pa.module = 'admin' and pa.resource = 'locations'
join permissions pl
  on pl.module = 'estoque' and pl.resource = 'locations' and pl.action = pa.action
where not exists (
  select 1 from group_permissions x
  where x.group_id = gp.group_id and x.permission_id = pl.id
);

delete from group_permissions
where permission_id in (
  select id from permissions where module = 'admin' and resource = 'locations'
);

delete from permissions where module = 'admin' and resource = 'locations';

-- ------------------------------------------------------------
-- 7. RLS: leitura para quem está logado, escrita por permissão
--
-- `get_user_role() is not null` mantém o bloqueio de conta inativa e de férias,
-- que tem_permissao sozinha não enxerga.
-- ------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.locations enable row level security;

drop policy if exists "Super admin e gestor gerenciam categorias" on public.categories;

drop policy if exists "Categorias: quem pode cria" on public.categories;
create policy "Categorias: quem pode cria"
  on public.categories for insert to authenticated
  with check (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'categories', 'create')
  );

drop policy if exists "Categorias: quem pode edita" on public.categories;
create policy "Categorias: quem pode edita"
  on public.categories for update to authenticated
  using (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'categories', 'update')
  )
  with check (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'categories', 'update')
  );

drop policy if exists "Categorias: quem pode exclui" on public.categories;
create policy "Categorias: quem pode exclui"
  on public.categories for delete to authenticated
  using (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'categories', 'delete')
  );

drop policy if exists "locations_manage" on public.locations;

drop policy if exists "Localizações: quem pode cria" on public.locations;
create policy "Localizações: quem pode cria"
  on public.locations for insert to authenticated
  with check (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'locations', 'create')
  );

drop policy if exists "Localizações: quem pode edita" on public.locations;
create policy "Localizações: quem pode edita"
  on public.locations for update to authenticated
  using (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'locations', 'update')
  )
  with check (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'locations', 'update')
  );

drop policy if exists "Localizações: quem pode exclui" on public.locations;
create policy "Localizações: quem pode exclui"
  on public.locations for delete to authenticated
  using (
    public.get_user_role() is not null
    and public.tem_permissao('estoque', 'locations', 'delete')
  );

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8. Conferência
-- ------------------------------------------------------------

-- Colunas novas (devem vir 4 linhas):
--   select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('categories', 'locations')
--     and column_name in ('active', 'updated_at');
--
-- Chaves estrangeiras em restrict (confdeltype = 'r'):
--   select conname, confdeltype from pg_constraint
--   where conname in ('products_category_id_fkey', 'products_location_fkey');
--
-- Permissões de localização e quantos grupos têm cada uma:
--   select p.module, p.resource, p.action, count(gp.group_id)
--   from permissions p left join group_permissions gp on gp.permission_id = p.id
--   where p.resource = 'locations' group by 1, 2, 3 order by 1, 3;
