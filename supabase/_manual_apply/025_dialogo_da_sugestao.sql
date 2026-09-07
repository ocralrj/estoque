-- ============================================================
-- Diálogo na sugestão, encerramento pelo autor e descarte em 30 dias
--
-- Idempotente. Depende de: 024_protocolo_para_grupo.sql
-- ============================================================

-- PROBLEMA
-- A conversa é de mão única. A gestão escreve em `admin_notes`, o autor lê — e
-- não tem como responder. Se ele discorda, se falta um detalhe, se a resposta
-- não resolveu, o assunto sai do sistema e vai para o corredor. E quem decide
-- que a sugestão acabou é a gestão, não quem pediu: uma sugestão marcada como
-- concluída sem o autor concordar continua aberta na cabeça dele.
--
-- Além disso, `admin_notes` é um campo só: cada resposta apaga a anterior.
-- Depois de três voltas não sobra registro do que foi dito.
--
-- CORREÇÃO
-- Um fio de mensagens de verdade, com autor e data em cada uma. Quem encerra é
-- quem pediu, marcando como atendida. Encerrada, ela é descartada 30 dias
-- depois — o que ficou resolvido não precisa ocupar a lista para sempre.

-- ------------------------------------------------------------
-- 1. Status de encerramento pelo autor
-- ------------------------------------------------------------

do $$ begin
  alter type suggestion_status add value if not exists 'atendida';
exception
  when others then null;
end $$;

alter table public.improvement_suggestions
  add column if not exists atendida_em timestamptz;

comment on column public.improvement_suggestions.atendida_em is
  'Quando o autor deu a sugestão por atendida. É a partir daqui que contam os 30 dias até o descarte — e é o autor que marca, não a gestão: dar por resolvido o que outra pessoa pediu é decidir por ela.';

-- ------------------------------------------------------------
-- 2. O fio de mensagens
--
-- Tabela própria, e não mais texto sobrescrito em admin_notes: uma conversa
-- entre duas pessoas precisa de quem disse, o quê e quando. `admin_notes`
-- continua existindo com a última resposta, para as telas antigas não
-- quebrarem.
-- ------------------------------------------------------------

create table if not exists public.suggestion_messages (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.improvement_suggestions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  /** true quando quem escreveu respondia pela gestão naquele momento. */
  da_gestao boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists suggestion_messages_sugestao_idx
  on public.suggestion_messages (suggestion_id, created_at);

alter table public.suggestion_messages enable row level security;

drop policy if exists "Fio: leitura pelo autor e pela gestão" on public.suggestion_messages;
create policy "Fio: leitura pelo autor e pela gestão"
  on public.suggestion_messages for select
  to authenticated
  using (
    public.get_user_role()::text in ('super_admin', 'gestor')
    or exists (
      select 1 from public.improvement_suggestions s
      where s.id = suggestion_id and s.user_id = auth.uid()
    )
  );

-- Escrita só pela função abaixo, que registra quem falou e avisa o outro lado.
drop policy if exists "Fio: escrita pela função" on public.suggestion_messages;

-- ------------------------------------------------------------
-- 3. Responder — pelos dois lados
-- ------------------------------------------------------------

create or replace function public.responder_sugestao(
  p_sugestao uuid,
  p_texto text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  papel text := public.get_user_role()::text;
  gestao boolean;
  quem text;
  nova uuid;
begin
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'Escreva a mensagem antes de enviar.';
  end if;

  select * into s from public.improvement_suggestions where id = p_sugestao;
  if s is null then
    raise exception 'Sugestão não encontrada.';
  end if;

  gestao := papel in ('super_admin', 'gestor');

  -- Só conversam os dois lados desta sugestão.
  if not gestao and s.user_id is distinct from auth.uid() then
    raise exception 'Esta sugestão não é sua.';
  end if;

  if s.status = 'atendida' then
    raise exception 'Esta sugestão já foi encerrada pelo autor.';
  end if;

  insert into public.suggestion_messages (suggestion_id, user_id, texto, da_gestao)
  values (p_sugestao, auth.uid(), left(trim(p_texto), 2000), gestao)
  returning id into nova;

  select coalesce(nullif(trim(full_name), ''), email) into quem
  from profiles where id = auth.uid();

  if gestao then
    -- Passa por admin_notes para o gatilho da migração 023 contar a volta e
    -- marcar como reenviada, em vez de duplicar essa regra aqui.
    update public.improvement_suggestions
    set admin_notes = left(trim(p_texto), 2000)
    where id = p_sugestao;
  else
    -- O autor respondeu: a bola volta para a gestão.
    update public.improvement_suggestions
    set status = case when status = 'reenviada' then 'em_analise' else status end,
        updated_at = now()
    where id = p_sugestao;

    perform public.notificar(
      public.ids_da_gestao(),
      'Resposta na sugestão ' || coalesce(s.code, ''),
      coalesce(quem, 'O autor') || ': ' || left(trim(p_texto), 120),
      '/dashboard/admin/sugestoes',
      'sugestoes:todas:read',
      auth.uid()
    );
  end if;

  return nova;
end;
$$;

revoke all on function public.responder_sugestao(uuid, text) from public, anon;
grant execute on function public.responder_sugestao(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Encerrar — só quem pediu
-- ------------------------------------------------------------

create or replace function public.marcar_sugestao_atendida(p_sugestao uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  quem text;
begin
  select * into s from public.improvement_suggestions where id = p_sugestao;
  if s is null then
    raise exception 'Sugestão não encontrada.';
  end if;

  -- Dar por resolvido o que outra pessoa pediu é decidir por ela. Nem a
  -- gestão encerra no lugar do autor.
  if s.user_id is distinct from auth.uid() then
    raise exception 'Só quem enviou a sugestão pode dá-la por atendida.';
  end if;

  update public.improvement_suggestions
  set status = 'atendida', atendida_em = now(), updated_at = now()
  where id = p_sugestao;

  select coalesce(nullif(trim(full_name), ''), email) into quem
  from profiles where id = auth.uid();

  perform public.notificar(
    public.ids_da_gestao(),
    'Sugestão encerrada pelo autor',
    coalesce(quem, 'O autor') || ' deu por atendida: ' || left(s.title, 100),
    '/dashboard/admin/sugestoes',
    'sugestoes:todas:read',
    auth.uid()
  );

  return true;
end;
$$;

revoke all on function public.marcar_sugestao_atendida(uuid) from public, anon;
grant execute on function public.marcar_sugestao_atendida(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Sugestão atendida é descartada em 30 dias
--
-- Pega carona na mesma rotina diária que limpa as notificações. Só as
-- atendidas: recusada ou concluída sem o aval do autor continua na lista,
-- porque para ele o assunto pode não ter terminado.
-- ------------------------------------------------------------

create or replace function public.limpar_sugestoes_atendidas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removidas integer;
begin
  if auth.uid() is not null
     and public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador limpa sugestões.';
  end if;

  delete from public.improvement_suggestions
  where status = 'atendida'
    and atendida_em is not null
    and atendida_em < now() - interval '30 days';

  get diagnostics removidas = row_count;
  return removidas;
end;
$$;

revoke all on function public.limpar_sugestoes_atendidas() from public, anon;
grant execute on function public.limpar_sugestoes_atendidas() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------

-- O fio de uma sugestão:
--   select m.created_at, p.email, m.da_gestao, m.texto
--   from suggestion_messages m join profiles p on p.id = m.user_id
--   where m.suggestion_id = '<id>' order by m.created_at;

-- Quantas seriam descartadas hoje:
--   select count(*) from improvement_suggestions
--   where status = 'atendida' and atendida_em < now() - interval '30 days';
