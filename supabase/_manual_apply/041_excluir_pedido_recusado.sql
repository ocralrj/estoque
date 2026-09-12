-- ============================================================
-- Super admin exclui pedido de acesso recusado
--
-- Idempotente. Depende de: 028_solicitacao_de_acesso.sql, 010_seguranca_admin.sql
-- ============================================================

-- PROBLEMA
-- Um pedido recusado fica na fila para sempre. Não havia política de DELETE em
-- access_requests, então nem o super admin conseguia removê-lo — e quem foi
-- recusado por engano, ou mudou de situação, continuava com o registro antigo
-- atrelado ao mesmo e-mail.
--
-- CORREÇÃO
-- Só o super admin exclui, e só o que está RECUSADO. A regra fica aqui, no
-- banco, e não só na tela: uma requisição feita à mão pela API esbarra na
-- política do mesmo jeito.
--
-- O que NÃO precisa ser apagado junto:
-- - Recusar não cria conta: nada em auth.users nem em profiles.
-- - Nenhuma tabela referencia access_requests.
-- - O aviso aos gestores (notifications) não guarda o id do pedido.
-- - A trava de e-mail é o índice parcial access_requests_email_pendente_idx,
--   que só vale para pedidos pendentes. Um pedido novo com o mesmo e-mail entra
--   como linha nova: id próprio, data própria e status pendente.

-- ------------------------------------------------------------
-- 1. A exclusão: super admin, e só pedido recusado
--
-- get_user_role() devolve NULL para conta inativa, então um super admin
-- desativado também não exclui.
-- ------------------------------------------------------------

drop policy if exists "Pedido de acesso: exclusão do recusado pelo super admin" on public.access_requests;
create policy "Pedido de acesso: exclusão do recusado pelo super admin"
  on public.access_requests for delete
  to authenticated
  using (
    status = 'recusado'
    and public.get_user_role()::text = 'super_admin'
  );

grant delete on public.access_requests to authenticated;

-- ------------------------------------------------------------
-- 2. A exclusão fica na auditoria
--
-- A linha some da fila, mas quem recusou, quando e por quê continuam
-- consultáveis — apagar a decisão sem rastro seria o contrário da auditoria.
-- ------------------------------------------------------------

create or replace function public.audit_access_requests_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.registrar_auditoria(
    'admin', 'excluir', 'access_requests', old.id::text,
    jsonb_build_object(
      'nome', old.nome,
      'email', old.email,
      'departamento', old.departamento,
      'status', old.status,
      'motivo_recusa', old.motivo_recusa,
      'decidido_por', old.decidido_por,
      'decidido_em', old.decidido_em,
      'pedido_em', old.created_at
    )
  );
  return old;
end;
$$;

drop trigger if exists access_requests_audit_delete on public.access_requests;
create trigger access_requests_audit_delete
  after delete on public.access_requests
  for each row execute function public.audit_access_requests_delete();

revoke all on function public.audit_access_requests_delete() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 3. Conferência
-- ------------------------------------------------------------

-- A política existe:
--   select policyname, cmd from pg_policies where tablename = 'access_requests';

-- A única trava de e-mail é a parcial (where status = 'pendente'). Se aparecer
-- outro índice UNIQUE sobre email, avise antes de usar a exclusão:
--   select indexname, indexdef from pg_indexes where tablename = 'access_requests';
