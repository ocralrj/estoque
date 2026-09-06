-- ============================================================
-- Departamentos: catálogo gerenciável no lugar da lista fixa
--
-- Idempotente. Depende de: 008_ged_temporalidade.sql
-- ============================================================

-- PROBLEMA
-- Os setores do GED eram um ENUM no banco ('Fiscal', 'DP', 'Contábil',
-- 'Jurídico', 'Administrativo'). Acrescentar um significava alterar o tipo por
-- SQL — nada que um administrador pudesse fazer pela tela.
--
-- CORREÇÃO
-- Uma tabela de departamentos como catálogo, e as colunas passam de ENUM para
-- texto. Optamos por texto em vez de chave estrangeira porque o valor gravado
-- no documento é o NOME do departamento de origem no momento do arquivamento:
-- se a empresa reorganizar seus departamentos depois, o documento continua
-- dizendo de onde veio, que é o que um acervo documental precisa preservar.
-- A tela de departamentos oferece renomear em cascata quando for o caso.

-- ------------------------------------------------------------
-- 1. Catálogo
-- ------------------------------------------------------------

create table if not exists departamentos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique,
  descricao text,
  ativo boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departamentos_ativo_idx on departamentos (ativo);

alter table departamentos enable row level security;

drop policy if exists "Departamentos: leitura autenticada" on departamentos;
create policy "Departamentos: leitura autenticada"
  on departamentos for select
  to authenticated
  using (true);

drop policy if exists "Departamentos: gestão cria e edita" on departamentos;
create policy "Departamentos: gestão cria e edita"
  on departamentos for insert
  to authenticated
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

drop policy if exists "Departamentos: gestão atualiza" on departamentos;
create policy "Departamentos: gestão atualiza"
  on departamentos for update
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- Exclusão só pelo administrador, como no resto do GED.
drop policy if exists "Departamentos: exclusão somente por super admin" on departamentos;
create policy "Departamentos: exclusão somente por super admin"
  on departamentos for delete
  to authenticated
  using (public.get_user_role()::text = 'super_admin');

-- ------------------------------------------------------------
-- 2. Semente com os valores que já existiam
-- ------------------------------------------------------------

insert into departamentos (nome, descricao)
values
  ('Fiscal', 'Notas fiscais, livros e obrigações tributárias'),
  ('DP', 'Departamento pessoal: folha, ponto e registros de empregados'),
  ('Contábil', 'Escrituração, balancetes e demonstrações'),
  ('Jurídico', 'Contratos, processos e documentos societários'),
  ('Administrativo', 'Correspondência, contratos de apoio e documentos gerais')
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- 3. ENUM vira texto, preservando o que já está gravado
--
-- `using setor::text` converte cada linha existente sem perda.
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'ged_documents' and column_name = 'setor' and udt_name = 'ged_setor'
  ) then
    alter table ged_documents alter column setor type text using setor::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'ged_folders' and column_name = 'setor' and udt_name = 'ged_setor'
  ) then
    alter table ged_folders alter column setor type text using setor::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'ged_retention_rules' and column_name = 'setor' and udt_name = 'ged_setor'
  ) then
    alter table ged_retention_rules alter column setor type text using setor::text;
  end if;
end $$;

comment on column ged_documents.setor is
  'Nome do departamento de origem no momento do arquivamento. Texto, não FK: renomear o departamento não reescreve o histórico.';

-- Qualquer departamento que já apareça nos dados e não esteja no catálogo
-- entra automaticamente, para a tela não mostrar opções incompletas.
insert into departamentos (nome)
select distinct setor from ged_documents where setor is not null
union
select distinct setor from ged_folders where setor is not null
union
select distinct setor from ged_retention_rules where setor is not null
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- 4. Renomear em cascata
--
-- Chamada pela tela quando o administrador renomeia um departamento e opta por
-- atualizar os registros existentes.
-- ------------------------------------------------------------

create or replace function public.renomear_departamento(antigo text, novo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer := 0;
  n integer;
begin
  if public.get_user_role()::text not in ('super_admin', 'gestor') then
    raise exception 'Sem permissão para renomear departamento';
  end if;

  update ged_documents set setor = novo where setor = antigo;
  get diagnostics n = row_count; total := total + n;

  update ged_folders set setor = novo where setor = antigo;
  get diagnostics n = row_count; total := total + n;

  update ged_retention_rules set setor = novo where setor = antigo;
  get diagnostics n = row_count; total := total + n;

  return total;
end;
$$;

-- ------------------------------------------------------------
-- 5. updated_at
-- ------------------------------------------------------------

drop trigger if exists departamentos_updated_at on departamentos;
create trigger departamentos_updated_at
  before update on departamentos
  for each row execute function update_updated_at();
