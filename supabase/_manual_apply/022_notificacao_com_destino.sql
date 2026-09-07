-- ============================================================
-- Notificação que leva a algum lugar — e que pode ser respondida
--
-- Idempotente. Depende de: 021_anexo_do_protocolo.sql
-- ============================================================

-- PROBLEMA
-- A notificação avisa e para por aí. Quem recebe "Nova sugestão de melhoria"
-- precisa descobrir sozinho onde ela está, e quem não tem acesso àquela tela
-- fica sabendo que algo aconteceu sem poder fazer nada a respeito — nem
-- responder a quem avisou.
--
-- CORREÇÃO
-- A notificação passa a carregar três coisas: para onde levar, que permissão o
-- destino exige, e quem a originou. Com isso a tela consegue decidir entre
-- abrir o destino ou oferecer uma resposta, em vez de deixar a pessoa parada.

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------

alter table notifications add column if not exists link text;
alter table notifications add column if not exists permissao text;
alter table notifications add column if not exists origem_id uuid references profiles(id) on delete set null;

comment on column notifications.link is
  'Rota que o clique abre, quando há para onde ir.';
comment on column notifications.permissao is
  'Permissão exigida pelo destino, no formato "modulo:recurso:acao". Sem ela a tela oferece responder em vez de navegar — abrir um link que vai recusar o acesso é pior do que não oferecer o link.';
comment on column notifications.origem_id is
  'Quem originou o aviso. É para essa pessoa que a resposta volta.';

-- ------------------------------------------------------------
-- 2. notificar() passa a levar o destino junto
-- ------------------------------------------------------------

create or replace function public.notificar(
  p_destinatarios uuid[],
  p_titulo text,
  p_mensagem text,
  p_link text default null,
  p_permissao text default null,
  p_origem uuid default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into notifications (user_id, title, message, link, permissao, origem_id)
  select p.id, p_titulo, p_mensagem, p_link, p_permissao,
         coalesce(p_origem, auth.uid())
  from profiles p
  where p.id = any(p_destinatarios)
    and p.active = true
    -- Ninguém é avisado do que acabou de fazer.
    and p.id is distinct from auth.uid();
$$;

-- ------------------------------------------------------------
-- 3. Cada gatilho passa a dizer para onde ir
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
  select coalesce(nullif(trim(full_name), ''), email) into autor
  from profiles where id = new.user_id;

  perform public.notificar(
    public.ids_da_gestao(),
    'Nova sugestão de melhoria',
    coalesce(autor, 'Alguém') || ' enviou: ' || left(new.title, 120),
    '/dashboard/admin/sugestoes',
    'sugestoes:todas:read',
    new.user_id
  );
  return new;
end;
$$;

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
              then '. Há um retorno da equipe.' else '' end,
    '/dashboard/sugestoes',
    'sugestoes:minhas:read',
    auth.uid()
  );
  return new;
end;
$$;

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
    coalesce(new.nup, '') || ' — ' || left(coalesce(new.title, 'sem título'), 100),
    '/dashboard/protocolos/' || new.id::text,
    'protocolos:protocolos:read',
    coalesce(new.requester_id, auth.uid())
  );
  return new;
end;
$$;

create or replace function public.notifica_anexo_de_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  destinos uuid[];
  numero text;
begin
  if new.protocolo_id is null then
    return new;
  end if;

  select array_remove(array[p.requester_id, p.assigned_to], null), p.nup
    into destinos, numero
  from protocolos p where p.id = new.protocolo_id;

  if destinos is null or array_length(destinos, 1) is null then
    return new;
  end if;

  perform public.notificar(
    destinos,
    'Novo anexo em protocolo',
    coalesce(numero, 'Protocolo') || ' — ' || left(new.nome, 100),
    '/dashboard/protocolos/' || new.protocolo_id::text,
    'protocolos:protocolos:read',
    new.created_by
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Responder a quem avisou
--
-- Para quem recebe um aviso sobre uma tela que não pode abrir, responder é a
-- única ação possível — e é melhor que ficar sabendo de algo sem poder reagir.
-- A resposta volta como notificação para quem originou o aviso, fechando o
-- ciclo dentro do sistema em vez de empurrá-lo para fora, no WhatsApp.
-- ------------------------------------------------------------

create or replace function public.responder_notificacao(
  p_id uuid,
  p_texto text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  aviso record;
  quem text;
begin
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'Escreva a resposta antes de enviar.';
  end if;

  -- Só se responde ao que é seu: o id vem do navegador.
  select * into aviso from notifications
  where id = p_id and user_id = auth.uid();

  if aviso is null then
    raise exception 'Notificação não encontrada.';
  end if;

  if aviso.origem_id is null then
    raise exception 'Este aviso não tem remetente para responder.';
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into quem
  from profiles where id = auth.uid();

  insert into notifications (user_id, title, message, link, permissao, origem_id)
  select aviso.origem_id,
         'Resposta de ' || coalesce(quem, 'um usuário'),
         left(p_texto, 500),
         null, null, auth.uid()
  from profiles p
  where p.id = aviso.origem_id and p.active = true;

  update notifications set is_read = true, updated_at = now() where id = p_id;
  return true;
end;
$$;

revoke all on function public.responder_notificacao(uuid, text) from public, anon;
grant execute on function public.responder_notificacao(uuid, text) to authenticated;

revoke all on function public.notificar(uuid[], text, text, text, text, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

--   select title, link, permissao, origem_id from notifications
--   order by created_at desc limit 10;
