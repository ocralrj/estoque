-- ============================================================
-- Pedido de material: separar quem pede de quem entrega
--
-- Idempotente. Depende de: 031_empresas_e_certificados.sql
-- ============================================================

-- PROBLEMA
-- Hoje quem retira material é quem dá baixa. Não há separação entre pedir e
-- entregar, e o saldo passa a refletir o que alguém lembrou de registrar, não o
-- que de fato saiu. Quem precisa de uma caneta abre a tela de movimentação e
-- tira do estoque — sem pedido, sem conferência, sem responsável.
--
-- CORREÇÃO
-- O pedido vira um documento próprio: quem precisa registra o que quer, sem
-- tocar no estoque. Quem cuida do almoxarifado vê a fila, entrega o que tem, e
-- é o atendimento que gera a movimentação — com a quantidade realmente
-- entregue, que pode ser menor que a pedida.
--
-- O ganho não é burocracia: é o saldo passar a ter dono. Toda baixa vira
-- consequência de um atendimento registrado, e dá para responder "quem pediu
-- isto, quando, e quem entregou".

-- ------------------------------------------------------------
-- 1. O pedido
-- ------------------------------------------------------------

create table if not exists public.pedidos_material (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  solicitante_id uuid not null references profiles(id) on delete cascade,
  departamento text,
  justificativa text,

  status text not null default 'aberto'
    check (status in ('aberto', 'atendido', 'parcial', 'recusado', 'cancelado')),

  atendido_por uuid references profiles(id) on delete set null,
  atendido_em timestamptz,
  observacao_atendimento text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pedidos_material_status_idx
  on public.pedidos_material (status, created_at desc);
create index if not exists pedidos_material_solicitante_idx
  on public.pedidos_material (solicitante_id);

comment on table public.pedidos_material is
  'Pedido de material feito por quem precisa. Não mexe no estoque: é o atendimento que gera a movimentação de saída.';

-- ------------------------------------------------------------
-- 2. Os itens
-- ------------------------------------------------------------

create table if not exists public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_material(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  -- Null enquanto não atendido. Zero quer dizer "pedido, mas não entregue".
  quantidade_atendida integer check (quantidade_atendida >= 0),
  created_at timestamptz not null default now(),
  unique (pedido_id, product_id)
);

create index if not exists pedido_itens_pedido_idx on public.pedido_itens (pedido_id);

-- ------------------------------------------------------------
-- 3. Numeração
-- ------------------------------------------------------------

create or replace function public.gerar_numero_pedido()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  hoje text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD');
  seq integer;
begin
  if new.numero is not null and length(trim(new.numero)) > 0 then
    return new;
  end if;

  select count(*) + 1 into seq
  from pedidos_material where numero like 'REQ-' || hoje || '-%';

  new.numero := 'REQ-' || hoje || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists pedidos_material_numero on public.pedidos_material;
create trigger pedidos_material_numero
  before insert on public.pedidos_material
  for each row execute function public.gerar_numero_pedido();

drop trigger if exists pedidos_material_updated_at on public.pedidos_material;
create trigger pedidos_material_updated_at
  before update on public.pedidos_material
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 4. Quem vê o quê
--
-- Quem pediu acompanha o próprio pedido. Quem cuida do almoxarifado vê todos —
-- não dá para atender uma fila que não se enxerga.
-- ------------------------------------------------------------

alter table public.pedidos_material enable row level security;
alter table public.pedido_itens enable row level security;

create or replace function public.atende_almoxarifado()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.get_user_role()::text in ('super_admin', 'gestor', 'almoxarife');
$$;

drop policy if exists "Pedidos: leitura" on public.pedidos_material;
create policy "Pedidos: leitura"
  on public.pedidos_material for select
  to authenticated
  using (solicitante_id = auth.uid() or public.atende_almoxarifado());

drop policy if exists "Pedidos: qualquer autenticado pede" on public.pedidos_material;
create policy "Pedidos: qualquer autenticado pede"
  on public.pedidos_material for insert
  to authenticated
  with check (solicitante_id = auth.uid() and status = 'aberto');

-- Cancelar é do solicitante, enquanto ninguém atendeu. Depois disso o pedido é
-- registro de uma entrega que aconteceu, e não se apaga.
drop policy if exists "Pedidos: solicitante cancela o que ainda não saiu" on public.pedidos_material;
create policy "Pedidos: solicitante cancela o que ainda não saiu"
  on public.pedidos_material for update
  to authenticated
  using (solicitante_id = auth.uid() and status = 'aberto')
  with check (solicitante_id = auth.uid() and status in ('aberto', 'cancelado'));

drop policy if exists "Pedidos: almoxarifado atende" on public.pedidos_material;
create policy "Pedidos: almoxarifado atende"
  on public.pedidos_material for update
  to authenticated
  using (public.atende_almoxarifado())
  with check (public.atende_almoxarifado());

drop policy if exists "Itens: leitura acompanha o pedido" on public.pedido_itens;
create policy "Itens: leitura acompanha o pedido"
  on public.pedido_itens for select
  to authenticated
  using (
    public.atende_almoxarifado()
    or exists (
      select 1 from pedidos_material p
      where p.id = pedido_id and p.solicitante_id = auth.uid()
    )
  );

drop policy if exists "Itens: solicitante monta o pedido" on public.pedido_itens;
create policy "Itens: solicitante monta o pedido"
  on public.pedido_itens for insert
  to authenticated
  with check (
    exists (
      select 1 from pedidos_material p
      where p.id = pedido_id
        and p.solicitante_id = auth.uid()
        and p.status = 'aberto'
    )
  );

-- ------------------------------------------------------------
-- 5. Atender é o que gera a movimentação
--
-- Numa transação só: ou todas as saídas são registradas e o pedido fecha, ou
-- nada acontece. Metade das entregas gravadas com o pedido ainda aberto seria
-- pior do que não ter atendido.
-- ------------------------------------------------------------

create or replace function public.atender_pedido_material(
  p_pedido uuid,
  p_entregas jsonb,
  p_observacao text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pedido record;
  item record;
  entregue integer;
  total_pedido integer := 0;
  total_entregue integer := 0;
  situacao text;
begin
  if not public.atende_almoxarifado() then
    raise exception 'Você não atende pedidos de material.';
  end if;

  select * into pedido from pedidos_material where id = p_pedido;
  if pedido is null then
    raise exception 'Pedido não encontrado.';
  end if;
  if pedido.status <> 'aberto' then
    raise exception 'Este pedido já foi decidido.';
  end if;

  for item in select * from pedido_itens where pedido_id = p_pedido loop
    entregue := coalesce((p_entregas ->> item.product_id::text)::integer, 0);

    if entregue < 0 then
      raise exception 'Quantidade entregue não pode ser negativa.';
    end if;
    if entregue > item.quantidade then
      raise exception 'Não dá para entregar mais do que foi pedido.';
    end if;

    total_pedido := total_pedido + item.quantidade;
    total_entregue := total_entregue + entregue;

    update pedido_itens set quantidade_atendida = entregue where id = item.id;

    -- A saída passa pelo mesmo caminho de sempre: o gatilho de `movements`
    -- calcula o saldo e recusa se não houver quantidade. Duplicar essa conta
    -- aqui criaria duas verdades sobre o estoque.
    if entregue > 0 then
      insert into movements (product_id, type, quantity, reason, notes, created_by)
      values (
        item.product_id,
        'saida',
        entregue,
        'Atendimento do pedido ' || pedido.numero,
        coalesce(p_observacao, ''),
        auth.uid()
      );
    end if;
  end loop;

  situacao := case
    when total_entregue = 0 then 'recusado'
    when total_entregue < total_pedido then 'parcial'
    else 'atendido'
  end;

  update pedidos_material
  set status = situacao,
      atendido_por = auth.uid(),
      atendido_em = now(),
      observacao_atendimento = p_observacao
  where id = p_pedido;

  perform public.notificar(
    array[pedido.solicitante_id],
    case situacao
      when 'atendido' then 'Seu pedido de material foi atendido'
      when 'parcial' then 'Seu pedido foi atendido em parte'
      else 'Seu pedido de material não pôde ser atendido'
    end,
    pedido.numero || ' — ' || total_entregue || ' de ' || total_pedido || ' item(ns)'
      || case when coalesce(p_observacao, '') <> ''
              then '. ' || left(p_observacao, 150) else '' end,
    '/dashboard/estoque/pedidos',
    'estoque:requisicoes:read',
    auth.uid()
  );

  return situacao;
end;
$$;

revoke all on function public.atender_pedido_material(uuid, jsonb, text) from public, anon;
grant execute on function public.atender_pedido_material(uuid, jsonb, text) to authenticated;

-- ------------------------------------------------------------
-- 6. Pedido novo avisa quem atende
-- ------------------------------------------------------------

create or replace function public.notifica_pedido_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quem text;
begin
  select coalesce(nullif(trim(full_name), ''), email) into quem
  from profiles where id = new.solicitante_id;

  insert into notifications (user_id, title, message, link, permissao, origem_id)
  select p.id,
         'Novo pedido de material',
         coalesce(quem, 'Alguém') || ' pediu material — ' || new.numero,
         '/dashboard/estoque/pedidos',
         'estoque:requisicoes:manage',
         new.solicitante_id
  from profiles p
  where p.active
    and p.role::text in ('super_admin', 'gestor', 'almoxarife')
    and p.id is distinct from new.solicitante_id;

  return new;
end;
$$;

drop trigger if exists pedido_material_notifica on public.pedidos_material;
create trigger pedido_material_notifica
  after insert on public.pedidos_material
  for each row execute function public.notifica_pedido_material();

revoke all on function public.notifica_pedido_material() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. Permissões
-- ------------------------------------------------------------

insert into permissions (module, resource, action, description) values
  ('estoque', 'requisicoes', 'read',   'Ver pedidos de material'),
  ('estoque', 'requisicoes', 'create', 'Pedir material'),
  ('estoque', 'requisicoes', 'manage', 'Atender pedidos de material')
on conflict (module, resource, action) do nothing;

-- Pedir material é de todo mundo: é a porta de entrada do fluxo, e escondê-la
-- faria a pessoa voltar a dar baixa direto no estoque.
insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g cross join permissions p
where p.module = 'estoque' and p.resource = 'requisicoes'
  and (
    p.action in ('read', 'create')
    or (p.action = 'manage' and g.nivel <= 30)
  )
on conflict do nothing;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8. Conferência
-- ------------------------------------------------------------

-- Fila do almoxarifado:
--   select p.numero, pr.email as solicitante, p.status, p.created_at
--   from pedidos_material p join profiles pr on pr.id = p.solicitante_id
--   order by p.status, p.created_at;

-- O que saiu por atendimento de pedido:
--   select m.created_at, pr.name, m.quantity, m.reason
--   from movements m join products pr on pr.id = m.product_id
--   where m.reason like 'Atendimento do pedido%' order by m.created_at desc;
