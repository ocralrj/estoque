-- ============================================================
-- Retorno de férias que realmente acontece no acesso
--
-- Idempotente. Depende de: 025_dialogo_da_sugestao.sql
-- ============================================================

-- PROBLEMA
-- A regra é: quem está de férias e entra no sistema na data prevista, ou
-- depois dela, volta a Ativo automaticamente. Ela foi escrita na aplicação,
-- que fazia um UPDATE comum com a sessão da própria pessoa — sujeito à RLS de
-- `profiles`, ao gatilho de proteção de campos e à ordem em que os gatilhos
-- disparam. E o código descartava o erro em silêncio, então quando não
-- funcionava ninguém ficava sabendo: a pessoa entrava, continuava marcada como
-- de férias, e não havia nada no log.
--
-- CORREÇÃO
-- A transição vira uma função no banco. Ela decide sozinha, olha apenas quem
-- está chamando, e só faz a única coisa que pode fazer — o que tira da jogada
-- a política, o gatilho e a ordem deles.

create or replace function public.encerrar_minhas_ferias()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  eu record;
begin
  if auth.uid() is null then
    return false;
  end if;

  select id, status, retorno_previsto into eu
  from profiles where id = auth.uid();

  if eu is null or eu.status is distinct from 'ferias' then
    return false;
  end if;

  if eu.retorno_previsto is null then
    return false;
  end if;

  -- A data é comparada no fuso da empresa, e não em UTC. O banco roda em UTC:
  -- entre 21h e a meia-noite de Brasília já é o dia seguinte lá, e quem
  -- entrasse nesse intervalo voltaria de férias um dia antes do previsto.
  if eu.retorno_previsto > (now() at time zone 'America/Sao_Paulo')::date then
    return false;
  end if;

  update profiles
  set status = 'ativo',
      retorno_previsto = null,
      updated_at = now()
  where id = auth.uid();

  return true;
end;
$$;

comment on function public.encerrar_minhas_ferias is
  'Devolve a própria conta de Férias para Ativo quando a data de retorno chegou. Só age sobre quem chama, só na transição ferias -> ativo, e só a partir da data — não há como usá-la para outra coisa.';

revoke all on function public.encerrar_minhas_ferias() from public, anon;
grant execute on function public.encerrar_minhas_ferias() to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Conferência
-- ------------------------------------------------------------

-- Quem está de férias e com data vencida (deve zerar no próximo acesso de cada um):
--   select email, status, retorno_previsto,
--          (now() at time zone 'America/Sao_Paulo')::date as hoje_brasil
--   from profiles
--   where status = 'ferias' and retorno_previsto <= (now() at time zone 'America/Sao_Paulo')::date;
