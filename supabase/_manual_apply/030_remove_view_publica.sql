-- ============================================================
-- Remove a view pública de departamentos
--
-- Idempotente. Depende de: 029_cargos.sql
-- ============================================================

-- PROBLEMA
-- A migração 028 criou `departamentos_publicos` com `security_invoker = false`
-- para que a tela de pedido de acesso, usada por quem ainda não tem conta,
-- pudesse listar os departamentos. O linter do Supabase acusa isso como
-- crítico, e com razão: uma view assim aplica as permissões de quem a criou, e
-- não as de quem consulta. Ela atravessa o RLS por definição.
--
-- O raciocínio original — "são só nomes de departamento" — resolve o risco
-- desta view, mas não o do padrão: no dia em que alguém acrescentar uma coluna
-- ao select, a exposição cresce sem ninguém perceber, porque não há política
-- nenhuma no caminho para barrar.
--
-- CORREÇÃO
-- A view sai. A tela passa a buscar os nomes por uma Server Action, que roda no
-- servidor com a chave de serviço e devolve apenas a lista de nomes. A decisão
-- de expor deixa de morar no banco, onde é silenciosa, e passa a morar no
-- código, onde está escrita e revisável.

drop view if exists public.departamentos_publicos;

-- ------------------------------------------------------------
-- Conferência
-- ------------------------------------------------------------

-- Não deve sobrar nenhuma view SECURITY DEFINER no schema público:
--   select c.relname
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where c.relkind = 'v' and n.nspname = 'public'
--     and not coalesce((
--       select option_value = 'true'
--       from pg_options_to_table(c.reloptions)
--       where option_name = 'security_invoker'
--     ), false);
