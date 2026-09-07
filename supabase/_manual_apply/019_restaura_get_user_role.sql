-- ============================================================
-- Restaura o bloqueio de contas desativadas
--
-- Idempotente. Depende de: 018_sugestoes_de_melhoria.sql
-- ============================================================

-- PROBLEMA
-- get_user_role() voltou a ser a versão sem `and active = true`:
--
--   select role from public.profiles where id = auth.uid();
--
-- Quase toda política RLS do sistema chama essa função. Sem a condição, uma
-- conta desativada continua tendo papel — e portanto continua lendo e
-- escrevendo pela API REST com o token que já tinha, mesmo depois de a tela
-- dizer que ela está inativa. Desativar alguém passa a ser um efeito visual.
--
-- POR QUE VOLTOU
-- O repositório tinha TRÊS definições da mesma função: a correta, na migração
-- 010, e duas antigas sem a condição, em schema_estoque.sql e
-- schema_sugestoes.sql. Como `create or replace` sobrescreve sem avisar, basta
-- reaplicar qualquer um daqueles dois arquivos — por qualquer motivo, mesmo
-- para criar uma tabela — para a correção sumir em silêncio. Não há erro, não
-- há aviso: o acesso simplesmente volta.
--
-- As duas cópias antigas foram removidas dos arquivos de schema no mesmo
-- commit desta migração, para a armadilha não poder disparar de novo.

-- ------------------------------------------------------------
-- 1. A definição correta, de novo
-- ------------------------------------------------------------

create or replace function public.get_user_role()
returns user_role
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select role from public.profiles
  where id = auth.uid()
    and active = true;
$$;

comment on function public.get_user_role is
  'Papel do usuário autenticado, ou NULL se a conta estiver inativa. Ignora RLS para não recursionar. A condição de conta ativa é o que impede um token válido de continuar acessando a API depois da desativação — nunca a remova.';

-- ------------------------------------------------------------
-- 2. Conferência — rode e confirme que aparece "active"
-- ------------------------------------------------------------

-- select prosrc from pg_proc where proname = 'get_user_role';
--
-- Esperado:
--     select role from public.profiles
--     where id = auth.uid()
--       and active = true;
--
-- Se algum dia isto voltar a aparecer SEM a linha do active, alguém reaplicou
-- um schema antigo por cima. Rode esta migração de novo.

-- Quem está inativo hoje (deve estar sem acesso a partir de agora):
--   select email, role, status, active from profiles where active = false;
