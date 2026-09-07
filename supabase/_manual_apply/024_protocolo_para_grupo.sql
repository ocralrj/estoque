-- ============================================================
-- Protocolo endereçado a um grupo, e não só a uma pessoa
--
-- Idempotente. Depende de: 023_bate_e_volta_e_limpeza.sql
-- ============================================================

-- PROBLEMA
-- O protocolo só podia ser atribuído a uma pessoa. Mas boa parte das
-- solicitações não é para alguém em particular: é para o Financeiro, para o
-- DP, para quem estiver de plantão. Endereçar a uma pessoa nesse caso escolhe
-- um responsável arbitrário — e se ela estiver de férias, a solicitação para.
--
-- CORREÇÃO
-- O protocolo passa a poder ir para um grupo. Quem está no grupo vê, é
-- notificado e pode responder. A atribuição nominal continua existindo, para
-- quando há mesmo uma pessoa certa.

-- ------------------------------------------------------------
-- 1. O destino em grupo
-- ------------------------------------------------------------

alter table protocolos
  add column if not exists assigned_group_id uuid references user_groups(id) on delete set null;

comment on column protocolos.assigned_group_id is
  'Grupo responsável, quando a solicitação é para uma área e não para uma pessoa. Conviver com assigned_to é proposital: um protocolo pode ir para o grupo e depois ser assumido por alguém dele.';

create index if not exists protocolos_assigned_group_idx
  on protocolos (assigned_group_id)
  where assigned_group_id is not null;

-- ------------------------------------------------------------
-- 2. Quem está no grupo é avisado
-- ------------------------------------------------------------

create or replace function public.notifica_protocolo_atribuido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  destinos uuid[] := '{}';
  nome_grupo text;
begin
  -- Pessoa nomeada, quando mudou.
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    destinos := array_append(destinos, new.assigned_to);
  end if;

  -- Grupo, quando mudou: todo mundo que está nele.
  if new.assigned_group_id is not null
     and (tg_op = 'INSERT' or new.assigned_group_id is distinct from old.assigned_group_id) then
    select g.name into nome_grupo from user_groups g where g.id = new.assigned_group_id;

    destinos := destinos || coalesce(
      (select array_agg(p.id) from profiles p
        where p.group_id = new.assigned_group_id and p.active = true),
      '{}'
    );
  end if;

  if array_length(destinos, 1) is null then
    return new;
  end if;

  perform public.notificar(
    destinos,
    case when nome_grupo is not null
         then 'Protocolo para ' || nome_grupo
         else 'Protocolo atribuído a você' end,
    coalesce(new.nup, '') || ' — ' || left(coalesce(new.title, 'sem título'), 100),
    '/dashboard/protocolos/' || new.id::text,
    'protocolos:protocolos:read',
    coalesce(new.requester_id, auth.uid())
  );

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. O anexo acompanha o destino
--
-- Se a solicitação é do grupo, o anexo dela também é: mandar um protocolo para
-- uma área cujo anexo ninguém da área consegue abrir é o mesmo que não mandar.
-- ------------------------------------------------------------

create or replace function public.ged_pode_ler(doc_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from ged_documents d
    where d.id = doc_id
      and (
        d.created_by = auth.uid()
        or public.get_user_role()::text in ('super_admin', 'gestor')
        or d.visibilidade = 'todos'
        or (
          d.visibilidade = 'departamento'
          and public.get_user_departamento() is not null
          and d.setor = public.get_user_departamento()
        )
        or exists (
          select 1 from ged_document_access a
          where a.document_id = doc_id and a.user_id = auth.uid()
        )
        -- Anexo de protocolo: quem abriu, quem responde, e o grupo destinatário.
        or exists (
          select 1 from protocolos p
          where p.id = d.protocolo_id
            and (
              auth.uid() in (p.requester_id, p.assigned_to)
              or (
                p.assigned_group_id is not null
                and p.assigned_group_id = (
                  select group_id from profiles where id = auth.uid()
                )
              )
            )
        )
      )
  );
$$;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 4. Conferência
-- ------------------------------------------------------------

--   select p.nup, p.title, g.name as grupo, pr.email as pessoa
--   from protocolos p
--   left join user_groups g on g.id = p.assigned_group_id
--   left join profiles pr on pr.id = p.assigned_to
--   order by p.created_at desc limit 10;
