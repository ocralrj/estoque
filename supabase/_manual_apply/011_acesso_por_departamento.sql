-- ============================================================
-- GED: acesso por departamento
--
-- Idempotente. Depende de: 010_seguranca_admin.sql
-- ============================================================

-- PROBLEMA
-- A visibilidade só tinha dois extremos: "todos da equipe" ou uma lista nominal
-- montada à mão. Como a maioria dos documentos interessa ao departamento que os
-- arquivou, quem quisesse restringir tinha de marcar pessoa por pessoa em todo
-- cadastro — trabalho repetitivo que leva a deixar tudo aberto por preguiça.
--
-- CORREÇÃO
-- Um terceiro modo, e que passa a ser o padrão: quem pertence ao departamento
-- do documento lê. O documento já registra o departamento de origem, então a
-- regra não precisa olhar quem criou — e continua correta mesmo que a pessoa
-- mude de área depois.
--
-- A lista nominal continua existindo, agora como compartilhamento adicional:
-- some da tela até alguém pedir por ela.

-- ------------------------------------------------------------
-- 1. O usuário passa a ter departamento
-- ------------------------------------------------------------

alter table profiles add column if not exists departamento text;

comment on column profiles.departamento is
  'Nome do departamento a que a pessoa pertence, casando com departamentos.nome. Define o que ela vê no GED quando o documento é de visibilidade "departamento".';

create index if not exists profiles_departamento_idx on profiles (departamento);

-- ------------------------------------------------------------
-- 2. Terceiro modo de visibilidade
-- ------------------------------------------------------------

alter table ged_documents alter column visibilidade set default 'departamento';

do $$ begin
  alter table ged_documents drop constraint if exists ged_documents_visibilidade_check;
  alter table ged_documents add constraint ged_documents_visibilidade_check
    check (visibilidade in ('todos', 'departamento', 'restrito'));
exception
  when others then null;
end $$;

comment on column ged_documents.visibilidade is
  'todos = qualquer autenticado lê; departamento = quem é do mesmo departamento do documento; restrito = apenas autor e quem consta em ged_document_access.';

-- ------------------------------------------------------------
-- 3. Departamento do usuário atual, sem recursão
-- ------------------------------------------------------------

create or replace function public.get_user_departamento()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select departamento from public.profiles
  where id = auth.uid()
    and active = true;
$$;

-- ------------------------------------------------------------
-- 4. A regra de leitura passa a considerar o departamento
--
-- Em qualquer modo, o autor e a gestão continuam enxergando: quem arquivou
-- precisa reencontrar o próprio documento, e gestor e administrador respondem
-- pelo acervo inteiro.
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
      )
  );
$$;

-- Alterar segue mais estrito que ler: departamento dá leitura, não edição.
-- Quem precisa alterar recebe "ler e alterar" nominalmente.
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
-- 5. Semear o departamento de quem já existe
--
-- Só onde o e-mail deixa claro (lina.dp@ → DP). O resto fica em branco para
-- ser preenchido na tela — chutar aqui atribuiria acesso indevido.
-- ------------------------------------------------------------

update profiles
set departamento = 'DP'
where departamento is null and email ilike '%.dp@%';

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------

-- Quem ainda está sem departamento (verá apenas documentos "todos" e os seus):
--   select email, role, departamento from profiles order by departamento nulls first;
