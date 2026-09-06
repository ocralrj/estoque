-- ============================================================
-- FIX: catálogo de permissões legível por visitantes anônimos
--
-- PROBLEMA
-- A política `permissions_read_all` usava `USING (true)` sem cláusula `TO`,
-- então valia também para o papel `anon`. Uma requisição sem login a
--   GET /rest/v1/permissions?select=*
-- devolvia as 38 linhas do catálogo, revelando o mapa de módulos, recursos e
-- ações do sistema. Não há dado pessoal envolvido, mas é reconhecimento
-- gratuito para quem for procurar brecha.
--
-- CORREÇÃO
-- Restringir a política ao papel `authenticated`.
--
-- VERIFICAÇÃO (deve devolver [] depois de aplicar):
--   curl -s -H "apikey: <chave anon>" \
--     "https://<ref>.supabase.co/rest/v1/permissions?select=id&limit=1"
-- ============================================================

DROP POLICY IF EXISTS permissions_read_all ON permissions;

CREATE POLICY permissions_read_all ON permissions
  FOR SELECT
  TO authenticated
  USING (true);
