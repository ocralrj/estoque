-- ============================================================
-- TESTE: Verificar vazamento RLS para role anon
-- Executar no Supabase Dashboard → SQL Editor
--
-- ESPERADO:
-- - Queries devem retornar 0 linhas OU falhar com "permission denied"
-- - Se qualquer query retornar dados (linhas_visiveis > 0), há vazamento
-- ============================================================

BEGIN;

-- Simular acesso anônimo (sem autenticação)
-- (em geral no Supabase a role "anon" existe)
SET ROLE anon;

-- Testar acesso às tabelas (conteúdo visível sob RLS)
SELECT 'public.profiles'   AS tabela, count(*)::bigint AS linhas_visiveis FROM public.profiles;
SELECT 'public.categories' AS tabela, count(*)::bigint AS linhas_visiveis FROM public.categories;
SELECT 'public.products'    AS tabela, count(*)::bigint AS linhas_visiveis FROM public.products;
SELECT 'public.movements'   AS tabela, count(*)::bigint AS linhas_visiveis FROM public.movements;

-- Verificar políticas SELECT "abertas" (USING true / (true))
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual AS using_clause,
  with_check,
  roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'SELECT'
  AND qual IN ('true', '(true)')
ORDER BY tablename, policyname;

-- Voltar para o estado original
RESET ROLE;

ROLLBACK;

-- ============================================================
-- INTERPRETAÇÃO DOS RESULTADOS:
-- - Se linhas_visiveis > 0 em qualquer tabela: CRÍTICO (vazamento)
-- - Se permission denied: não é vazamento (é falta de privilégio)
-- - Se linhas_visiveis = 0: OK (RLS/proteção está funcionando)
-- ============================================================
