-- ============================================================
-- GED: a trilha de auditoria passa a respeitar o acesso ao documento
--
-- Idempotente. Depende de: 006_ged_permissoes.sql
-- ============================================================

-- PROBLEMA
-- A política de ged_audit era `auth.uid() is not null`: qualquer usuário
-- autenticado lia a trilha inteira, inclusive de documentos restritos. Cada
-- linha carrega o nome do documento, a ação e quem a fez — então a trilha
-- vazava justamente o que a restrição do documento pretendia esconder.
--
-- CORREÇÃO
-- Ver o histórico exige poder ver o documento. Registros de exclusão ficam sem
-- document_id (o documento não existe mais), e esses só a gestão enxerga.

drop policy if exists "GED: leitura autenticada da auditoria" on ged_audit;
drop policy if exists "GED: auditoria segue o acesso ao documento" on ged_audit;

create policy "GED: auditoria segue o acesso ao documento"
  on ged_audit for select
  to authenticated
  using (
    case
      when document_id is null
        then public.get_user_role()::text in ('super_admin', 'gestor')
      else public.ged_pode_ler(document_id)
    end
  );

-- A trilha é escrita pelos triggers, que rodam como SECURITY DEFINER. Nenhuma
-- política de INSERT é concedida a usuário: ninguém forja evento de auditoria.
drop policy if exists "GED: auditoria não aceita escrita direta" on ged_audit;

comment on table ged_audit is
  'Trilha do GED. Leitura acompanha o acesso ao documento; escrita só pelos triggers (SECURITY DEFINER).';
