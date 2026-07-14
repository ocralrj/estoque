-- ============================================================
-- ÍNDICES: Performance para queries transacionais
-- Executar no Supabase Dashboard → SQL Editor
--
-- IDEMPOTENTE: pode ser executado múltiplas vezes sem erro
-- ============================================================

-- ============================================================
-- TABELA: products
-- ============================================================

-- FK para categories (usado em JOIN em products/page.tsx:18)
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products(category_id);

-- Filtro active = true (usado em queries: .eq("active", true))
CREATE INDEX IF NOT EXISTS idx_products_active
  ON products(active)
  WHERE active = true;

-- FK para profiles (auditoria, created_by)
CREATE INDEX IF NOT EXISTS idx_products_created_by
  ON products(created_by);

-- Índice composto para queries de estoque baixo (dashboard)
CREATE INDEX IF NOT EXISTS idx_products_low_stock
  ON products(active, quantity_current, quantity_minimum)
  WHERE active = true AND quantity_current <= quantity_minimum;

-- ============================================================
-- TABELA: movements
-- ============================================================

-- FK para products (usado em JOIN em reports/page.tsx:28)
CREATE INDEX IF NOT EXISTS idx_movements_product_id
  ON movements(product_id);

-- Range queries em reports (.gte/.lte em created_at)
CREATE INDEX IF NOT EXISTS idx_movements_created_at
  ON movements(created_at DESC);

-- FK para profiles (auditoria, created_by)
CREATE INDEX IF NOT EXISTS idx_movements_created_by
  ON movements(created_by);

-- Filtro por tipo (filter: m.type === "entrada")
CREATE INDEX IF NOT EXISTS idx_movements_type
  ON movements(type);

-- Índice composto para queries de reports (data + tipo)
CREATE INDEX IF NOT EXISTS idx_movements_date_type
  ON movements(created_at DESC, type);

-- ============================================================
-- TABELA: profiles
-- ============================================================

-- Filtro role usado em RLS policies (verificação repetida)
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role);

-- Email para lookup (já é UNIQUE, mas índice explícito)
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles(email);

-- Filtro active para usuários ativos
CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON profiles(active)
  WHERE active = true;

-- ============================================================
-- VERIFICAÇÃO: Listar todos os índices criados
-- ============================================================

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'categories', 'products', 'movements')
ORDER BY tablename, indexname;

-- ============================================================
-- IMPACTO ESPERADO:
--
-- - Queries de produtos por categoria: 10-100x mais rápido
-- - Relatórios com range de datas: 5-50x mais rápido
-- - Dashboard de alertas: 5-20x mais rápido
-- - RLS policies: overhead reduzido em 30-70%
--
-- CUSTO:
-- - ~50-200 KB por índice (total <2 MB)
-- - INSERT/UPDATE/DELETE ~5-10% mais lentos (aceitável)
-- ============================================================
