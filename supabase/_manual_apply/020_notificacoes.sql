-- ============================================================
-- Notificações: o sino passa a receber alguma coisa
--
-- Idempotente. Depende de: 019_restaura_get_user_role.sql
-- ============================================================

-- PROBLEMA
-- A tabela `notifications` existe, o sino do topo a consulta e a rota de
-- marcar como lida funciona — mas nenhuma linha do sistema jamais INSERE uma
-- notificação. O recurso está inteiro, menos a parte que o dispara: por isso o
-- sino sempre diz "ainda não há notificações", e uma sugestão nova chega sem
-- ninguém ficar sabendo.
--
-- CORREÇÃO
-- Gatilhos no banco, e não chamadas espalhadas pelas telas. Assim a
-- notificação acontece por qualquer caminho que crie o registro — a tela, uma
-- Server Action, uma correção feita à mão no SQL Editor — e não depende de
-- alguém lembrar de chamá-la no lugar certo.

-- ------------------------------------------------------------
-- 1. Como uma notificação é criada
--
-- SECURITY DEFINER porque quem dispara o gatilho quase nunca tem permissão de
-- escrever na caixa de outra pessoa: quem envia uma sugestão é um requisitante,
-- e a política de insert exige gestão. É o gatilho que responde pela escrita,
-- não quem o disparou.
-- ------------------------------------------------------------

create or replace function public.notificar(
  p_destinatarios uuid[],
  p_titulo text,
  p_mensagem text
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into notifications (user_id, title, message)
  select p.id, p_titulo, p_mensagem
  from profiles p
  where p.id = any(p_destinatarios)
    and p.active = true
    -- Ninguém é avisado do que acabou de fazer.
    and p.id is distinct from auth.uid();
$$;

comment on function public.notificar is
  'Cria uma notificação para cada destinatário ativo, pulando quem disparou a ação.';

-- Quem responde pela gestão hoje. Uma consulta só, para os gatilhos não
-- repetirem a regra de "quem é gestão" cada um do seu jeito.
create or replace function public.ids_da_gestao()
returns uuid[]
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(array_agg(id), '{}')
  from profiles
  where active = true
    and role::text in ('super_admin', 'gestor');
$$;

-- ------------------------------------------------------------
-- 2. Sugestão nova avisa a gestão
-- ------------------------------------------------------------

create or replace function public.notifica_sugestao_nova()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  autor text;
begin
  select coalesce(nullif(trim(full_name), ''), email)
    into autor
  from profiles where id = new.user_id;

  perform public.notificar(
    public.ids_da_gestao(),
    'Nova sugestão de melhoria',
    coalesce(autor, 'Alguém') || ' enviou: ' || left(new.title, 120)
  );

  return new;
end;
$$;

drop trigger if exists sugestao_nova_notifica on public.improvement_suggestions;
create trigger sugestao_nova_notifica
  after insert on public.improvement_suggestions
  for each row execute function public.notifica_sugestao_nova();

-- ------------------------------------------------------------
-- 3. Resposta da gestão avisa quem enviou
--
-- Quem escreveu uma sugestão e nunca soube o que aconteceu com ela não escreve
-- a segunda. O aviso de volta é o que sustenta o canal.
-- ------------------------------------------------------------

create or replace function public.notifica_sugestao_respondida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mudou_status boolean := new.status is distinct from old.status;
  mudou_nota boolean := coalesce(new.admin_notes, '') is distinct from coalesce(old.admin_notes, '');
begin
  if not (mudou_status or mudou_nota) then
    return new;
  end if;

  perform public.notificar(
    array[new.user_id],
    'Sua sugestão foi atualizada',
    left(new.title, 80) || ' — agora está como "' || new.status::text || '"'
      || case when mudou_nota and coalesce(new.admin_notes, '') <> ''
              then '. Há um retorno da equipe.'
              else '' end
  );

  return new;
end;
$$;

drop trigger if exists sugestao_respondida_notifica on public.improvement_suggestions;
create trigger sugestao_respondida_notifica
  after update on public.improvement_suggestions
  for each row execute function public.notifica_sugestao_respondida();

-- ------------------------------------------------------------
-- 4. Protocolo atribuído avisa o responsável
--
-- Atribuir uma tarefa a alguém que não fica sabendo é o mesmo que não
-- atribuir.
-- ------------------------------------------------------------

create or replace function public.notifica_protocolo_atribuido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  perform public.notificar(
    array[new.assigned_to],
    'Protocolo atribuído a você',
    coalesce(new.nup, '') || ' — ' || left(coalesce(new.title, 'sem título'), 100)
  );

  return new;
end;
$$;

do $$ begin
  drop trigger if exists protocolo_atribuido_notifica on public.protocolos;
  create trigger protocolo_atribuido_notifica
    after insert or update on public.protocolos
    for each row execute function public.notifica_protocolo_atribuido();
exception
  when undefined_table then
    raise notice 'Tabela protocolos ausente; gatilho de protocolo não criado.';
end $$;

-- ------------------------------------------------------------
-- 5. Notificação não é para sempre
--
-- Sem limpeza a tabela cresce indefinidamente e o sino fica lento. Noventa
-- dias cobre com folga qualquer consulta útil ao histórico.
-- ------------------------------------------------------------

create or replace function public.limpar_notificacoes_antigas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removidas integer;
begin
  if public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador limpa notificações.';
  end if;

  delete from notifications
  where created_at < now() - interval '90 days' and is_read;
  get diagnostics removidas = row_count;
  return removidas;
end;
$$;

revoke all on function public.limpar_notificacoes_antigas() from public, anon;
grant execute on function public.limpar_notificacoes_antigas() to authenticated;

-- As funções de gatilho não são endpoint: fecham como as demais (migração 016).
revoke all on function public.notificar(uuid[], text, text) from public, anon, authenticated;
revoke all on function public.ids_da_gestao() from public, anon, authenticated;
revoke all on function public.notifica_sugestao_nova() from public, anon, authenticated;
revoke all on function public.notifica_sugestao_respondida() from public, anon, authenticated;
revoke all on function public.notifica_protocolo_atribuido() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------

-- Depois de enviar uma sugestão nova, a gestão recebeu?
--   select p.email, n.title, n.message, n.is_read, n.created_at
--   from notifications n join profiles p on p.id = n.user_id
--   order by n.created_at desc limit 10;
