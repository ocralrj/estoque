-- ============================================================
-- GED: quem lê e quem edita cada documento + exclusão só por admin
--
-- Idempotente. Depende de: schema_ged.sql e 005_ged_arquivos.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Visibilidade do documento
--
--   'todos'    → qualquer usuário autenticado lê (padrão, como era antes)
--   'restrito' → só quem estiver em ged_document_access, além do autor
-- ------------------------------------------------------------

alter table ged_documents add column if not exists visibilidade text
  not null default 'todos';

do $$ begin
  alter table ged_documents add constraint ged_documents_visibilidade_check
    check (visibilidade in ('todos', 'restrito'));
exception
  when duplicate_object then null;
end $$;

comment on column ged_documents.visibilidade is
  'todos = qualquer autenticado lê; restrito = apenas autor e quem consta em ged_document_access.';

-- ------------------------------------------------------------
-- 2. Concessões por usuário
-- ------------------------------------------------------------

create table if not exists ged_document_access (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references ged_documents(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  -- 'leitura' abre só a consulta; 'edicao' abre consulta e alteração.
  nivel text not null default 'leitura' check (nivel in ('leitura', 'edicao')),
  granted_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, user_id)
);

create index if not exists ged_document_access_doc_idx on ged_document_access (document_id);
create index if not exists ged_document_access_user_idx on ged_document_access (user_id);

alter table ged_document_access enable row level security;

-- ------------------------------------------------------------
-- 3. Funções de apoio
--
-- SECURITY DEFINER para não recursionar: a política de ged_documents precisa
-- consultar ged_document_access, cuja própria política consulta ged_documents.
-- ------------------------------------------------------------

create or replace function public.ged_pode_ler(doc_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from ged_documents d
    where d.id = doc_id
      and (
        d.visibilidade = 'todos'
        or d.created_by = auth.uid()
        or public.get_user_role()::text in ('super_admin', 'gestor')
        or exists (
          select 1 from ged_document_access a
          where a.document_id = doc_id and a.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.ged_pode_editar(doc_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.get_user_role()::text in ('super_admin', 'gestor')
    or exists (
      select 1 from ged_documents d
      where d.id = doc_id and d.created_by = auth.uid()
    )
    or exists (
      select 1 from ged_document_access a
      where a.document_id = doc_id
        and a.user_id = auth.uid()
        and a.nivel = 'edicao'
    );
$$;

-- ------------------------------------------------------------
-- 4. Políticas de ged_document_access
-- ------------------------------------------------------------

drop policy if exists "GED acesso: leitura pelos envolvidos" on ged_document_access;
create policy "GED acesso: leitura pelos envolvidos"
  on ged_document_access for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife')
  );

drop policy if exists "GED acesso: concessão por quem edita" on ged_document_access;
create policy "GED acesso: concessão por quem edita"
  on ged_document_access for all
  to authenticated
  using (public.ged_pode_editar(document_id))
  with check (public.ged_pode_editar(document_id));

-- ------------------------------------------------------------
-- 5. Políticas de ged_documents, agora com permissão por documento
--
-- As antigas eram "qualquer autenticado lê / gestão faz tudo". A de escrita
-- usava FOR ALL, o que incluía DELETE — por isso é substituída por políticas
-- separadas: exclusão passa a ser exclusiva do super admin.
-- ------------------------------------------------------------

drop policy if exists "GED: leitura autenticada de documentos" on ged_documents;
create policy "GED: leitura autenticada de documentos"
  on ged_documents for select
  to authenticated
  using (public.ged_pode_ler(id));

drop policy if exists "GED: escrita de documentos por gestão" on ged_documents;

drop policy if exists "GED: criação de documentos por gestão" on ged_documents;
create policy "GED: criação de documentos por gestão"
  on ged_documents for insert
  to authenticated
  with check (
    public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife')
  );

drop policy if exists "GED: alteração por quem tem permissão" on ged_documents;
create policy "GED: alteração por quem tem permissão"
  on ged_documents for update
  to authenticated
  using (public.ged_pode_editar(id))
  with check (public.ged_pode_editar(id));

-- Exclusão: somente super admin. Um documento apagado leva junto a trilha de
-- auditoria e o binário; é a operação sem volta do módulo.
drop policy if exists "GED: exclusão somente por super admin" on ged_documents;
create policy "GED: exclusão somente por super admin"
  on ged_documents for delete
  to authenticated
  using (public.get_user_role()::text = 'super_admin');

-- ------------------------------------------------------------
-- 6. Storage: remover arquivo também vira exclusivo do super admin
-- ------------------------------------------------------------

drop policy if exists "GED: remoção de arquivos por gestão" on storage.objects;
create policy "GED: remoção de arquivos por super admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ged'
    and public.get_user_role()::text = 'super_admin'
  );
