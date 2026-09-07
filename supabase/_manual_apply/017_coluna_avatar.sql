-- ============================================================
-- A coluna da foto de perfil, que nunca existiu
--
-- Idempotente. Depende de: 016_padrao_supabase.sql
-- ============================================================

-- PROBLEMA
-- `profiles.avatar_url` está declarada em schema_estoque.sql, e o sistema
-- inteiro escreve e lê nela desde sempre — mas ela não existe neste banco.
-- Aquele trecho do schema nunca chegou a ser aplicado aqui.
--
-- O estrago é maior do que parece, porque no PostgREST uma coluna inexistente
-- não é ignorada: ela derruba a consulta inteira. Então tudo que pedia
-- avatar_url junto com outras colunas voltava vazio, sem erro visível na tela:
--
--   - a foto de perfil subia para o Storage e falhava ao ser gravada no
--     perfil, com PGRST204;
--   - a lista de membros de um grupo vinha vazia, e todo grupo aparecia como
--     "ninguém aqui ainda";
--   - os círculos de equipe do departamento não mostravam ninguém.
--
-- Três sintomas sem relação aparente, uma causa só.
--
-- CORREÇÃO
-- Criar a coluna. Nada mais: o código que a usa já existe e está correto.

alter table profiles add column if not exists avatar_url text;

comment on column profiles.avatar_url is
  'Endereço público da foto de perfil, no bucket "avatars". Nulo quando a pessoa não subiu foto — a interface mostra as iniciais no lugar.';

-- ------------------------------------------------------------
-- Recarregar o cache de esquema do PostgREST
--
-- Sem isto a API continua respondendo PGRST204 por alguns minutos, mesmo com a
-- coluna já criada: o PostgREST guarda o esquema em memória e só o relê quando
-- avisado.
-- ------------------------------------------------------------

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Conferência
-- ------------------------------------------------------------

-- A coluna existe?
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name = 'avatar_url';

-- Quem já tem foto?
--   select email, avatar_url from profiles where avatar_url is not null;
