-- ============================================================
-- Código de produto gerado pelo sistema + listagem ordenável e paginada
--
-- Idempotente. Depende de: 036_locations.sql, 027_gatilhos_de_produto.sql
-- ============================================================

-- PROBLEMA
-- 1. O código do produto era digitado à mão (no cadastro e na edição em linha).
--    Nada impedia buracos, repetições disfarçadas ("9" e "009") ou dois
--    cadastros simultâneos escolhendo o mesmo número.
-- 2. `products.code` é TEXT. Ordenar por ele é ordem alfabética: "1000" vem
--    antes de "999". Os códigos atuais ("001" a "012") só parecem ordenar
--    certo porque têm todos a mesma largura.
-- 3. A lista carregava todos os produtos e não tinha como ordenar por nome de
--    categoria ou de localização no banco — são tabelas relacionadas.
--
-- CORREÇÃO
-- - A coluna continua TEXT e UNIQUE: os códigos existentes não mudam.
-- - Um gatilho BEFORE INSERT gera o código: maior código numérico + 1, com a
--   largura dos já existentes preservada ("012" → "013"; "999" → "1000").
--   O cálculo roda sob um advisory lock da transação, então dois cadastros
--   simultâneos esperam um pelo outro e nunca leem o mesmo máximo. O UNIQUE
--   continua lá como última barreira.
-- - Um gatilho BEFORE UPDATE recusa troca de código. Vale para qualquer
--   caminho, inclusive a chave de serviço; se um dia for preciso corrigir um
--   código à mão, desabilite o gatilho de forma explícita.
-- - A view `produtos_listagem` expõe o código como número e os nomes de
--   categoria e localização, para o PostgREST ordenar e paginar no banco.
-- - A view `produtos_por_local` conta produtos por local, que a edição de
--   localização usa ("Aplicar aos N") sem precisar da lista inteira.
-- - As duas views são `security_invoker`: aplicam o RLS de quem consulta
--   (ver 030_remove_view_publica.sql).

-- ------------------------------------------------------------
-- 1. Código como número
-- ------------------------------------------------------------

-- Só códigos inteiramente numéricos contam. Um código como "SEC001" devolve
-- NULL: não entra no cálculo do próximo e vai para o fim da ordenação.
create or replace function public.codigo_produto_numero(p_code text)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_code ~ '^[0-9]{1,18}$' then p_code::bigint end
$$;

create index if not exists idx_products_codigo_numero
  on public.products (public.codigo_produto_numero(code));

-- ------------------------------------------------------------
-- 2. Geração do código no INSERT
-- ------------------------------------------------------------

-- SECURITY DEFINER: o máximo precisa enxergar todos os produtos, inclusive os
-- que o RLS esconderia de quem está cadastrando. Senão o código gerado poderia
-- colidir com um que a pessoa não vê.
create or replace function public.gerar_codigo_produto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_maior bigint;
  v_largura integer;
  v_proximo text;
begin
  -- Serializa os cadastros: o segundo espera o primeiro terminar a transação
  -- e, ao continuar, já enxerga o código que ele gravou.
  perform pg_advisory_xact_lock(hashtext('public.products.code'));

  select
    max(public.codigo_produto_numero(p.code)),
    max(length(p.code)) filter (where public.codigo_produto_numero(p.code) is not null)
  into v_maior, v_largura
  from public.products p;

  v_proximo := (coalesce(v_maior, 0) + 1)::text;

  -- lpad corta o texto quando ele é maior que a largura; greatest evita isso.
  new.code := lpad(v_proximo, greatest(coalesce(v_largura, 1), length(v_proximo)), '0');
  return new;
end;
$$;

revoke all on function public.gerar_codigo_produto() from public, anon, authenticated;

drop trigger if exists products_gerar_codigo on public.products;
create trigger products_gerar_codigo
  before insert on public.products
  for each row execute function public.gerar_codigo_produto();

-- ------------------------------------------------------------
-- 3. Código imutável
-- ------------------------------------------------------------

create or replace function public.impedir_troca_codigo_produto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'O código do produto é gerado pelo sistema e não pode ser alterado.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.impedir_troca_codigo_produto() from public, anon, authenticated;

drop trigger if exists products_codigo_imutavel on public.products;
create trigger products_codigo_imutavel
  before update of code on public.products
  for each row execute function public.impedir_troca_codigo_produto();

-- ------------------------------------------------------------
-- 4. View da listagem
-- ------------------------------------------------------------

drop view if exists public.produtos_listagem;
create view public.produtos_listagem
with (security_invoker = true)
as
select
  p.id,
  p.code,
  public.codigo_produto_numero(p.code) as codigo_numero,
  p.name,
  p.category_id,
  c.name as categoria_nome,
  lower(c.name) as categoria_ordem,
  p.unit,
  p.quantity_current,
  p.quantity_minimum,
  p.location,
  l.name as localizacao_nome,
  lower(l.name) as localizacao_ordem,
  p.is_low_stock,
  p.active
from public.products p
left join public.categories c on c.id = p.category_id
left join public.locations l on l.id = p.location;

revoke all on public.produtos_listagem from anon;
grant select on public.produtos_listagem to authenticated;

-- ------------------------------------------------------------
-- 5. Quantos produtos ativos há em cada local
-- ------------------------------------------------------------

drop view if exists public.produtos_por_local;
create view public.produtos_por_local
with (security_invoker = true)
as
select
  l.name as local,
  count(*)::integer as total
from public.products p
join public.locations l on l.id = p.location
where p.active
group by l.name;

revoke all on public.produtos_por_local from anon;
grant select on public.produtos_por_local to authenticated;

-- ------------------------------------------------------------
-- Conferência
-- ------------------------------------------------------------

-- Próximo código que será gerado (hoje: 013):
--   select lpad((max(public.codigo_produto_numero(code)) + 1)::text,
--               max(length(code)), '0')
--   from products;
--
-- Gatilhos novos presentes:
--   select tgname from pg_trigger
--   where tgrelid = 'public.products'::regclass and not tgisinternal;
--
-- Ordenação numérica:
--   select code from produtos_listagem order by codigo_numero desc nulls last limit 5;
