-- ============================================================
-- Anexo do protocolo, arquivado no GED
--
-- Idempotente. Depende de: 020_notificacoes.sql
-- ============================================================

-- PROBLEMA
-- Um protocolo é uma solicitação, e solicitação quase sempre vem com papel
-- junto: a nota que justifica, o contrato em discussão, a foto do problema.
-- Hoje não há onde pôr esse arquivo, e ele acaba indo por fora do sistema —
-- em e-mail, em conversa — onde ninguém mais o encontra depois.
--
-- CORREÇÃO
-- O anexo vira um documento do GED, e não um arquivo solto pendurado no
-- protocolo. Assim ele herda o que o acervo já sabe fazer: controle de quem
-- lê, trilha de auditoria, compactação, prazo de guarda e busca. E fica de
-- quem o anexou, não do protocolo — se o protocolo for encerrado, o documento
-- continua sendo do autor.

-- ------------------------------------------------------------
-- 1. O vínculo
-- ------------------------------------------------------------

alter table ged_documents
  add column if not exists protocolo_id uuid references protocolos(id) on delete set null;

comment on column ged_documents.protocolo_id is
  'Protocolo que originou este documento, quando ele veio de um anexo. `on delete set null` de propósito: apagar o protocolo não apaga o documento, que pertence a quem o anexou e pode ser referência de outra coisa.';

create index if not exists ged_documents_protocolo_idx
  on ged_documents (protocolo_id)
  where protocolo_id is not null;

-- ------------------------------------------------------------
-- 2. Quem participa do protocolo enxerga o anexo
--
-- Sem isto, o responsável designado receberia um protocolo cujo anexo não pode
-- abrir — que é o mesmo que não receber o anexo. O acesso segue o protocolo:
-- quem abriu e quem responde por ele leem, e mais ninguém, a não ser que o
-- autor compartilhe explicitamente.
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
        -- Anexo de protocolo: quem abriu e quem responde por ele leem.
        or exists (
          select 1 from protocolos p
          where p.id = d.protocolo_id
            and auth.uid() in (p.requester_id, p.assigned_to)
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- 3. Anexo novo avisa quem responde pelo protocolo
--
-- Aproveita as notificações da migração 020: um documento anexado a um
-- protocolo que já tem responsável precisa chegar ao conhecimento dele.
-- ------------------------------------------------------------

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
    coalesce(numero, 'Protocolo') || ' — ' || left(new.nome, 100)
  );

  return new;
end;
$$;

drop trigger if exists ged_anexo_protocolo_notifica on ged_documents;
create trigger ged_anexo_protocolo_notifica
  after insert on ged_documents
  for each row execute function public.notifica_anexo_de_protocolo();

revoke all on function public.notifica_anexo_de_protocolo() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 4. Conferência
-- ------------------------------------------------------------

-- Documentos que vieram de protocolo:
--   select d.nome, d.created_by, p.nup, p.title
--   from ged_documents d join protocolos p on p.id = d.protocolo_id
--   order by d.created_at desc;
