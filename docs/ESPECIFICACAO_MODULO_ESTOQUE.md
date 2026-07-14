# Especificação Técnica — Módulo de Estoque / Almoxarifado

**Sistema:** OCRAL ERP  
**Módulo:** Estoque  
**Data:** 2026-07-14  
**Status:** Especificação para implementação completa  
**Base:** Schema atual (`supabase/schema_estoque.sql`) + páginas existentes em `/dashboard/estoque/*`

---

## 0. Estado Atual (as-is)

### 0.1 O que já existe

| Camada | Situação |
|--------|----------|
| **Banco** | `profiles`, `categories`, `products`, `movements` |
| **Trigger de estoque** | `update_product_quantity()` recalcula saldo em INSERT de movement |
| **Campo calculado** | `products.is_low_stock` (`quantity_current <= quantity_minimum`) |
| **Roles** | `super_admin`, `gestor`, `almoxarife`, `requisitante` |
| **Telas** | Listagem produtos, novo produto, listagem movimentações, nova movimentação, alertas, relatórios |
| **Menu** | Sidebar com submenu Estoque (rotas modulares corretas) |

### 0.2 Gaps críticos (to-be imediato)

| # | Gap | Impacto | Prioridade |
|---|-----|---------|------------|
| G1 | Links legados `/dashboard/products/*` e `/dashboard/movements/*` | 404 nas ações | P0 |
| G2 | Sem CRUD de **categorias** (só seed SQL) | Categorias engessadas | P0 |
| G3 | Sem **editar / inativar / detalhar** produto | CRUD incompleto | P0 |
| G4 | Movimentação **imutável** sem tela de detalhe | Auditoria fraca | P1 |
| G5 | Sem **requisição** de material (requisitante só consulta) | Fluxo de saída incompleto | P1 |
| G6 | Sem **ajuste de inventário** (contagem física) | Diferenças de estoque | P1 |
| G7 | RLS com SELECT recursivo em `profiles` | Redirect loop (já há fix SQL) | P0 |
| G8 | Validação só no front / trigger; sem Server Actions | Consistência e DX | P1 |
| G9 | Sem filtros/busca/paginação nas listagens | Usabilidade | P1 |
| G10 | Sem histórico por produto (kardex) | Rastreabilidade | P1 |

### 0.3 Ambiguidades resolvidas (decisões práticas)

| Ambiguidade | Decisão |
|-------------|---------|
| Multi-depósito / multi-empresa? | **Não.** Sistema single-tenant, um almoxarifado. `location` é texto livre (prateleira/sala). |
| Exclusão física de produto? | **Não.** Soft-delete via `active = false`. Produto com movimentação nunca é apagado. |
| Cancelar movimentação? | **Não apaga.** Gera movimentação inversa (estorno) com motivo obrigatório. |
| Saída sem saldo? | **Bloqueada** no trigger e na Server Action. |
| Quem solicita material? | `requisitante` cria **requisição**; `almoxarife`/`gestor`/`super_admin` **atende** (gera saída). |
| Unidade de medida | Texto controlado por lista fixa (UN, CX, PC, L, KG, M, PCT). |
| Quantidade decimal? | **Fase 1:** `integer`. Fase 2: `numeric(12,3)` se necessário. |
| Lote / validade / série? | **Fora do escopo da Fase 1.** Preparar extensão futura em `movements.metadata jsonb`. |

---

## 1. Estrutura de entidades e relacionamentos

### 1.1 Modelo conceitual (Fase 1 + extensões necessárias)

```
profiles 1──N products (created_by)
profiles 1──N movements (created_by)
profiles 1──N stock_requests (requester_id)
profiles 1──N stock_requests (approved_by, opcional)

categories 1──N products

products 1──N movements
products 1──N stock_request_items
products 1──N inventory_count_items

stock_requests 1──N stock_request_items
inventory_counts 1──N inventory_count_items
```

### 1.2 Entidades existentes (manter)

#### `profiles`
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK → auth.users | |
| email | text unique not null | |
| full_name | text | |
| role | user_role | default `requisitante` |
| active | boolean | default true |
| created_at / updated_at | timestamptz | |

#### `categories`
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| name | text unique not null | 2–80 chars |
| description | text | opcional |
| active | boolean | **NOVO** default true |
| created_at | timestamptz | |
| updated_at | timestamptz | **NOVO** |

#### `products`
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| code | text unique not null | uppercase, 2–30, alfanumérico + hífen |
| name | text not null | 2–120 chars |
| description | text | opcional |
| category_id | uuid FK categories | opcional |
| unit | text not null | lista controlada |
| quantity_current | integer not null default 0 | >= 0; **somente via trigger/movement** |
| quantity_minimum | integer not null default 0 | >= 0 (ponto de reposição) |
| location | text | opcional, 120 chars |
| active | boolean default true | soft-delete |
| is_low_stock | boolean generated | `quantity_current <= quantity_minimum` |
| created_by | uuid FK profiles | |
| created_at / updated_at | timestamptz | |

#### `movements`
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| product_id | uuid FK products | not null |
| type | text check | `entrada` \| `saida` \| **`ajuste`** (novo) \| **`estorno`** (novo) |
| quantity | integer > 0 | valor absoluto |
| reason | text not null | 3–200 chars |
| notes | text | opcional |
| previous_quantity | integer | preenchido pelo trigger |
| new_quantity | integer | preenchido pelo trigger |
| reference_type | text | **NOVO** `manual` \| `request` \| `inventory` \| `reversal` |
| reference_id | uuid | **NOVO** id da origem (request/count/movement) |
| created_by | uuid FK profiles | |
| created_at | timestamptz | imutável (sem UPDATE/DELETE) |

### 1.3 Entidades novas (Fase 1.5 / Fase 2)

#### `stock_requests` — requisição de material
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| code | text unique | gerado: `REQ-YYYYMMDD-####` |
| requester_id | uuid FK profiles | not null |
| status | text | `rascunho` \| `pendente` \| `aprovada` \| `atendida` \| `parcial` \| `recusada` \| `cancelada` |
| justification | text not null | por que precisa |
| notes | text | |
| approved_by | uuid FK profiles | nullable |
| approved_at | timestamptz | |
| fulfilled_by | uuid FK profiles | |
| fulfilled_at | timestamptz | |
| rejection_reason | text | se recusada |
| created_at / updated_at | timestamptz | |

#### `stock_request_items`
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| request_id | uuid FK | cascade |
| product_id | uuid FK products | |
| quantity_requested | integer > 0 | |
| quantity_fulfilled | integer default 0 | 0..requested |
| notes | text | |

#### `inventory_counts` — contagem física
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| code | text unique | `INV-YYYYMMDD-####` |
| status | text | `aberta` \| `em_contagem` \| `finalizada` \| `cancelada` |
| counted_by | uuid FK profiles | |
| notes | text | |
| started_at / finished_at | timestamptz | |
| created_at | timestamptz | |

#### `inventory_count_items`
| Campo | Tipo | Regras |
|-------|------|--------|
| id | uuid PK | |
| count_id | uuid FK | |
| product_id | uuid FK | |
| system_quantity | integer | snapshot ao incluir |
| counted_quantity | integer | nullable até preencher |
| difference | integer generated | `counted - system` |
| adjusted | boolean default false | se já gerou movement |

### 1.4 Diagrama ER resumido

```
[categories]──< [products] ──< [movements]
                    │                │
                    │                └── reference_id → requests | counts | movements
                    │
                    ├──< [stock_request_items] >── [stock_requests]
                    │
                    └──< [inventory_count_items] >── [inventory_counts]
```

---

## 2. CRUDs completos

### 2.1 Matriz de operações

| Entidade | Create | Read | Update | Delete/Inactivate | Observação |
|----------|--------|------|--------|-------------------|------------|
| **Categorias** | S | S | S | Soft (`active=false`) se sem produtos ativos | |
| **Produtos** | S | S | S (exceto `quantity_current`) | Soft-delete | Qtd só via movement |
| **Movimentações** | S | S | **Nunca** | **Nunca** | Estorno = nova movement |
| **Requisições** | S | S | Status + itens (se rascunho/pendente) | Cancelar | |
| **Inventário** | S | S | Itens enquanto aberta | Cancelar se não finalizada | Finalizar gera ajustes |

### 2.2 Rotas de tela (App Router)

```
/dashboard/estoque
  /produtos
    page.tsx              # listagem + filtros
    new/page.tsx          # criar
    [id]/page.tsx         # detalhe + kardex resumido
    [id]/edit/page.tsx    # editar cadastro
  /categorias
    page.tsx
    new/page.tsx
    [id]/edit/page.tsx
  /movimentacoes
    page.tsx              # listagem + filtros
    new/page.tsx          # entrada/saída/ajuste manual
    [id]/page.tsx         # detalhe (somente leitura)
  /requisicoes
    page.tsx
    new/page.tsx
    [id]/page.tsx         # detalhe + ações (aprovar/atender/recusar)
  /inventario
    page.tsx
    new/page.tsx
    [id]/page.tsx         # contagem + finalizar
  /alertas/page.tsx       # já existe — evoluir
  /relatorios/page.tsx    # já existe — evoluir
```

### 2.3 Server Actions (API interna)

Arquivos sugeridos:

```
src/app/actions/estoque/
  categories.ts
  products.ts
  movements.ts
  requests.ts
  inventory.ts
```

| Action | Entrada | Saída | Regras |
|--------|---------|-------|--------|
| `createCategory` | name, description | Category | unique name |
| `updateCategory` | id, fields | Category | |
| `deactivateCategory` | id | ok | bloquear se produtos ativos |
| `createProduct` | ProductInput | Product | code unique; se qty inicial > 0, criar movement `entrada` "Saldo inicial" |
| `updateProduct` | id, fields | Product | **proibir** alterar `quantity_current` |
| `deactivateProduct` | id | ok | soft-delete |
| `createMovement` | type, product_id, qty, reason, notes | Movement | valida saldo; trigger atualiza estoque |
| `reverseMovement` | movement_id, reason | Movement | cria estorno inverso |
| `createRequest` | items[], justification | Request | status `pendente` |
| `approveRequest` | id | Request | gestor+ |
| `rejectRequest` | id, reason | Request | |
| `fulfillRequest` | id, items[{id, qty}] | Request + Movements | gera saídas; parcial permitido |
| `createInventoryCount` | product_ids[] \| all | Count | snapshot system_qty |
| `saveCountItem` | item_id, counted_qty | Item | |
| `finalizeInventoryCount` | id | Count + Movements ajuste | gera movements por diferença ≠ 0 |

---

## 3. Campos essenciais e validações

### 3.1 Produto

| Campo | Obrigatório | Validação |
|-------|-------------|-----------|
| code | Sim | `^[A-Z0-9][A-Z0-9\-]{1,29}$`, unique, uppercased no submit |
| name | Sim | trim, 2–120 |
| unit | Sim | enum: `UN \| CX \| PC \| L \| KG \| M \| PCT \| PAR \| RL` |
| quantity_minimum | Sim | integer >= 0 |
| quantity_current (create) | Não | >= 0; se > 0 → movement automática |
| category_id | Não | deve existir e estar active |
| location | Não | max 120 |
| description | Não | max 2000 |

**Erros de UI:**
- Código duplicado → "Já existe um produto com este código."
- Unidade inválida → select controlado (sem free-text na Fase 1 final)

### 3.2 Movimentação

| Campo | Obrigatório | Validação |
|-------|-------------|-----------|
| product_id | Sim | produto `active=true` |
| type | Sim | entrada/saida/ajuste |
| quantity | Sim | integer > 0 |
| reason | Sim | 3–200 chars |
| notes | Não | max 1000 |

**Regras de validação cruzada:**
- `saida`: `quantity <= quantity_current`
- `ajuste`: quantity = valor absoluto da diferença; direction embutida em type ou campo `direction` (+/-)
- produto inativo: bloquear nova movement (exceto estorno administrativo)

### 3.3 Categoria

| Campo | Validação |
|-------|-----------|
| name | unique case-insensitive, 2–80 |
| description | max 500 |

### 3.4 Requisição

| Campo | Validação |
|-------|-----------|
| justification | 5–500 chars |
| items | min 1 item |
| item.quantity_requested | > 0 |
| item.product_id | active product, sem duplicar no mesmo request |

---

## 4. Regras de negócio de estoque/almoxarifado

### RN-01 — Saldo só via movimentação
`products.quantity_current` **nunca** é editado por formulário de produto. Única escrita: trigger `update_product_quantity` (e jobs de inventário que inserem movements).

### RN-02 — Saldo nunca negativo
Trigger rejeita saída/ajuste negativo que resultaria em `< 0` com exception:
`Quantidade insuficiente em estoque`.

### RN-03 — Imutabilidade do histórico
Sem `UPDATE`/`DELETE` em `movements`. Correção = `estorno` + nova movement correta.

### RN-04 — Soft-delete de produto
Inativar (`active=false`) mantém histórico. Listagens padrão filtram `active=true`. Super admin pode ver inativos.

### RN-05 — Ponto de reposição
`quantity_minimum` é o ponto de reposição. `is_low_stock` é gerado. Alertas listam `is_low_stock = true AND active = true`.

### RN-06 — Entrada inicial
Se cadastro de produto com `quantity_current > 0`, a action:
1. Insere product com `quantity_current = 0`
2. Insere movement `entrada` com reason `Saldo inicial de cadastro`
3. Trigger define o saldo real

### RN-07 — Atendimento de requisição
- Só `pendente` ou `aprovada` pode ser atendida (config: exigir aprovação? **Sim para qty alta; default: gestor aprova, almoxarife atende**)
- Atendimento parcial: `quantity_fulfilled < quantity_requested` → status `parcial`
- Total: status `atendida`
- Cada item atendido gera 1 movement `saida` com `reference_type='request'`

### RN-08 — Inventário
Ao finalizar contagem:
- `diff = counted - system`
- `diff > 0` → movement `ajuste` entrada
- `diff < 0` → movement `ajuste` saída (qty = abs)
- `diff = 0` → nada
- Status → `finalizada`; itens `adjusted=true`

### RN-09 — Estorno
- Só roles `super_admin` e `gestor`
- Cria movement inversa com `reference_type='reversal'` e `reference_id` = movement original
- Motivo de estorno obrigatório

### RN-10 — Código de produto imutável após primeira movement
Após existir qualquer movement do produto, `code` não pode mudar (integridade de kardex). Antes, pode editar.

---

## 5. Controle de entrada e saída

### 5.1 Fluxos de entrada

| Origem | Quem | Como |
|--------|------|------|
| Compra / recebimento | almoxarife+ | Movimentação manual tipo `entrada` |
| Devolução | almoxarife+ | Entrada com reason `Devolução` |
| Saldo inicial | gestor+ | Via cadastro ou entrada |
| Ajuste positivo inventário | gestor+ | Finalização inventário |
| Estorno de saída | gestor+ | reverseMovement |

### 5.2 Fluxos de saída

| Origem | Quem | Como |
|--------|------|------|
| Requisição atendida | almoxarife+ | fulfillRequest |
| Consumo direto | almoxarife+ | Movimentação manual `saida` |
| Ajuste negativo inventário | gestor+ | Finalização inventário |
| Estorno de entrada | gestor+ | reverseMovement |

### 5.3 Sequência técnica — registrar saída manual

```
1. UI valida qty > 0 e qty <= estoque exibido
2. Server Action re-lê produto (evita race de UI stale)
3. INSERT movements (type=saida, ...)
4. BEFORE INSERT trigger:
   - lock implícito na row do product (SELECT ... FOR UPDATE recomendado na function)
   - calcula previous/new
   - se new < 0 → RAISE
   - UPDATE products.quantity_current
5. Retorna movement; revalidatePath listagens e alertas
```

### 5.4 Melhoria no trigger (obrigatória)

```sql
create or replace function update_product_quantity()
returns trigger as $$
declare
  current_qty integer;
begin
  select quantity_current into current_qty
  from products
  where id = new.product_id
  for update;  -- evita race condition

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  -- bloqueia produto inativo em movement nova (exceto se policy permitir)
  -- ...

  new.previous_quantity := current_qty;

  if new.type in ('entrada') or (new.type = 'ajuste' and new.quantity > 0 and coalesce(new.notes,'') like '%+%' ) then
    -- preferir campo direction; ver seção de evolução do type
    new.new_quantity := current_qty + new.quantity;
  elsif new.type in ('saida', 'estorno') then
    new.new_quantity := current_qty - new.quantity;
  else
    -- ajuste genérico: usar type + sign convention documentada
    new.new_quantity := current_qty + new.quantity; -- se quantity assinado, ajustar
  end if;

  if new.new_quantity < 0 then
    raise exception 'Quantidade insuficiente em estoque. Disponível: %, solicitado: %',
      current_qty, new.quantity;
  end if;

  update products
  set quantity_current = new.new_quantity
  where id = new.product_id;

  return new;
end;
$$ language plpgsql;
```

**Convenção recomendada (simplificada):**

| type | Efeito no saldo |
|------|-----------------|
| `entrada` | +quantity |
| `saida` | -quantity |
| `ajuste_mais` | +quantity |
| `ajuste_menos` | -quantity |
| `estorno` | inverte o type da movement original |

Migrar check constraint de `type` para incluir os novos valores.

---

## 6. Movimentações, histórico e rastreabilidade

### 6.1 Kardex por produto

Tela `/dashboard/estoque/produtos/[id]`:

- Cabeçalho: dados do produto + badge estoque baixo
- Tabela cronológica de movements:
  - data/hora
  - tipo (badge cor)
  - quantidade (+/-)
  - saldo anterior → novo
  - motivo
  - usuário
  - referência (link para requisição/inventário se houver)

### 6.2 Campos de auditoria mínimos

Toda movement grava:
- `created_by` (quem)
- `created_at` (quando)
- `previous_quantity` / `new_quantity` (antes/depois)
- `reason` + `notes` (por quê)
- `reference_type` + `reference_id` (origem)

### 6.3 Relatório de rastreabilidade

Filtros em `/movimentacoes`:
- período
- produto / código
- tipo
- usuário
- reference_type
- motivo (ilike)

Export CSV (Fase 2): mesmas colunas da tabela.

### 6.4 Política de retenção

Histórico **permanente**. Sem purge automático. Soft-delete de produto não remove movements.

---

## 7. Níveis de estoque, alertas e reposição

### 7.1 Indicadores

| Indicador | Cálculo | UI |
|-----------|---------|-----|
| Estoque atual | `quantity_current` | listagem, detalhe |
| Mínimo / reposição | `quantity_minimum` | listagem, form |
| Estoque baixo | `is_low_stock` | badge vermelho |
| Déficit | `quantity_minimum - quantity_current` (se > 0) | tela alertas |
| Sugestão de reposição | max(déficit, quantity_minimum) ou 2× mínimo | botão "Registrar entrada" pré-preenchido |

### 7.2 Tela de alertas (evolução)

Já existe em `/dashboard/estoque/alertas`. Evoluir:

1. Ordenar por déficit desc
2. Filtro por categoria
3. Ação rápida: "Entrada" → `/movimentacoes/new?product={id}&type=entrada`
4. Card resumo: total de SKUs em alerta
5. (Fase 2) Notificação in-app / e-mail diário para gestores

### 7.3 Dashboard home (widgets)

No `/dashboard`:
- Contador produtos ativos
- Contador em alerta
- Últimas 5 movements
- Top saídas 7 dias (opcional)

### 7.4 Regras de alerta

- Alerta **não bloqueia** saída (só informa). Bloqueio só se saldo insuficiente.
- Produto com mínimo = 0 nunca entra em alerta (exceto se qty < 0, impossível).
- Recomendação: mínimo default = 1 para consumíveis críticos.

---

## 8. Perfis de usuário e permissões

### 8.1 Matriz RBAC — Estoque

| Recurso / Ação | super_admin | gestor | almoxarife | requisitante |
|----------------|:-----------:|:------:|:----------:|:------------:|
| Ver produtos ativos | ✓ | ✓ | ✓ | ✓ |
| Ver produtos inativos | ✓ | ✓ | — | — |
| Criar/editar produto | ✓ | ✓ | ✓ | — |
| Inativar produto | ✓ | ✓ | — | — |
| CRUD categorias | ✓ | ✓ | — | — |
| Ver movimentações | ✓ | ✓ | ✓ | próprio futuro* |
| Entrada/saída manual | ✓ | ✓ | ✓ | — |
| Estorno | ✓ | ✓ | — | — |
| Ver alertas | ✓ | ✓ | ✓ | — |
| Relatórios | ✓ | ✓ | — | — |
| Criar requisição | ✓ | ✓ | ✓ | ✓ |
| Aprovar/recusar requisição | ✓ | ✓ | — | — |
| Atender requisição | ✓ | ✓ | ✓ | — |
| Inventário (abrir/finalizar) | ✓ | ✓ | ✓ | — |
| Inventário (cancelar finalizado) | ✓ | — | — | — |

\* Fase 2: requisitante vê só movements geradas a partir das suas requisições.

### 8.2 Camadas de enforcement

1. **UI** — esconde botões (Sidebar + páginas)
2. **Server Actions** — revalida role antes de mutar
3. **RLS** — última linha de defesa no Postgres

### 8.3 RLS — padrões corretos (evitar recursão)

Usar função `SECURITY DEFINER`:

```sql
create or replace function public.get_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;
```

Policies de exemplo:

```sql
-- products manage
create policy "manage_products"
  on products for all
  using (public.get_user_role() in ('super_admin', 'gestor', 'almoxarife'));

-- movements insert
create policy "insert_movements"
  on movements for insert
  with check (public.get_user_role() in ('super_admin', 'gestor', 'almoxarife'));

-- movements select
create policy "select_movements"
  on movements for select
  using (auth.role() = 'authenticated');
```

**Aplicar** `supabase/fix_rls_redirect_loop.sql` antes de qualquer nova policy.

---

## 9. Tratamento de erros, consistência e integridade

### 9.1 Integridade no banco

| Mecanismo | Uso |
|-----------|-----|
| PK / FK | relações |
| UNIQUE (code, category name) | duplicidade |
| CHECK (quantity > 0, type in (...)) | domínio |
| GENERATED `is_low_stock` | consistência de alerta |
| TRIGGER BEFORE INSERT movements | saldo atômico |
| `FOR UPDATE` no product | concorrência |
| Sem UPDATE/DELETE movements | imutabilidade (REVOKE + policy deny) |

### 9.2 Concorrência

Dois almoxarifes saem o mesmo produto ao mesmo tempo:
- Trigger com `SELECT ... FOR UPDATE` serializa
- Segundo pode falhar com "Quantidade insuficiente"
- UI mostra erro e recarrega saldo

### 9.3 Erros de aplicação (padronizar)

```typescript
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "DUPLICATE_CODE"
  | "INVALID_STATE"
  | "INTERNAL";
```

Mensagens em PT-BR, sem vazar stack ao cliente.

### 9.4 Transações lógicas

Operações multi-step (ex.: fulfillRequest com N items):
- Preferir **RPC Postgres** `fulfill_stock_request(request_id, items jsonb)` em transaction única
- Ou Server Action com inserts sequenciais e compensação (pior)
- **Recomendado:** RPC SECURITY DEFINER validando role internamente

### 9.5 Logs

- Erros de Server Action: `console.error` com request id (server)
- (Fase 2) tabela `audit_logs` para ações administrativas (inativar, estorno, mudança de role)

---

## 10. Telas, fluxos e APIs

### 10.1 Fluxos principais (UX)

#### Fluxo A — Cadastrar produto e dar entrada
```
Produtos → Novo → preenche → Salvar
  → se qty inicial > 0: cria movement automática
  → redireciona detalhe do produto
```

#### Fluxo B — Saída por requisição
```
Requisitante: Requisições → Nova → itens + justificativa → Enviar
Gestor: Requisições → Aprovar
Almoxarife: Requisições → Atender → confirma qtds → gera saídas
```

#### Fluxo C — Saída rápida (sem requisição)
```
Movimentações → Nova → tipo Saída → produto → qty → motivo → Registrar
```

#### Fluxo D — Alerta → reposição
```
Alertas → Registrar Entrada (deep link) → form pré-preenchido → salva
```

#### Fluxo E — Inventário
```
Inventário → Nova contagem → seleciona produtos (ou todos)
  → preenche contados → Finalizar
  → sistema gera ajustes → relatorio de diferenças
```

### 10.2 Wireframes lógicos (conteúdo de tela)

**Listagem Produtos**
- Toolbar: busca (code/name), filtro categoria, filtro status estoque (todos/baixo), botão Novo
- Tabela: código | nome | categoria | qtd | mín | local | status | ações (ver/editar)
- Paginação server-side (20/50)

**Form Produto**
- Campos seção Identificação / Estoque / Localização
- Unidade = select
- Aviso: "A quantidade em estoque só muda por movimentação"

**Nova Movimentação**
- Tipo (radio ou select com cores)
- Produto (searchable select com estoque ao lado)
- Painel: estoque atual + alerta baixo
- Qty, motivo, observações
- Preview: "Novo saldo será X"

**Alertas**
- Cards com déficit e CTA entrada
- Empty state positivo (já existe)

**Relatórios**
- Período + KPIs (já existe)
- Evoluir: filtro produto, export CSV, gráfico simples (Fase 2)

### 10.3 Contratos de API (Server Actions / RPC)

Não expor REST público nesta fase. Toda mutação via Server Actions ou RPC Supabase.

**Exemplos de assinatura:**

```typescript
// products.ts
createProduct(input: CreateProductInput): Promise<ActionResult<Product>>
updateProduct(id: string, input: UpdateProductInput): Promise<ActionResult<Product>>
deactivateProduct(id: string): Promise<ActionResult<void>>
getProductKardex(id: string, limit?: number): Promise<ActionResult<Movement[]>>

// movements.ts
createMovement(input: CreateMovementInput): Promise<ActionResult<Movement>>
reverseMovement(id: string, reason: string): Promise<ActionResult<Movement>>

// requests.ts
createStockRequest(input: CreateRequestInput): Promise<ActionResult<StockRequest>>
approveStockRequest(id: string): Promise<ActionResult<StockRequest>>
rejectStockRequest(id: string, reason: string): Promise<ActionResult<StockRequest>>
fulfillStockRequest(id: string, items: FulfillItem[]): Promise<ActionResult<StockRequest>>
```

### 10.4 Queries de leitura (Server Components)

```typescript
// listagem produtos com filtros
supabase.from("products")
  .select("*, category:categories(id,name)")
  .eq("active", true)
  .ilike("name", `%${q}%`)
  .order("name")
  .range(from, to);

// kardex
supabase.from("movements")
  .select("*, user:profiles(full_name,email)")
  .eq("product_id", id)
  .order("created_at", { ascending: false });
```

---

## 11. Plano de implementação por fases

### Fase 0 — Estabilização (1 sessão) — **fazer primeiro**
- [ ] Aplicar `fix_rls_redirect_loop.sql` no Supabase
- [ ] Corrigir todos os hrefs legados:
  - `/dashboard/products` → `/dashboard/estoque/produtos`
  - `/dashboard/products/new` → `/dashboard/estoque/produtos/new`
  - `/dashboard/products/[id]/edit` → `/dashboard/estoque/produtos/[id]/edit`
  - `/dashboard/movements` → `/dashboard/estoque/movimentacoes`
  - `/dashboard/movements/new` → `/dashboard/estoque/movimentacoes/new`
- [ ] Ajustar `router.push` nos forms `new`

### Fase 1 — CRUD completo de base (core)
- [ ] Migration: `categories.active`, `categories.updated_at`
- [ ] Migration: `movements.reference_type`, `movements.reference_id`, ampliar `type`
- [ ] Trigger com `FOR UPDATE`
- [ ] Server Actions products + categories + movements
- [ ] Telas: edit produto, detalhe produto + kardex, CRUD categorias
- [ ] Filtros e busca nas listagens
- [ ] Validação de unidade por select
- [ ] RN-06 saldo inicial via movement

### Fase 2 — Requisições e inventário
- [ ] Tabelas `stock_requests`, `stock_request_items`
- [ ] Tabelas `inventory_counts`, `inventory_count_items`
- [ ] RPC `fulfill_stock_request`
- [ ] RPC `finalize_inventory_count`
- [ ] Telas de requisição e inventário
- [ ] Integração alertas → entrada

### Fase 3 — Relatórios e UX
- [ ] Export CSV
- [ ] Widgets no dashboard
- [ ] Paginação consistente
- [ ] Empty states e toasts (substituir `alert()`)
- [ ] Testes manuais de concorrência e permissões

---

## 12. Estrutura de arquivos alvo

```
src/
  app/
    actions/estoque/
      categories.ts
      products.ts
      movements.ts
      requests.ts
      inventory.ts
    dashboard/estoque/
      produtos/
        page.tsx
        new/page.tsx
        [id]/page.tsx
        [id]/edit/page.tsx
      categorias/
        page.tsx
        new/page.tsx
        [id]/edit/page.tsx
      movimentacoes/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      requisicoes/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      inventario/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      alertas/page.tsx
      relatorios/page.tsx
  components/modules/estoque/
    ProductForm.tsx
    ProductTable.tsx
    MovementForm.tsx
    MovementTable.tsx
    CategoryForm.tsx
    StockBadge.tsx
    RequestForm.tsx
    InventoryCountForm.tsx
  types/modules/estoque.ts
  lib/estoque/
    validations.ts      # schemas (zod recomendado)
    constants.ts        # UNITS, REASONS, statuses
    permissions.ts      # helpers canManageStock etc.

supabase/
  migrations/
    20260714_estoque_fase1.sql
    20260714_estoque_fase2_requests_inventory.sql
  fix_rls_redirect_loop.sql   # já existe — aplicar
```

---

## 13. Critérios de aceite (Definition of Done)

### Core (Fase 0+1)
1. Nenhuma rota de estoque retorna 404 por path legado.
2. Login não entra em redirect loop (RLS ok).
3. Criar/editar/inativar produto funciona com roles corretas.
4. CRUD de categorias funcional.
5. Entrada e saída atualizam saldo corretamente.
6. Saída maior que saldo é bloqueada (UI + banco).
7. `quantity_current` não é editável no form de produto.
8. Alertas refletem `is_low_stock` em tempo real após movement.
9. Kardex do produto lista histórico com usuário e saldos.
10. Requisitante não acessa movimentações/alertas/relatórios.

### Estendido (Fase 2)
11. Requisitante cria requisição; almoxarife atende gerando saída.
12. Inventário finalizado ajusta saldos e registra movements.
13. Estorno só por gestor/super_admin e gera movement inversa.

---

## 14. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| RLS recursivo | `get_user_role()` SECURITY DEFINER |
| Race em saída simultânea | `FOR UPDATE` no trigger |
| Edição manual de saldo | Remover campo do form; policy/trigger |
| 404 por rotas antigas | Fix P0 + busca global por paths legados |
| `alert()` ruim UX | Trocar por toast/inline error na Fase 1 |
| Scope creep (lote/validade) | Explicitamente Fase 3+; `metadata jsonb` se precisar |

---

## 15. Ordem de execução imediata (próximos PRs)

1. **PR-EST-0:** fix rotas + apply RLS fix (bloqueante)
2. **PR-EST-1:** Server Actions + edit/detalhe produto + categorias
3. **PR-EST-2:** movements com referência + estorno + filtros
4. **PR-EST-3:** requisições
5. **PR-EST-4:** inventário
6. **PR-EST-5:** relatórios/export/toasts

---

## 16. Checklist de correção P0 (código atual)

Arquivos a ajustar **agora**:

| Arquivo | Problema |
|---------|----------|
| `src/app/dashboard/estoque/produtos/page.tsx` | href `/dashboard/products/new` e edit legado |
| `src/app/dashboard/estoque/produtos/new/page.tsx` | `router.push("/dashboard/products")` |
| `src/app/dashboard/estoque/movimentacoes/page.tsx` | href `/dashboard/movements/new` |
| `src/app/dashboard/estoque/movimentacoes/new/page.tsx` | `router.push("/dashboard/movements")` |
| `src/app/dashboard/estoque/alertas/page.tsx` | href `/dashboard/movements/new?product=...` |

Paths corretos:
- `/dashboard/estoque/produtos`
- `/dashboard/estoque/produtos/new`
- `/dashboard/estoque/produtos/[id]/edit`
- `/dashboard/estoque/movimentacoes`
- `/dashboard/estoque/movimentacoes/new?product=...&type=entrada`

---

**Documento de referência para implementação.**  
Não é multi-tenant. Não inclui billing. Foco: almoxarifado operacional com rastreabilidade e controle de saldo.
