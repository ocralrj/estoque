-- ============================================================
-- SCHEMA: GED (Gestão Eletrônica de Documentos)
-- Versão idempotente — pode ser reexecutada com segurança.
--
-- Aplicar em: Supabase Dashboard -> SQL Editor -> New Query.
-- Depende de: schema_estoque.sql — tabela `profiles`, enum `user_role` e a
-- função `public.get_user_role()`. Aplique aquele arquivo antes deste.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type ged_setor as enum ('Fiscal', 'DP', 'Contábil', 'Jurídico', 'Administrativo');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ged_status as enum ('Rascunho', 'Ativo', 'Assinado', 'Arquivado', 'Eliminado');
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- TABELA: ged_folders (estrutura documental por setor)
-- ============================================================

create table if not exists ged_folders (
  id uuid primary key default uuid_generate_v4(),
  setor ged_setor not null,
  nome text not null,
  caminho text not null,
  ativa boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (setor, caminho)
);

create index if not exists ged_folders_setor_idx on ged_folders (setor);

-- ============================================================
-- TABELA: ged_documents
-- ============================================================

create table if not exists ged_documents (
  id uuid primary key default uuid_generate_v4(),
  codigo text not null unique,
  cliente text not null,
  cnpj text,
  setor ged_setor not null,
  tipo text not null,
  nome text not null,
  folder_id uuid references ged_folders(id) on delete set null,
  caminho text,
  status ged_status not null default 'Rascunho',
  versao integer not null default 1,
  hash text,
  periodo text,
  responsavel_id uuid references profiles(id),
  data_documento date,
  validade date,
  categoria text,
  resumo text,
  tags text[] not null default '{}',
  storage_path text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ged_documents_setor_idx on ged_documents (setor);
create index if not exists ged_documents_cliente_idx on ged_documents (cliente);
create index if not exists ged_documents_status_idx on ged_documents (status);
create index if not exists ged_documents_created_at_idx on ged_documents (created_at desc);
create index if not exists ged_documents_tags_idx on ged_documents using gin (tags);

-- ============================================================
-- TABELA: ged_retention_rules (temporalidade e descarte)
-- ============================================================

create table if not exists ged_retention_rules (
  id uuid primary key default uuid_generate_v4(),
  setor ged_setor not null,
  tipo text not null,
  prazo text not null,
  destino text not null,
  base_legal text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (setor, tipo)
);

-- ============================================================
-- TABELA: ged_certificates (certificados digitais e validade)
-- ============================================================

create table if not exists ged_certificates (
  id uuid primary key default uuid_generate_v4(),
  cliente text not null,
  certificado text not null,
  validade date not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente, certificado)
);

create index if not exists ged_certificates_validade_idx on ged_certificates (validade);

-- ============================================================
-- TABELA: ged_audit (trilha de auditoria documental)
-- ============================================================

create table if not exists ged_audit (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references ged_documents(id) on delete cascade,
  documento_nome text not null,
  acao text not null,
  detalhe text,
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ged_audit_created_at_idx on ged_audit (created_at desc);
create index if not exists ged_audit_document_idx on ged_audit (document_id);

-- ============================================================
-- TRIGGER: registra a trilha de auditoria automaticamente
-- ============================================================

create or replace function ged_log_document_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    insert into ged_audit (document_id, documento_nome, acao, user_id)
    values (new.id, new.nome, 'Documento criado', new.created_by);
    return new;
  elsif (TG_OP = 'UPDATE') then
    if (new.status is distinct from old.status) then
      insert into ged_audit (document_id, documento_nome, acao, detalhe, user_id)
      values (
        new.id,
        new.nome,
        'Status alterado',
        old.status::text || ' -> ' || new.status::text,
        new.created_by
      );
    end if;
    new.updated_at := now();
    return new;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists ged_documents_audit on ged_documents;
create trigger ged_documents_audit
  after insert on ged_documents
  for each row execute function ged_log_document_change();

drop trigger if exists ged_documents_audit_update on ged_documents;
create trigger ged_documents_audit_update
  before update on ged_documents
  for each row execute function ged_log_document_change();

-- ============================================================
-- RLS
-- ============================================================

alter table ged_folders enable row level security;
alter table ged_documents enable row level security;
alter table ged_retention_rules enable row level security;
alter table ged_certificates enable row level security;
alter table ged_audit enable row level security;

-- O papel do usuário vem de public.get_user_role(), criada em
-- schema_estoque.sql (SECURITY DEFINER + search_path fixo). Não declare outra
-- função aqui: duplicar o helper foi como o projeto acabou com três versões da
-- mesma consulta, uma delas sem `set search_path`.
drop function if exists ged_current_role();

-- Leitura: qualquer usuário autenticado enxerga o acervo.
drop policy if exists "GED: leitura autenticada de pastas" on ged_folders;
create policy "GED: leitura autenticada de pastas"
  on ged_folders for select
  using (auth.uid() is not null);

drop policy if exists "GED: leitura autenticada de documentos" on ged_documents;
create policy "GED: leitura autenticada de documentos"
  on ged_documents for select
  using (auth.uid() is not null);

drop policy if exists "GED: leitura autenticada de regras" on ged_retention_rules;
create policy "GED: leitura autenticada de regras"
  on ged_retention_rules for select
  using (auth.uid() is not null);

drop policy if exists "GED: leitura autenticada de certificados" on ged_certificates;
create policy "GED: leitura autenticada de certificados"
  on ged_certificates for select
  using (auth.uid() is not null);

drop policy if exists "GED: leitura autenticada da auditoria" on ged_audit;
create policy "GED: leitura autenticada da auditoria"
  on ged_audit for select
  using (auth.uid() is not null);

-- Escrita: gestão e almoxarifado mantêm o acervo.
drop policy if exists "GED: escrita de pastas por gestão" on ged_folders;
create policy "GED: escrita de pastas por gestão"
  on ged_folders for all
  using (public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife'));

drop policy if exists "GED: escrita de documentos por gestão" on ged_documents;
create policy "GED: escrita de documentos por gestão"
  on ged_documents for all
  using (public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife'));

drop policy if exists "GED: escrita de regras por gestão" on ged_retention_rules;
create policy "GED: escrita de regras por gestão"
  on ged_retention_rules for all
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

drop policy if exists "GED: escrita de certificados por gestão" on ged_certificates;
create policy "GED: escrita de certificados por gestão"
  on ged_certificates for all
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ============================================================
-- SEED: apenas regras de temporalidade (parametrização, não conteúdo)
-- ============================================================

insert into ged_retention_rules (setor, tipo, prazo, destino, base_legal)
values
  ('Fiscal', 'Notas fiscais', '5 anos', 'Eliminação', 'CTN art. 173'),
  ('Fiscal', 'Livros fiscais', '5 anos', 'Eliminação', 'CTN art. 195'),
  ('DP', 'Folha de pagamento', '30 anos', 'Guarda permanente', 'CLT art. 11'),
  ('DP', 'Registro de empregados', '30 anos', 'Guarda permanente', 'CLT art. 41'),
  ('Contábil', 'Livros contábeis', '10 anos', 'Guarda permanente', 'Código Civil art. 1.194')
on conflict (setor, tipo) do nothing;
