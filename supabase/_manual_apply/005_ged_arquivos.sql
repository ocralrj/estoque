-- ============================================================
-- GED: armazenamento de arquivos eletrônicos
--
-- Acrescenta a `ged_documents` os campos do arquivo em si e cria o bucket
-- privado onde os binários ficam. Idempotente: pode reexecutar.
--
-- Depende de: schema_ged.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Campos do arquivo
-- ------------------------------------------------------------

alter table ged_documents add column if not exists mime_type text;
alter table ged_documents add column if not exists tamanho_bytes bigint;
alter table ged_documents add column if not exists tamanho_original_bytes bigint;

-- Como o binário foi guardado:
--   'nenhuma'  → subiu intacto (documento assinado: recomprimir quebraria a
--                assinatura e mudaria o hash)
--   'imagem'   → reamostrado e recodificado como JPEG/WebP
--   'gzip'     → compactado com gzip; precisa ser descompactado ao baixar
alter table ged_documents add column if not exists compressao text
  not null default 'nenhuma';

do $$ begin
  alter table ged_documents add constraint ged_documents_compressao_check
    check (compressao in ('nenhuma', 'imagem', 'gzip'));
exception
  when duplicate_object then null;
end $$;

comment on column ged_documents.compressao is
  'Como o binário em storage_path foi guardado. gzip exige descompactar no download; documento Assinado é sempre nenhuma.';

create index if not exists ged_documents_folder_idx on ged_documents (folder_id);

-- ------------------------------------------------------------
-- 2. Bucket privado
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('ged', 'ged', false, 26214400)   -- 25 MB por arquivo
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400;

-- ------------------------------------------------------------
-- 3. Políticas do bucket
--
-- Leitura para qualquer autenticado; escrita para quem mantém o acervo.
-- O nome do objeto começa com o setor, o que permite restringir por setor
-- depois sem reescrever as políticas.
-- ------------------------------------------------------------

drop policy if exists "GED: leitura de arquivos por autenticado" on storage.objects;
create policy "GED: leitura de arquivos por autenticado"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'ged');

drop policy if exists "GED: envio de arquivos por gestão" on storage.objects;
create policy "GED: envio de arquivos por gestão"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ged'
    and public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife')
  );

drop policy if exists "GED: atualização de arquivos por gestão" on storage.objects;
create policy "GED: atualização de arquivos por gestão"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'ged'
    and public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife')
  );

drop policy if exists "GED: remoção de arquivos por gestão" on storage.objects;
create policy "GED: remoção de arquivos por gestão"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ged'
    and public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife')
  );

-- ------------------------------------------------------------
-- 4. Trilha de auditoria também na exclusão
--
-- O trigger de schema_ged.sql cobre criação e mudança de status. A exclusão
-- passava sem registro — e é justamente a que mais importa auditar.
-- ------------------------------------------------------------

create or replace function ged_log_document_delete()
returns trigger as $$
begin
  insert into ged_audit (document_id, documento_nome, acao, detalhe, user_id)
  values (null, old.nome, 'Documento excluído', old.codigo, auth.uid());
  return old;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists ged_documents_audit_delete on ged_documents;
create trigger ged_documents_audit_delete
  before delete on ged_documents
  for each row execute function ged_log_document_delete();
