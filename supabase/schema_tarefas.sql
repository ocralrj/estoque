-- ============================================================
-- Sistema de tarefas (pessoa para pessoa + Notificações)
--
-- Idempotente. Depende de: schema_estoque.sql, schema_grupos_permissoes.sql,
-- schema_auditoria.sql, 020_notificacoes.sql, 022_notificacao_com_destino.sql.
--
-- -- Como atualizar --
-- Este arquivo é a versão KANBAN do módulo: reescreve os estados de
-- `aberta/em_andamento/concluida/cancelada` para o fluxo
-- `aguardando -> em_andamento -> confirmacao -> concluida` (com `cancelada`),
-- remove a atribuição a grupos e inclui comentários/histórico com notificação
-- da outra parte. Pode ser reexecutado: os comandos migram dados parados
-- (status `aberta` vira `aguardando`, coluna `assigned_group_id` é removida)
-- e recreiam gatilhos e políticas do zero (drop if exists antes de cada).
-- ============================================================

-- PROBLEMA
-- A tarefa era "para a área": abria para um nome ou um grupo e a gestão via
-- tudo. Quem pediu ficava sem saber quando a outra parte começou, terminou ou
-- devolveu; quem executava sem aviso do que faltava. O aprovação não existia:
-- o executor concluía sozinho, sem quem pediu confirmar que resolveu de fato.
--
-- CORREÇÃO
-- A tarefa passa a ser sempre de pessoa para pessoa: quem criou (solicitante)
-- e quem foi nomeado (executor). A situação caminha por confirmação — o
-- executor marca como feita, o solicitante valida. Cada mudança de estado,
-- devolução e comentário avisa a outra parte envolvida. Atrasar avisa ambos,
-- todo dia, enquanto a tarefa estiver fora de concluída/cancelada.

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
  status text not null default 'aguardando'
    check (status in ('aguardando', 'em_andamento', 'confirmacao', 'concluida', 'cancelada')),
  prazo date,

  created_by uuid not null references profiles(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete set null,
  concluida_por uuid references profiles(id) on delete set null,
  concluida_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tarefas is
  'Compromisso de pessoa para pessoa: quem criou (solicitante) pede a quem foi nomeado (executor). Andamento do tipo aguardando -> em_andamento -> confirmacao -> concluida, com cancelada para desistência/recusa no encaminhamento.';

-- Migração da versão anterior: o status `aberta` passa a ser `aguardando` e a
-- atribuição a grupo deixa de existir — toda tarefa tem um executor nominal.
--
-- Antes de mexer nos dados, TODOS os gatilhos da tabela são pausados. Numa
-- reexecução, o `tarefas_checa_transicao` de uma execução anterior ainda está
-- de pé (só é recriado mais adiante neste arquivo) e ele não conhece `aberta`
-- como origem — o UPDATE `aberta -> aguardando` terminaria em "Transição de
-- situação inválida: aberta -> aguardando". Cada gatilho é recriado no seu
-- lugar abaixo; nada fica faltando.
do $$
declare
  r record;
begin
  for r in select tgname from pg_trigger
    where tgrelid = 'public.tarefas'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on public.tarefas', r.tgname);
  end loop;
end;
$$;

-- Num banco já corrigido, as políticas RLS da versão anterior também dependem
-- da coluna `assigned_group_id` ("Tarefas: leitura" / "Tarefas: edição de quem
-- alcança" a referenciam). Um `drop column` aqui terminaria em 2BP01 —
-- "cannot drop column ... because other objects depend on it". Derrubamos TODAS
-- as políticas da tabela neste ponto e as recriamos na seção 4, então nada fica
-- faltando. Assim o arquivo continua reexecutável de ponta a ponta.
do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tarefas'
  loop
    execute format('drop policy if exists %I on public.tarefas', r.policyname);
  end loop;
end;
$$;

alter table public.tarefas drop constraint if exists tarefas_status_check;
update public.tarefas set status = 'aguardando' where status = 'aberta';
alter table public.tarefas drop column if exists assigned_group_id;
drop index if exists tarefas_assigned_group_idx;

alter table public.tarefas add constraint tarefas_status_check
  check (status in ('aguardando', 'em_andamento', 'confirmacao', 'concluida', 'cancelada'));

create index if not exists tarefas_status_idx
  on public.tarefas (status, prazo);
create index if not exists tarefas_created_by_idx
  on public.tarefas (created_by);
create index if not exists tarefas_assigned_to_idx
  on public.tarefas (assigned_to)
  where assigned_to is not null;

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
-- Fluxo: aguardando -> em_andamento -> confirmacao -> concluida.
--   aguardando   chegou ao executor, falta ele iniciar (ou recusar).
--   em_andamento em execução; o executor põe como feita ou devolve à central.
--   confirmacao  feita pelo executor; falta o solicitante validar.
--   concluida    validada por quem pediu.
--   cancelada    recusada no encaminhamento ou desistência de quem pediu.
--
-- O gatilho barra pulos inválidos E conferencia quem pode mover (solicitante,
-- executor ou super admin segundo o estado). A validação final — confirmacao
-- para concluida — é exclusiva de quem solicitou.
-- ------------------------------------------------------------

create or replace function public.tarefas_checa_transicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  eh_admin boolean := public.get_user_role()::text = 'super_admin';
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Mudar a situação de uma tarefa exige sessão.';
  end if;

  -- Pulos inválidos, em qualquer papel.
  if not (
    -- Aguardando: começa ou recusa no encaminhamento.
    (old.status = 'aguardando' and new.status in ('em_andamento', 'cancelada'))
    -- Em andamento: devolve à central, marca como feita ou desiste.
    or (old.status = 'em_andamento' and new.status in ('aguardando', 'confirmacao', 'cancelada'))
    -- Confirmação: valida, devolve à central, reabre para ajuste ou desiste.
    or (old.status = 'confirmacao' and new.status in ('aguardando', 'em_andamento', 'concluida', 'cancelada'))
  ) then
    raise exception 'Transição de situação inválida: % -> %', old.status, new.status;
  end if;

  -- Validação final: só quem pediu move de confirmação para concluída.
  if new.status = 'concluida' and auth.uid() is distinct from old.created_by then
    raise exception 'Apenas quem solicitou a tarefa pode confirmar a conclusão.';
  end if;

  -- Marcar como feita (-> confirmacao): o executor (ou o super admin).
  if new.status = 'confirmacao'
     and old.assigned_to is distinct from auth.uid()
     and not eh_admin then
    raise exception 'Apenas o executor pode marcar a tarefa como feita.';
  end if;

  -- Iniciar (aguardando -> em_andamento): quem vai executar (ou o super admin).
  if old.status = 'aguardando' and new.status = 'em_andamento'
     and old.assigned_to is distinct from auth.uid()
     and not eh_admin then
    raise exception 'Apenas quem vai executar (ou a gestão) pode iniciar a tarefa.';
  end if;

  -- Devolver à central (em_andamento -> aguardando): executor, solicitante ou gestão.
  if new.status = 'aguardando' and old.status = 'em_andamento'
     and old.assigned_to is distinct from auth.uid()
     and old.created_by is distinct from auth.uid()
     and not eh_admin then
    raise exception 'Apenas o executor ou quem pediu pode devolver a tarefa à central.';
  end if;

  -- Reabrir para ajuste (confirmacao -> em_andamento): executor, solicitante ou gestão.
  if old.status = 'confirmacao' and new.status = 'em_andamento'
     and old.assigned_to is distinct from auth.uid()
     and old.created_by is distinct from auth.uid()
     and not eh_admin then
    raise exception 'Apenas o executor ou quem pediu pode reabrir a tarefa para ajuste.';
  end if;

  -- Cancelar: quem pediu (desistência) ou o executor (recusa no encaminhamento).
  if new.status = 'cancelada'
     and old.assigned_to is distinct from auth.uid()
     and old.created_by is distinct from auth.uid()
     and not eh_admin then
    raise exception 'Apenas quem pediu ou o executor pode cancelar a tarefa.';
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_checa_transicao on public.tarefas;
create trigger tarefas_checa_transicao
  before update of status on public.tarefas
  for each row execute function public.tarefas_checa_transicao();

-- Quem concluiu e quando: preenchido pelo gatilho, no momento da transição —
-- nunca no campo da tela. Na nova regra, é sempre o solicitante que valida.
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
-- 3. Histórico e comentários
--
-- `tarefa_comentarios` guarda o fio da conversa (tipo `comentario`) e o rastro
-- das transições (tipo `transicao`, escrito pelo gatilho abaixo). O rodapé do
-- card ("Histórico e edição (N)") conta essas linhas; remover a tarefa apaga
-- o histórico junto, em cascata.
-- ------------------------------------------------------------

create table if not exists public.tarefa_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete set null,
  tipo text not null default 'comentario'
    check (tipo in ('comentario', 'transicao')),
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists tarefa_comentarios_tarefa_idx
  on public.tarefa_comentarios (tarefa_id, created_at);

comment on table public.tarefa_comentarios is
  'Histórico da tarefa: comentários inseridos pelas partes e transições de situação escritas pelo gatilho. Apagar a tarefa leva o histórico junto.';

-- A transição escreve sua própria linha no histórico, com quem mexeu.
create or replace function public.tarefa_loga_transicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rotulo_antigo text;
  rotulo_novo text;
  mapa text := 'aguardando=Aguardando|em_andamento=Em andamento|confirmacao=Confirmação|concluida=Concluída|cancelada=Cancelada';
begin
  if new.status is distinct from old.status then
    select split_part(value, '=', 2) into rotulo_antigo
    from unnest(string_to_array(mapa, '|')) value
    where split_part(value, '=', 1) = old.status;
    select split_part(value, '=', 2) into rotulo_novo
    from unnest(string_to_array(mapa, '|')) value
    where split_part(value, '=', 1) = new.status;

    insert into public.tarefa_comentarios (tarefa_id, autor_id, tipo, texto)
    values (
      new.id,
      auth.uid(),
      'transicao',
      'Situação: ' || coalesce(rotulo_antigo, old.status)
        || ' → ' || coalesce(rotulo_novo, new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_loga_transicao on public.tarefas;
create trigger tarefas_loga_transicao
  after update of status on public.tarefas
  for each row execute function public.tarefa_loga_transicao();

revoke all on function public.tarefa_loga_transicao() from public, anon, authenticated;

alter table public.tarefa_comentarios enable row level security;

-- Quem participa da tarefa (solicitante, executor ou super admin) enxerga o
-- histórico dela. A função ignora o RLS e corta a recursão com `tarefas`.
create or replace function public.pode_ver_tarefa(p_tarefa uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from tarefas t
    where t.id = p_tarefa
      and (
        t.created_by = auth.uid()
        or t.assigned_to = auth.uid()
        or public.get_user_role()::text = 'super_admin'
      )
  );
$$;

-- O comentário a API escrever é só `comentario` — transição só o gatilho faz.
drop policy if exists "Histórico: leitura de quem participa" on public.tarefa_comentarios;
create policy "Histórico: leitura de quem participa"
  on public.tarefa_comentarios for select
  to authenticated
  using (public.pode_ver_tarefa(tarefa_id));

drop policy if exists "Histórico: comentário de quem participa" on public.tarefa_comentarios;
create policy "Histórico: comentário de quem participa"
  on public.tarefa_comentarios for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and tipo = 'comentario'
    and public.pode_ver_tarefa(tarefa_id)
  );

-- Comentário avisa a OUTRA parte envolvida: quem não comentou.
create or replace function public.notifica_comentario_da_tarefa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
  destino uuid;
  autor text;
begin
  if new.tipo <> 'comentario' then
    return new;
  end if;

  select id, created_by, assigned_to, codigo, titulo into t
  from tarefas where id = new.tarefa_id;

  if t.created_by = new.autor_id then
    destino := t.assigned_to;
  else
    destino := t.created_by;
  end if;

  if destino is null then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into autor
  from profiles where id = new.autor_id;

  perform public.notificar(
    array[destino],
    'Novo comentário na tarefa',
    coalesce(autor, 'Alguém') || ' em ' || coalesce(t.codigo, '')
      || ' — ' || left(coalesce(new.texto, ''), 120),
    '/dashboard/tarefas/' || t.id::text,
    'tarefas:tarefas:read',
    new.autor_id
  );

  return new;
end;
$$;

drop trigger if exists tarefa_comentario_notifica on public.tarefa_comentarios;
create trigger tarefa_comentario_notifica
  after insert on public.tarefa_comentarios
  for each row execute function public.notifica_comentario_da_tarefa();

revoke all on function public.notifica_comentario_da_tarefa() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Quem vê o quê
--
-- Pessoa para pessoa: solicitante (created_by) e executor (assigned_to) veem a
-- tarefa; o super admin vê todas. Não existe mais visão "toda a gestão" — o
-- módulo é do par envolvido. Editar e mover seguem a mesma cerca; a exclusão
-- fica com quem pediu e com o super admin.
-- ------------------------------------------------------------

alter table public.tarefas enable row level security;

drop policy if exists "Tarefas: leitura" on public.tarefas;
create policy "Tarefas: leitura"
  on public.tarefas for select
  to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.get_user_role()::text = 'super_admin'
  );

drop policy if exists "Tarefas: autenticado abre" on public.tarefas;
create policy "Tarefas: autenticado abre"
  on public.tarefas for insert
  to authenticated
  with check (created_by = auth.uid());

-- Quem participa edita; o gatilho de transição confere QUEM pode mover para
-- qual estado. Aqui vale só a cerca: alcançar a linha = editar campos.
drop policy if exists "Tarefas: edição de quem participa" on public.tarefas;
create policy "Tarefas: edição de quem participa"
  on public.tarefas for update
  to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.get_user_role()::text = 'super_admin'
  )
  with check (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.get_user_role()::text = 'super_admin'
  );

-- Remover é tirar do mundo (o histórico vai junto): quem pediu ou o super admin.
drop policy if exists "Tarefas: exclusão pelo criador ou administração" on public.tarefas;
create policy "Tarefas: exclusão pelo criador ou administração"
  on public.tarefas for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.get_user_role()::text = 'super_admin'
  );

-- ------------------------------------------------------------
-- 5. Avisos
-- ------------------------------------------------------------

-- Nova tarefa (ou nova atribuição) avisa o executor — sempre uma pessoa.
create or replace function public.notifica_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
    perform public.notificar(
      array[new.assigned_to],
      'Nova tarefa atribuída a você',
      coalesce(new.codigo, '') || ' — ' || left(coalesce(new.titulo, 'sem título'), 100),
      '/dashboard/tarefas/' || new.id::text,
      'tarefas:tarefas:read',
      new.created_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_atribuicao_notifica on public.tarefas;
create trigger tarefas_atribuicao_notifica
  after insert or update of assigned_to on public.tarefas
  for each row execute function public.notifica_tarefa_atribuida();

revoke all on function public.notifica_tarefa_atribuida() from public, anon, authenticated;

-- Cada mudança de situação avisa a outra parte envolvida, com o texto exato
-- do produto: iniciou, aguarda validação, validada, devolvida, cancelada.
create or replace function public.notifica_tarefa_movida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nome_ator text;
  nome_executor text;
  titulo_tarefa text := left(coalesce(new.titulo, 'sem título'), 100);
  link_tarefa text := '/dashboard/tarefas/' || new.id::text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into nome_ator
  from profiles where id = auth.uid();
  select coalesce(nullif(trim(full_name), ''), email) into nome_executor
  from profiles where id = new.assigned_to;

  -- Início de execução -> avisa quem pediu.
  if new.status = 'em_andamento' and old.status = 'aguardando' then
    perform public.notificar(
      array[new.created_by],
      'A tarefa começou',
      'O executor ' || coalesce(nome_executor, nome_ator, 'Alguém')
        || ' iniciou a tarefa ' || titulo_tarefa,
      link_tarefa,
      'tarefas:tarefas:read',
      new.assigned_to
    );

  -- Marcar como feita -> avisa quem pediu que falta validar.
  elsif new.status = 'confirmacao' then
    perform public.notificar(
      array[new.created_by],
      'Aguardando sua validação',
      'A tarefa ' || titulo_tarefa || ' foi concluída por '
        || coalesce(nome_executor, nome_ator, 'Alguém') || ' e aguarda sua validação',
      link_tarefa,
      'tarefas:tarefas:read',
      new.assigned_to
    );

  -- Validação final -> avisa o executor.
  elsif new.status = 'concluida' and old.status = 'confirmacao' then
    perform public.notificar(
      array[new.assigned_to],
      'Tarefa validada',
      'A tarefa ' || titulo_tarefa || ' foi validada por ' || coalesce(nome_ator, 'quem pediu', 'Alguém'),
      link_tarefa,
      'tarefas:tarefas:read',
      new.created_by
    );

  -- Devolução à central -> avisa quem pediu.
  elsif new.status = 'aguardando' and old.status in ('em_andamento', 'confirmacao') then
    perform public.notificar(
      array[new.created_by],
      'Tarefa devolvida à central',
      'O executor ' || coalesce(nome_ator, 'Alguém') || ' devolveu a tarefa ' || titulo_tarefa,
      link_tarefa,
      'tarefas:tarefas:read',
      new.created_by
    );

  -- Cancelada -> avisa a parte que não cancelou.
  elsif new.status = 'cancelada' then
    perform public.notificar(
      array[case when auth.uid() = new.created_by then new.assigned_to else new.created_by end],
      'Tarefa cancelada',
      'A tarefa ' || titulo_tarefa || ' foi cancelada',
      link_tarefa,
      'tarefas:tarefas:read',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tarefas_resolvida_notifica on public.tarefas;
create trigger tarefas_resolvida_notifica
  after update of status on public.tarefas
  for each row execute function public.notifica_tarefa_movida();

revoke all on function public.notifica_tarefa_movida() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. Auditoria
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
      'prioridade', new.prioridade, 'prazo', new.prazo,
      'executor', new.assigned_to
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
-- 7. Aviso de vencimento e de atraso
--
-- Dia do prazo: o executor é avisado ("vence hoje"). Passou do prazo e a
-- tarefa não está concluída nem cancelada: TODOS OS DIAS o executor recebe
-- "está atrasada" e o solicitante recebe "solicitada a [executor] está
-- atrasada há X dia(s)". O aviso nunca repete no mesmo dia.
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
  nome_executor text;
begin
  if auth.uid() is not null
     and public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador dispara os avisos.';
  end if;

  for t in
    select t.id, t.codigo, t.titulo, t.prazo,
           t.assigned_to, t.created_by
    from tarefas t
    where t.status in ('aguardando', 'em_andamento', 'confirmacao')
      and t.prazo is not null
      and t.prazo <= current_date
      and t.assigned_to is not null
  loop
    select coalesce(nullif(trim(full_name), ''), email) into nome_executor
    from profiles where id = t.assigned_to;

    -- Executor: hoje ou atrasada.
    insert into notifications (user_id, title, message, link, permissao, origem_id)
    select p.id,
           case
             when t.prazo = current_date then 'A tarefa vence hoje'
             else 'Tarefa atrasada há ' || (current_date - t.prazo) || ' dia(s)' end,
           coalesce(t.codigo, '') || ' — ' || left(coalesce(t.titulo, 'sem título'), 100),
           '/dashboard/tarefas/' || t.id::text,
           'tarefas:tarefas:read',
           t.created_by
    from profiles p
    where p.id = t.assigned_to
      and p.active = true
      -- Sem repetição do mesmo aviso no mesmo dia.
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id
          and n.message = coalesce(t.codigo, '') || ' — ' || left(coalesce(t.titulo, 'sem título'), 100)
          and n.created_at > current_date
      );

    -- Solicitante: só quando já atrasou.
    if t.prazo < current_date then
      insert into notifications (user_id, title, message, link, permissao, origem_id)
      select p.id,
             'Tarefa atrasada',
             'A tarefa ' || left(coalesce(t.titulo, 'sem título'), 100)
               || ' solicitada a ' || coalesce(nome_executor, 'alguém')
               || ' está atrasada há ' || (current_date - t.prazo) || ' dia(s)',
             '/dashboard/tarefas/' || t.id::text,
             'tarefas:tarefas:read',
             t.assigned_to
      from profiles p
      where p.id = t.created_by
        and p.active = true
        and not exists (
          select 1 from notifications n
          where n.user_id = p.id
            and n.message = 'A tarefa ' || left(coalesce(t.titulo, 'sem título'), 100)
              || ' solicitada a ' || coalesce(nome_executor, 'alguém')
              || ' está atrasada há ' || (current_date - t.prazo) || ' dia(s)'
            and n.created_at > current_date
        );
    end if;

    avisados := avisados + 1;
  end loop;

  return avisados;
end;
$$;

comment on function public.avisar_tarefas_atrasadas is
  'Avisa dia do prazo (executor) e todos os dias de atraso (executor + solicitante) para tarefas fora de concluída/cancelada. Disparado pela rotina diária; sem repetição no mesmo dia.';

revoke all on function public.avisar_tarefas_atrasadas() from public, anon;
grant execute on function public.avisar_tarefas_atrasadas() to authenticated, service_role;

-- ------------------------------------------------------------
-- 8. Permissões
--
-- O catálogo permanece: leitura, criação e edição alcançam todos (cada um no
-- que é seu, pela RLS), excluir e administrar ficam com a coordenação
-- (nível 30, o almoxarife, para cima). O super admin decide tudo no banco
-- além da validação final, que é do solicitante.
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
-- 9. Conferência
-- ------------------------------------------------------------

-- Quem administra todas as tarefas:
--   select g.name, g.nivel from user_groups g
--   join group_permissions gp on gp.group_id = g.id
--   join permissions p on p.id = gp.permission_id
--   where p.module = 'tarefas' and p.action = 'manage';

-- Só quem pediu valida (deve ser true para o created_by e erro para o resto):
--   select public.get_user_role();