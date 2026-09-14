-- ============================================================
-- Sistema de tarefas
--
-- Idempotente. Depende de: schema_estoque.sql, schema_grupos_permissoes.sql,
-- schema_auditoria.sql, 020_notificacoes.sql, 022_notificacao_com_destino.sql,
-- 024_protocolo_para_grupo.sql (padrões de notificação e de grupo).
-- ============================================================

-- PROBLEMA
-- O trabalho que não é estoque, protocolo nem sugestão não tem onde morar:
-- "lembrar de renovar X", "cobrar fornecedor Y", "aplicar a decisão da reunião"
-- vivem em anotações soltas e desaparecem. Faltava um caderno de compromissos
-- com dono, prazo e situação — com aviso para quem precisa lembrar.
--
-- CORREÇÃO
-- Uma tarefa é um compromisso endereçado: título, descrição, prioridade,
-- prazo e um responsável (pessoa ou grupo). Quem abre pode acompanhar a
-- própria. A gestão (super_admin, gestor) e o almoxarife enxergam e
-- administram todas. No vencimento, o responsável é avisado.

-- ------------------------------------------------------------
-- 1. A tarefa
-- ------------------------------------------------------------

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null,
  descricao text,
  prioridade text not null default 'media'
    check (prioridade in ('baixa', 'media', 'alta')),
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'concluida', 'cancelada')),
  prazo date,

  created_by uuid not null references profiles(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete set null,
  assigned_group_id uuid references user_groups(id) on delete set null,
  concluida_por uuid references profiles(id) on delete set null,
  concluida_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tarefas is
  'Compromisso com dono, prazo e situação. Quem abre acompanha a própria; gestão e almoxarife veem todas.';

create index if not exists tarefas_status_idx
  on public.tarefas (status, prazo);
create index if not exists tarefas_created_by_idx
  on public.tarefas (created_by);
create index if not exists tarefas_assigned_to_idx
  on public.tarefas (assigned_to)
  where assigned_to is not null;
create index if not exists tarefas_assigned_group_idx
  on public.tarefas (assigned_group_id)
  where assigned_group_id is not null;

-- Código legível TAR-AAAAMMDD-NNN, quando quem insere não manda um. A
-- aplicação costuma mandar o próprio código (com sufixo aleatório); este
-- gatilho é a rede de segurança para chamadas diretas via API.
create or replace function public.gerar_codigo_tarefa()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  hoje text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD');
  seq integer;
begin
  if new.codigo is not null and length(trim(new.codigo)) > 0 then
    return new;
  end if;

  select count(*) + 1 into seq
  from tarefas where codigo like 'TAR-' || hoje || '-%';

  new.codigo := 'TAR-' || hoje || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists tarefas_codigo on public.tarefas;
create trigger tarefas_codigo
  before insert on public.tarefas
  for each row execute function public.gerar_codigo_tarefa();

drop trigger if exists tarefas_updated_at on public.tarefas;
create trigger tarefas_updated_at
  before update on public.tarefas
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 2. Situações que fazem sentido
--
-- O fluxo em geral é aberta -> em_andamento -> concluida. Cancelar desiste;
-- reabrir corrige uma conclusão por engano. O gatilho barra pulos inválidos
-- (concluir direto de cancelada, por exemplo) direto no banco, onde a
-- aplicação não alcança.
-- ------------------------------------------------------------

create or replace function public.tarefas_checa_transicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    -- desiste de uma tarefa parada
    (old.status in ('aberta', 'em_andamento') and new.status = 'cancelada')
    -- pega de volta a conclusão por engano
    or (old.status = 'concluida' and new.status = 'em_andamento')
    -- recoloca na ativa uma cancelada por engano
    or (old.status = 'cancelada' and new.status = 'aberta')
    -- o caminho comum
    or (old.status = 'aberta' and new.status in ('em_andamento', 'concluida'))
    or (old.status = 'em_andamento' and new.status in ('aberta', 'concluida'))
  ) then
    raise exception 'Transição de situação inválida: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_checa_transicao on public.tarefas;
create trigger tarefas_checa_transicao
  before update of status on public.tarefas
  for each row execute function public.tarefas_checa_transicao();

-- Quem concluiu e quando: preenchido pelo gatilho, no momento da transição —
-- nunca no campo da tela. Reabrir limpa para a nova tentativa.
create or replace function public.tarefas_marca_conclusao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'concluida' then
    new.concluida_por := coalesce(new.concluida_por, auth.uid());
    new.concluida_em := now();
  elsif old.status = 'concluida' then
    new.concluida_por := null;
    new.concluida_em := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_marca_conclusao on public.tarefas;
create trigger tarefas_marca_conclusao
  before update of status on public.tarefas
  for each row execute function public.tarefas_marca_conclusao();

-- ------------------------------------------------------------
-- 3. Quem vê o quê
--
-- Quem abriu e quem foi nomeado acompanham. Um grupo responsável vê também:
-- a tarefa é da área, não de um nome. Gestão e almoxarife veem todas — não dá
-- para coordenar uma lista que não se enxerga por inteiro.
-- ------------------------------------------------------------

alter table public.tarefas enable row level security;

create or replace function public.gere_tarefas()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife');
$$;

create or replace function public.usuario_no_grupo(p_grupo uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and group_id = p_grupo and active
  );
$$;

drop policy if exists "Tarefas: leitura" on public.tarefas;
create policy "Tarefas: leitura"
  on public.tarefas for select
  to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or (assigned_group_id is not null and public.usuario_no_grupo(assigned_group_id))
    or public.gere_tarefas()
  );

drop policy if exists "Tarefas: autenticado abre" on public.tarefas;
create policy "Tarefas: autenticado abre"
  on public.tarefas for insert
  to authenticated
  with check (created_by = auth.uid());

-- Quem pode editar é o mesmo que pode ver. O destino e a conclusão têm
-- regras próprias logo abaixo; aqui vale só a forma: quem alcança a linha
-- pode alterar os campos que a compõem.
drop policy if exists "Tarefas: edição de quem alcança" on public.tarefas;
create policy "Tarefas: edição de quem alcança"
  on public.tarefas for update
  to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or (assigned_group_id is not null and public.usuario_no_grupo(assigned_group_id))
    or public.gere_tarefas()
  )
  with check (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or (assigned_group_id is not null and public.usuario_no_grupo(assigned_group_id))
    or public.gere_tarefas()
  );

-- Apagar é retirar do mundo: só quem coordena. Quem abriu desiste via
-- "cancelar", que deixa rastro.
drop policy if exists "Tarefas: exclusão pela coordenação" on public.tarefas;
create policy "Tarefas: exclusão pela coordenação"
  on public.tarefas for delete
  to authenticated
  using (public.gere_tarefas());

-- ------------------------------------------------------------
-- 4. Avisos
-- ------------------------------------------------------------

-- A atribuição avisa o responsável: pessoa nomeada, ou todo mundo do grupo
-- quando a tarefa é da área. Quem abriu manda para a própria: o gatilho deixa
-- para o criador a escolha de se avisar, mas a notificação não chega de volta
-- para quem acabou de agir.
create or replace function public.notifica_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  destinos uuid[] := '{}';
  nome_grupo text;
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    destinos := array_append(destinos, new.assigned_to);
  end if;

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
         then 'Tarefa para ' || nome_grupo
         else 'Tarefa atribuída a você' end,
    coalesce(new.codigo, '') || ' — ' || left(coalesce(new.titulo, 'sem título'), 100),
    '/dashboard/tarefas/' || new.id::text,
    'tarefas:tarefas:read',
    new.created_by
  );

  return new;
end;
$$;

drop trigger if exists tarefas_atribuicao_notifica on public.tarefas;
create trigger tarefas_atribuicao_notifica
  after insert or update of assigned_to, assigned_group_id on public.tarefas
  for each row execute function public.notifica_tarefa_atribuida();

revoke all on function public.notifica_tarefa_atribuida() from public, anon, authenticated;

-- Concluir e cancelar avisam quem abriu: é a pessoa que queria ver resolvido.
create or replace function public.notifica_tarefa_resolvida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('concluida', 'cancelada') then
    perform public.notificar(
      array[new.created_by],
      case when new.status = 'concluida' then 'Tarefa concluída'
           else 'Tarefa cancelada' end,
      coalesce(new.codigo, '') || ' — ' || left(coalesce(new.titulo, 'sem título'), 100),
      '/dashboard/tarefas/' || new.id::text,
      'tarefas:tarefas:read',
      new.created_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_resolvida_notifica on public.tarefas;
create trigger tarefas_resolvida_notifica
  after update of status on public.tarefas
  for each row execute function public.notifica_tarefa_resolvida();

revoke all on function public.notifica_tarefa_resolvida() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Auditoria
-- ------------------------------------------------------------

create or replace function public.audit_tarefas_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  detalhes jsonb;
begin
  if tg_op = 'INSERT' then
    detalhes := jsonb_build_object(
      'codigo', new.codigo, 'titulo', new.titulo,
      'prioridade', new.prioridade, 'prazo', new.prazo
    );
  elsif tg_op = 'UPDATE' then
    detalhes := jsonb_build_object(
      'codigo', new.codigo,
      'old_status', old.status, 'new_status', new.status,
      'titulo', new.titulo
    );
  else
    detalhes := jsonb_build_object(
      'codigo', old.codigo, 'titulo', old.titulo,
      'status', old.status
    );
  end if;

  perform public.log_audit(
    'tarefas',
    lower(tg_op),
    'tarefa',
    coalesce(new.id, old.id)::text,
    detalhes
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists tarefas_audit on public.tarefas;
create trigger tarefas_audit
  after insert or update or delete on public.tarefas
  for each row execute function public.audit_tarefas_changes();

revoke all on function public.audit_tarefas_changes() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. Aviso de vencimento
--
-- O responsável é avisado no dia do prazo (e até a véspera). O aviso não se
-- repete no mesmo dia; a tarefa só volta a avisar se o prazo mudar e chegar
-- perto de novo.
-- ------------------------------------------------------------

create or replace function public.avisar_tarefas_atrasadas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  avisados integer := 0;
  t record;
  destinos uuid[];
  mensagem text;
begin
  if auth.uid() is not null
     and public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador dispara os avisos.';
  end if;

  for t in
    select t.id, t.codigo, t.titulo, t.prazo,
           t.assigned_to, t.assigned_group_id
    from tarefas t
    where t.status in ('aberta', 'em_andamento')
      and t.prazo is not null
      and t.prazo <= current_date + 1
  loop
    -- O responsável: pessoa nomeada, ou todo mundo do grupo.
    destinos := '{}';
    if t.assigned_to is not null then
      destinos := array_append(destinos, t.assigned_to);
    end if;
    if t.assigned_group_id is not null then
      destinos := destinos || coalesce(
        (select array_agg(p.id) from profiles p
          where p.group_id = t.assigned_group_id and p.active = true),
        '{}'
      );
    end if;

    -- Sem responsável, não há quem avisar: tarefa ainda em aberto, sem dono.
    if array_length(destinos, 1) is null then
      continue;
    end if;

    mensagem := coalesce(t.codigo, '') || ' — ' || left(coalesce(t.titulo, 'sem título'), 100);

    insert into notifications (user_id, title, message, link, permissao, origem_id)
    select distinct p.id,
           case
             when t.prazo < current_date then 'Tarefa vencida há ' || (current_date - t.prazo) || ' dia(s)'
             when t.prazo = current_date then 'Tarefa vence hoje'
             else 'Tarefa vence amanhã' end,
           mensagem,
           '/dashboard/tarefas/' || t.id::text,
           'tarefas:tarefas:read',
           t.created_by
    from profiles p
    where p.id = any(destinos)
      and p.active = true
      -- Sem repetição do mesmo aviso no mesmo dia.
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id
          and n.message = mensagem
          and n.created_at > current_date
      );

    avisados := avisados + 1;
  end loop;

  return avisados;
end;
$$;

comment on function public.avisar_tarefas_atrasadas is
  'Avisa o responsável de cada tarefa em andamento cujo prazo vence hoje, amanhã ou já venceu. Disparado pela rotina diária do sistema; sem aviso repetido no mesmo dia.';

revoke all on function public.avisar_tarefas_atrasadas() from public, anon;
grant execute on function public.avisar_tarefas_atrasadas() to authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Permissões
--
-- O módulo nasce com cinco ações. A leitura, a criação e a edição alcançam
-- todos (cada um no que é seu, pela RLS); administrar todas e excluir ficam
-- com a coordenação (nível 30, o almoxarife, para cima).
-- ------------------------------------------------------------

insert into permissions (module, resource, action, description) values
  ('tarefas', 'tarefas', 'read',    'Abrir a tela de tarefas e ver as próprias'),
  ('tarefas', 'tarefas', 'create',  'Criar tarefas'),
  ('tarefas', 'tarefas', 'update',  'Editar tarefas e mudar a situação'),
  ('tarefas', 'tarefas', 'delete',  'Excluir tarefas'),
  ('tarefas', 'tarefas', 'manage',  'Ver e administrar as tarefas de todas as pessoas')
on conflict (module, resource, action) do nothing;

insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g
cross join permissions p
where p.module = 'tarefas'
  and p.action in ('read', 'create', 'update')
  or (
    p.module = 'tarefas'
    and p.action in ('delete', 'manage')
    and g.nivel <= 30   -- Coordenação: almoxarife, gestor, administrador
  )
on conflict do nothing;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8. Conferência
-- ------------------------------------------------------------

-- Quais grupos administram todas as tarefas:
--   select g.name, g.nivel from user_groups g
--   join group_permissions gp on gp.group_id = g.id
--   join permissions p on p.id = gp.permission_id
--   where p.module = 'tarefas' and p.action = 'manage';

-- Teste de leitura (deve devolver true para gestão/almoxarife e false para
-- requisitante em tarefa alheia):
--   select public.gere_tarefas();