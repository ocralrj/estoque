-- ============================================================
-- TESTE: Verificar vazamento RLS para role anon
-- Executar no Supabase Dashboard → SQL Editor
--
-- ESPERADO: Todas as queries devem falhar ou retornar 0 linhas
-- Se qualquer query retornar dados, há vazamento de segurança
-- ============================================================

-- Simular acesso anônimo (sem autenticação)
SET LOCAL ROLE anon;

-- Testar acesso às tabelas
SELECT 'profiles' as tabela, count(*) as linhas_visiveis FROM profiles;
SELECT 'categories' as tabela, count(*) as linhas_visiveis FROM categories;
SELECT 'products' as tabela, count(*) as linhas_visiveis FROM products;
SELECT 'movements' as tabela, count(*) as linhas_visiveis FROM movements;

-- Verificar políticas abertas
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual as using_clause,
  with_check,
  roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'SELECT'
  AND qual IN ('true', '(true)')
ORDER BY tablename, policyname;

-- Resetar para role original
RESET ROLE;

-- ============================================================
-- INTERPRETAÇÃO DOS RESULTADOS:
--
-- Se linhas_visiveis > 0 em qualquer tabela:
--   → CRÍTICO: dados vazando para usuários não autenticados
--   → Aplicar 001_corrigir_rls.sql
--
-- Se linhas_visiveis = 0 ou erro "permission denied":
--   → OK: RLS está protegendo corretamente
-- ============================================================
