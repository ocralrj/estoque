-- ============================================================
-- Padrão Supabase: search_path e funções expostas na API
--
-- Idempotente. Depende de: 015_bucket_avatares.sql
-- ============================================================

-- PROBLEMA
-- O relatório do linter do Supabase acusou dois grupos de avisos.
--
-- 1. Funções SECURITY DEFINER sem `search_path` fixo. Elas rodam com os
--    privilégios de quem as criou; sem search_path, quem chama pode antepor um
--    esquema próprio e fazer a função executar as tabelas dele.
--
-- 2. Funções SECURITY DEFINER chamáveis por `anon` e `authenticated` via
--    /rest/v1/rpc/. O Postgres concede EXECUTE a PUBLIC em toda função nova,
--    então cada uma virou endpoint público sem ninguém pedir. Duas são graves:
--
--    - cleanup_old_audit_logs(dias): qualquer pessoa, sem login, apagava a
--      trilha de auditoria inteira com uma requisição.
--    - renomear_departamento(antigo, novo): renomeava departamentos em todos os
--      documentos — e é o nome do departamento que decide quem lê o quê no GED.
--
--    As de gatilho (audit_*_changes, handle_new_user, ged_log_*) aparecem na
--    lista, mas o Postgres recusa chamá-las diretamente. Ficam revogadas por
--    higiene, não por risco.
--
-- O QUE NÃO É MEXIDO
-- get_user_role, get_user_departamento, ged_pode_ler e ged_pode_editar também
-- aparecem no relatório, mas são usadas DENTRO das políticas RLS. O papel que
-- consulta precisa de EXECUTE nelas: revogar derrubaria o acesso ao sistema
-- inteiro. Elas já têm search_path fixo e leem apenas auth.uid(), então para
-- quem não tem sessão devolvem nulo — que é o comportamento correto.

-- ------------------------------------------------------------
-- 1. search_path fixo nas funções que estavam sem
-- ------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_updated_at', 'update_product_quantity', 'log_audit',
        'audit_products_changes', 'audit_movements_changes',
        'audit_profiles_changes', 'audit_grupos_changes',
        'audit_group_permissions', 'cleanup_old_audit_logs',
        'user_has_permission', 'get_user_permissions',
        'ged_log_document_change', 'ged_log_document_delete',
        'ged_calcular_descarte', 'ged_current_role',
        'handle_new_user', 'registrar_auditoria', 'renomear_departamento'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) as c
        where c like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.assinatura);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Fechar as funções que não deveriam ser endpoint
--
-- Revogar de PUBLIC não basta: anon e authenticated podem ter recebido EXECUTE
-- diretamente. Por isso os três.
-- ------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        -- Manutenção e escrita em massa: nunca chamadas pelo navegador.
        p.proname in (
          'cleanup_old_audit_logs', 'log_audit', 'registrar_auditoria',
          'get_user_permissions', 'user_has_permission', 'handle_new_user'
        )
        -- Funções de gatilho: o Postgres já recusa a chamada direta, mas o
        -- EXECUTE aberto continua aparecendo no relatório.
        or p.prorettype = 'trigger'::regtype
      )
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('revoke all on function %s from anon', f.assinatura);
    execute format('revoke all on function %s from authenticated', f.assinatura);
  end loop;
end $$;

-- renomear_departamento continua acessível: uma Server Action a chama com a
-- sessão de quem administra. O que ela ganha é a checagem que não tinha — sem
-- ela, o EXECUTE aberto deixava qualquer pessoa renomear departamentos.
create or replace function public.renomear_departamento(antigo text, novo text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  total integer := 0;
  parcial integer;
begin
  if public.get_user_role()::text not in ('super_admin', 'gestor') then
    raise exception 'Apenas a gestão renomeia departamentos.';
  end if;

  update ged_documents set setor = novo where setor = antigo;
  get diagnostics parcial = row_count;
  total := total + parcial;

  update profiles set departamento = novo where departamento = antigo;
  get diagnostics parcial = row_count;
  total := total + parcial;

  begin
    update ged_folders set setor = novo where setor = antigo;
    get diagnostics parcial = row_count;
    total := total + parcial;
  exception
    when undefined_table or undefined_column then null;
  end;

  return total;
end;
$$;

revoke all on function public.renomear_departamento(text, text) from public, anon;
grant execute on function public.renomear_departamento(text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Remover a função duplicada
--
-- ged_current_role fazia o mesmo que get_user_role, que é a usada em todas as
-- políticas. Ter duas maneiras de responder "qual é o papel desta pessoa" é
-- convite para elas divergirem — e foi criada sem search_path, justamente o
-- problema do item 1.
-- ------------------------------------------------------------

do $$ begin
  drop function if exists public.ged_current_role();
exception
  -- Se alguma política ainda depender dela, o drop falha e a função fica.
  -- Melhor manter do que derrubar o acesso ao acervo.
  when dependent_objects_still_exist then
    raise notice 'ged_current_role ainda é usada por alguma política; mantida.';
end $$;

-- ------------------------------------------------------------
-- 4. Conferência
-- ------------------------------------------------------------

-- Ainda há função em public sem search_path?
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
--                     where c like 'search_path=%');

-- Quem ainda executa cleanup_old_audit_logs? (esperado: nenhum anon/authenticated)
--   select proname, proacl from pg_proc where proname = 'cleanup_old_audit_logs';
