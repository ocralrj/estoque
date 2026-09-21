-- ============================================================
-- Módulo Contabilidade — análises de balancetes de clientes
-- ============================================================
-- Guarda análises processadas de balancetes: identificação, contas
-- estruturadas, indicadores e o relatório. O arquivo original (PDF, Excel,
-- CSV) NUNCA é guardado — ele é processado no navegador e descartado; só os
-- dados extraídos sobem para estas tabelas. Não existe coluna nem tabela para
-- o documento original, de propósito.
--
-- Idempotente: pode ser reexecutado. Aplicar depois de
-- `schema_grupos_permissoes.sql` (usa `user_has_permission`) e da base de
-- empresas (`031_empresas_e_certificados.sql`).
-- Ordem completa em `docs/APLICAR_SQL.md`.

-- ------------------------------------------------------------
-- 1. Análises (uma linha por empresa + período; nunca sobrescreve)
-- ------------------------------------------------------------
create table if not exists public.analises_balancetes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  -- Período identificado dentro do documento, quando o parser encontra.
  periodo_doc_inicio date,
  periodo_doc_fim date,
  status text not null default 'processando'
    check (status in ('processando', 'processado', 'erro')),
  erro_etapa text,
  erro_mensagem text,
  totais jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  check (periodo_inicio <= periodo_fim)
);

create index if not exists analises_balancetes_empresa_idx
  on public.analises_balancetes (empresa_id, periodo_fim desc);

-- ------------------------------------------------------------
-- 2. Contas estruturadas do balancete
-- ------------------------------------------------------------
create table if not exists public.balancete_contas (
  id uuid primary key default gen_random_uuid(),
  analise_id uuid not null references public.analises_balancetes(id) on delete cascade,
  codigo text not null default '',
  descricao text not null default '',
  natureza text not null default '' check (natureza in ('', 'devedora', 'credora')),
  debitos numeric not null default 0,
  creditos numeric not null default 0,
  saldo numeric not null default 0,
  classificacao text not null default 'outro'
    check (classificacao in ('ativo', 'passivo', 'patrimonio_liquido', 'receita', 'custo', 'despesa', 'outro')),
  grupo text
);

create index if not exists balancete_contas_analise_idx
  on public.balancete_contas (analise_id);

-- ------------------------------------------------------------
-- 3. Indicadores calculados (chave estável permite comparar períodos)
-- ------------------------------------------------------------
create table if not exists public.balancete_indicadores (
  id uuid primary key default gen_random_uuid(),
  analise_id uuid not null references public.analises_balancetes(id) on delete cascade,
  chave text not null,
  rotulo text not null default '',
  formula text,
  valor numeric,
  interpretacao text,
  limitacao text,
  unique (analise_id, chave)
);

create index if not exists balancete_indicadores_analise_idx
  on public.balancete_indicadores (analise_id);

-- ------------------------------------------------------------
-- 4. Relatório da análise (uma linha por análise)
-- ------------------------------------------------------------
create table if not exists public.balancete_resultado (
  analise_id uuid primary key references public.analises_balancetes(id) on delete cascade,
  resumo_executivo text not null default '',
  analise_patrimonial text not null default '',
  analise_resultado text not null default '',
  analise_liquidez text not null default '',
  analise_endividamento text not null default '',
  capital_giro text not null default '',
  pontos_atencao jsonb not null default '[]'::jsonb,
  nao_conclusivo jsonb not null default '{}'::jsonb,
  recomendacoes text not null default '',
  documentos_recomendados jsonb not null default '[]'::jsonb,
  ia_usada boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. Permissões do módulo (gestão concede ao grupo contábil depois)
-- ------------------------------------------------------------
insert into public.permissions (module, resource, action, description) values
  ('contabilidade', 'balancetes', 'create', 'Criar análises de balancetes'),
  ('contabilidade', 'balancetes', 'read', 'Visualizar análises de balancetes'),
  ('contabilidade', 'balancetes', 'update', 'Editar análises de balancetes'),
  ('contabilidade', 'balancetes', 'delete', 'Excluir análises de balancetes')
on conflict (module, resource, action) do nothing;

-- ------------------------------------------------------------
-- 5b. Concessão inicial: gestão (Administradores + Gestores).
-- Só adiciona o que falta (`on conflict do nothing`); nunca remove nem
-- sobrescreve concessões que a gestão já configurou. Sem isto o item
-- "Contabilidade" existe no menu mas fica invisível para todas as sessões,
-- porque a navegação filtra por permissão.
-- ------------------------------------------------------------
insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.user_groups g
cross join public.permissions p
where p.module = 'contabilidade'
  and g.name in ('Administradores', 'Gestores')
on conflict do nothing;

-- ------------------------------------------------------------
-- 6. RLS: só quem tem a permissão do módulo (gestão + grupo contábil)
-- ------------------------------------------------------------
alter table public.analises_balancetes enable row level security;
alter table public.balancete_contas enable row level security;
alter table public.balancete_indicadores enable row level security;
alter table public.balancete_resultado enable row level security;

drop policy if exists "Balancetes: leitura" on public.analises_balancetes;
create policy "Balancetes: leitura"
  on public.analises_balancetes for select
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'read'));

drop policy if exists "Balancetes: criação" on public.analises_balancetes;
create policy "Balancetes: criação"
  on public.analises_balancetes for insert
  to authenticated
  with check (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'));

drop policy if exists "Balancetes: edição" on public.analises_balancetes;
create policy "Balancetes: edição"
  on public.analises_balancetes for update
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'update'))
  with check (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'update'));

drop policy if exists "Balancetes: exclusão" on public.analises_balancetes;
create policy "Balancetes: exclusão"
  on public.analises_balancetes for delete
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'delete'));

drop policy if exists "Contas: leitura" on public.balancete_contas;
create policy "Contas: leitura"
  on public.balancete_contas for select
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'read'));

drop policy if exists "Contas: escrita" on public.balancete_contas;
create policy "Contas: escrita"
  on public.balancete_contas for all
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'))
  with check (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'));

drop policy if exists "Indicadores: leitura" on public.balancete_indicadores;
create policy "Indicadores: leitura"
  on public.balancete_indicadores for select
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'read'));

drop policy if exists "Indicadores: escrita" on public.balancete_indicadores;
create policy "Indicadores: escrita"
  on public.balancete_indicadores for all
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'))
  with check (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'));

drop policy if exists "Resultado: leitura" on public.balancete_resultado;
create policy "Resultado: leitura"
  on public.balancete_resultado for select
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'read'));

drop policy if exists "Resultado: escrita" on public.balancete_resultado;
create policy "Resultado: escrita"
  on public.balancete_resultado for all
  to authenticated
  using (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'))
  with check (public.user_has_permission(auth.uid(), 'contabilidade', 'balancetes', 'create'));

notify pgrst, 'reload schema';
