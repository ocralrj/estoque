-- ============================================================
-- Férias passam a bloquear o acesso, até a véspera da volta
--
-- Idempotente. Depende de: 032_pedidos_de_material.sql
-- ============================================================

-- REGRA
-- Quem está de férias não entra no sistema. O acesso volta a partir da véspera
-- da data de retorno — um dia antes, para a pessoa poder se organizar antes de
-- reassumir.
--
-- O QUE MUDA EM RELAÇÃO À MIGRAÇÃO 013
-- Lá, férias mantinha o acesso de propósito: era entrando que a pessoa
-- disparava o próprio retorno. Agora que o acesso é bloqueado, essa passagem
-- acontece na véspera — que é justamente quando ela volta a poder entrar.
--
-- ONDE O BLOQUEIO MORA
-- Em get_user_role(), que já é o ponto único por onde passam as 36 políticas do
-- sistema. Papel nulo significa nenhum acesso a dado nenhum, exatamente como
-- acontece com quem está inativo. Espalhar essa checagem pelas telas deixaria
-- brechas: a API continuaria respondendo para quem soubesse chamá-la.

-- ------------------------------------------------------------
-- 1. Quem está de férias não tem papel — até a véspera
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
    and active = true
    -- Férias bloqueiam, menos a partir da véspera do retorno.
    and (
      status is distinct from 'ferias'
      or retorno_previsto is null
      or retorno_previsto <= (now() at time zone 'America/Sao_Paulo')::date + 1
    );
$$;

comment on function public.get_user_role is
  'Papel do usuário autenticado, ou NULL quando a conta está inativa OU em férias antes da véspera do retorno. É o ponto único de bloqueio: nulo aqui significa nenhum acesso em nenhuma política. Nunca remova as condições.';

-- ------------------------------------------------------------
-- 2. A volta acontece na véspera
-- ------------------------------------------------------------

create or replace function public.encerrar_minhas_ferias()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  eu record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
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

  -- Um dia antes já vale: é quando o acesso volta, e entrar é o que encerra.
  if eu.retorno_previsto > hoje + 1 then
    return false;
  end if;

  update profiles
  set status = 'ativo', retorno_previsto = null, updated_at = now()
  where id = auth.uid();

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 3. A trava de auto-edição acompanha a nova data
--
-- Sem isto, a pessoa entraria na véspera e o gatilho recusaria o encerramento,
-- porque ele ainda exigia que a data já tivesse chegado.
-- ------------------------------------------------------------

create or replace function public.profiles_protege_campos_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  papel text;
  nivel_de_quem_edita integer;
  nivel_alvo integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  papel := public.get_user_role()::text;

  if papel is null or papel not in ('super_admin', 'gestor') then
    if new.role is distinct from old.role then
      raise exception 'Apenas a gestão altera papéis.';
    end if;
    if new.group_id is distinct from old.group_id then
      raise exception 'Apenas a gestão altera o grupo de uma pessoa.';
    end if;
    if new.departamento is distinct from old.departamento then
      raise exception 'Apenas a gestão define o departamento.';
    end if;
    if new.cargo_id is distinct from old.cargo_id then
      raise exception 'Apenas a gestão define o cargo.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Apenas a gestão ativa ou desativa contas.';
    end if;
    if new.status is distinct from old.status then
      if not (
        old.status = 'ferias'
        and new.status = 'ativo'
        and old.retorno_previsto is not null
        and old.retorno_previsto <= (now() at time zone 'America/Sao_Paulo')::date + 1
      ) then
        raise exception 'Apenas a gestão altera o status de acesso.';
      end if;
    end if;
    return new;
  end if;

  if new.group_id is distinct from old.group_id and new.group_id is not null then
    select nivel into nivel_alvo from user_groups where id = new.group_id;
    select g.nivel into nivel_de_quem_edita
      from profiles p join user_groups g on g.id = p.group_id
      where p.id = auth.uid();

    if nivel_alvo is not null
       and nivel_de_quem_edita is not null
       and nivel_alvo < nivel_de_quem_edita then
      raise exception 'Você não pode mover alguém para um grupo acima do seu.';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. O próprio perfil continua legível
--
-- A pessoa de férias precisa conseguir ler a própria linha: é dela que a tela
-- tira a data para dizer "você volta em tal dia". Sem esta política, ela veria
-- uma tela vazia sem explicação — bloqueio sem motivo visível parece defeito.
-- ------------------------------------------------------------

drop policy if exists "Usuário vê seu próprio perfil" on profiles;
create policy "Usuário vê seu próprio perfil"
  on profiles for select
  to authenticated
  using (auth.uid() = id and active = true);

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

-- Quem está bloqueado por férias hoje:
--   select email, retorno_previsto,
--          retorno_previsto - 1 as libera_em
--   from profiles
--   where status = 'ferias'
--     and retorno_previsto > (now() at time zone 'America/Sao_Paulo')::date + 1;

-- A função tem as duas condições? (deve conter "active" e "ferias")
--   select prosrc from pg_proc where proname = 'get_user_role';
