-- ============================================================
-- Status do usuário: Ativo, Férias e Inativo
--
-- Idempotente. Depende de: 012_troca_senha_inicial.sql
-- ============================================================

-- PROBLEMA
-- A conta só tinha dois estados, `active` true ou false. Quem sai de férias não
-- está inativo: continua sendo funcionário, os documentos continuam sendo dele,
-- e desativar a conta apagaria essa distinção — além de obrigar alguém a
-- lembrar de reativar na volta, o que ninguém lembra.
--
-- CORREÇÃO
-- Um estado próprio para férias, com data de retorno obrigatória, e o retorno
-- acontecendo sozinho: no primeiro acesso a partir da data prevista, as férias
-- são apagadas e a conta volta a Ativo. Não depende de ninguém lembrar.

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------

alter table profiles add column if not exists status text
  not null default 'ativo';

alter table profiles add column if not exists retorno_previsto date;

comment on column profiles.status is
  'ativo | ferias | inativo. `active` é derivado daqui por gatilho: só inativo bloqueia o acesso — quem está de férias continua entrando, é assim que o retorno é detectado.';

comment on column profiles.retorno_previsto is
  'Data prevista de volta, obrigatória enquanto status = ferias. É apagada no primeiro acesso a partir dela, junto com o próprio status de férias.';

-- Alinha quem já existe antes de impor as restrições.
update profiles set status = 'inativo' where active = false and status <> 'inativo';
update profiles set status = 'ativo'   where active = true  and status not in ('ferias', 'ativo');

do $$ begin
  alter table profiles drop constraint if exists profiles_status_check;
  alter table profiles add constraint profiles_status_check
    check (status in ('ativo', 'ferias', 'inativo'));

  -- Férias sem data de volta é o mesmo buraco de antes: ninguém sabe quando
  -- acaba, e o retorno automático não teria como acontecer.
  alter table profiles drop constraint if exists profiles_ferias_exige_data;
  alter table profiles add constraint profiles_ferias_exige_data
    check (status <> 'ferias' or retorno_previsto is not null);
end $$;

create index if not exists profiles_status_idx on profiles (status);

-- ------------------------------------------------------------
-- 2. `active` passa a ser derivado do status
--
-- A coluna `active` continua sendo a que o resto do sistema consulta —
-- get_user_role() devolve NULL para quem está inativo, e é isso que barra o
-- acesso via API mesmo com token válido. Manter as duas em sincronia por
-- gatilho evita que uma tela esqueça de atualizar a outra.
-- ------------------------------------------------------------

create or replace function public.profiles_sincroniza_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.active := (new.status <> 'inativo');
  elsif new.status is distinct from old.status then
    new.active := (new.status <> 'inativo');
  elsif new.active is distinct from old.active then
    -- Telas antigas que ainda mexem em `active` continuam funcionando.
    new.status := case
      when not new.active then 'inativo'
      when old.status = 'inativo' then 'ativo'
      else old.status
    end;
  end if;

  -- Fora de férias, a data de retorno não significa nada e não fica guardada.
  if new.status <> 'ferias' then
    new.retorno_previsto := null;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_status_sync on profiles;
create trigger profiles_status_sync
  before insert or update on profiles
  for each row execute function public.profiles_sincroniza_status();

-- ------------------------------------------------------------
-- 3. Ninguém muda o próprio status
--
-- A política "Usuário atualiza seu próprio perfil" existe para nome e foto,
-- mas ela alcança a linha inteira: sem esta trava, qualquer pessoa se colocaria
-- em férias, se reativaria depois de desativada ou trocaria o próprio
-- departamento — e o departamento é o que decide quais documentos ela lê.
--
-- A única mudança que a própria pessoa faz é encerrar férias já vencidas, que é
-- o retorno automático do item 4.
-- ------------------------------------------------------------

create or replace function public.profiles_protege_campos_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  papel text;
begin
  -- Sem sessão é a chave de serviço agindo no servidor (pré-cadastro), que já
  -- passou pela checagem de papel na aplicação.
  if auth.uid() is null then
    return new;
  end if;

  papel := public.get_user_role()::text;
  if papel in ('super_admin', 'gestor') then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Apenas a gestão altera papéis.';
  end if;

  if new.departamento is distinct from old.departamento then
    raise exception 'Apenas a gestão define o departamento.';
  end if;

  if new.active is distinct from old.active then
    raise exception 'Apenas a gestão ativa ou desativa contas.';
  end if;

  if new.status is distinct from old.status then
    if not (
      old.status = 'ferias'
      and new.status = 'ativo'
      and old.retorno_previsto is not null
      and old.retorno_previsto <= current_date
    ) then
      raise exception 'Apenas a gestão altera o status de acesso.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protege_acesso on profiles;
create trigger profiles_protege_acesso
  before update on profiles
  for each row execute function public.profiles_protege_campos_de_acesso();

-- ------------------------------------------------------------
-- 4. O gestor volta a conseguir administrar usuários
--
-- A aplicação já deixava o gestor mudar papel, departamento e status, mas a
-- única política de update era a do super admin: o UPDATE não alcançava linha
-- nenhuma e voltava "sucesso" sem ter salvado nada. O `with check` impede que o
-- gestor promova alguém a super admin por esse caminho.
-- ------------------------------------------------------------

drop policy if exists "Gestor atualiza perfis comuns" on profiles;
create policy "Gestor atualiza perfis comuns"
  on profiles for update
  to authenticated
  using (
    public.get_user_role()::text = 'gestor'
    and role::text <> 'super_admin'
  )
  with check (role::text <> 'super_admin');

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

-- select email, role, status, retorno_previsto, active from profiles order by status, email;

-- Quem está de férias com a data já vencida (volta a Ativo no próximo acesso):
--   select email, retorno_previsto from profiles
--   where status = 'ferias' and retorno_previsto <= current_date;
