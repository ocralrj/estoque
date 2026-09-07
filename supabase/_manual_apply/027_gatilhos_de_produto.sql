-- ============================================================
-- Gatilhos de produto apontando para colunas que não existem
--
-- Idempotente. Depende de: 026_retorno_de_ferias.sql
-- ============================================================

-- PROBLEMA
-- Criar produto falha com:
--
--   record "new" has no field "sku"
--
-- A coluna `sku` não existe em `products` — nem na tabela, nem em lugar nenhum
-- do repositório. Existe um gatilho no banco, de uma versão antiga que nunca
-- foi capturada em arquivo, referenciando um campo que já não existe. Como ele
-- roda em todo INSERT, nenhum produto pode ser cadastrado.
--
-- E há um segundo, este sim no repositório: `audit_products_changes` usa
-- `NEW.quantity` no ramo de UPDATE, mas a coluna se chama `quantity_current`.
-- Ou seja, editar produto quebraria pelo mesmo motivo — só ainda não tinha
-- sido tentado.
--
-- CORREÇÃO
-- Recriar o gatilho de auditoria com os nomes reais das colunas, e remover os
-- gatilhos de `products` cujo corpo cita `sku`. Um gatilho que referencia
-- coluna inexistente não tem como funcionar: ele só pode falhar, e é o que
-- está fazendo.

-- ------------------------------------------------------------
-- 1. Auditoria de produto, com os nomes certos
-- ------------------------------------------------------------

create or replace function public.audit_products_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_auditoria(
      'estoque', 'create', 'product', new.id::text,
      jsonb_build_object('nome', new.name, 'codigo', new.code)
    );
  elsif tg_op = 'UPDATE' then
    -- A coluna é quantity_current. A versão anterior dizia `quantity`, que
    -- nunca existiu nesta tabela.
    perform public.registrar_auditoria(
      'estoque', 'update', 'product', new.id::text,
      jsonb_build_object(
        'nome_antes', old.name,
        'nome_depois', new.name,
        'quantidade_antes', old.quantity_current,
        'quantidade_depois', new.quantity_current
      )
    );
  elsif tg_op = 'DELETE' then
    perform public.registrar_auditoria(
      'estoque', 'delete', 'product', old.id::text,
      jsonb_build_object('nome', old.name, 'codigo', old.code)
    );
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists products_audit_trigger on products;
create trigger products_audit_trigger
  after insert or update or delete on products
  for each row execute function public.audit_products_changes();

revoke all on function public.audit_products_changes() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Remover os gatilhos de products que citam uma coluna inexistente
--
-- Varre os gatilhos da tabela, olha o corpo da função de cada um e remove os
-- que mencionam `sku`. Não há como "consertar" um gatilho desconhecido cujo
-- código se refere a uma coluna que não existe: ele só pode falhar. O que
-- cada um removido fazia fica registrado como aviso na saída.
-- ------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select tg.tgname, p.proname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where n.nspname = 'public'
      and c.relname = 'products'
      and not tg.tgisinternal
      and p.prosrc ilike '%sku%'
  loop
    raise notice 'Removendo gatilho % (função %), que referencia a coluna inexistente sku.',
      t.tgname, t.proname;
    execute format('drop trigger if exists %I on public.products', t.tgname);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. A mesma varredura, para o resto do sistema
--
-- Se um gatilho ficou apontando para coluna que não existe em products, é
-- provável que haja outros. Aqui eles são apenas relatados: remover às cegas
-- um gatilho de outra tabela seria trocar um defeito conhecido por um
-- desconhecido.
-- ------------------------------------------------------------

do $$
declare
  f record;
  suspeitas int := 0;
begin
  for f in
    select c.relname as tabela, tg.tgname, p.proname, p.prosrc
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where n.nspname = 'public' and not tg.tgisinternal
  loop
    -- Campos que o projeto já renomeou ou nunca teve.
    if f.prosrc ~* '\m(sku|quantity)\M' and f.prosrc !~* 'quantity_current|quantity_minimum' then
      raise notice 'SUSPEITO: gatilho % na tabela % (função %) cita coluna possivelmente inexistente.',
        f.tgname, f.tabela, f.proname;
      suspeitas := suspeitas + 1;
    end if;
  end loop;

  if suspeitas = 0 then
    raise notice 'Nenhum outro gatilho suspeito encontrado.';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 4. Conferência
-- ------------------------------------------------------------

-- Gatilhos que sobraram em products:
--   select tg.tgname, p.proname from pg_trigger tg
--   join pg_class c on c.oid = tg.tgrelid
--   join pg_proc p on p.oid = tg.tgfoid
--   where c.relname = 'products' and not tg.tgisinternal;
