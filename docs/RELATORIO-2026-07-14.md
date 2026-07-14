# Relatório de Auditoria e Melhorias - Sistema OCRAL
**Data:** 2026-07-14  
**Projeto:** Sistema de Controle de Estoque OCRAL  
**Stack:** Next.js 14.2.3 + Supabase + TypeScript

---

## FASE 0 — DESCOBERTA

### Identificadores do Projeto

**Supabase:**
- URL: `https://ffsymnxutfjmvwnurfby.supabase.co`
- Client: `src/lib/supabase/client.ts` (browser) e `src/lib/supabase/server.ts` (server)
- Anon Key: via `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Tabelas:**
- `profiles` (estende auth.users)
- `categories`
- `products`
- `movements`

**Rotas (App Router):**
- `/` - Landing page
- `/auth/login` - Login
- `/auth/register` - Registro
- `/dashboard` - Dashboard principal
- `/dashboard/products` - Gestão de produtos
- `/dashboard/movements` - Movimentações
- `/dashboard/alerts` - Alertas de estoque
- `/dashboard/reports` - Relatórios
- `/dashboard/users` - Gestão de usuários

**Edge Functions:** Nenhuma detectada

**Anthropic SDK:** Presente no package.json (`@anthropic-ai/sdk: ^0.24.0`) mas **não utilizado no código** (grep encontrou 0 ocorrências)

**Middleware:** `src/middleware.ts` - proteção de rotas com auth

**Gerenciador de pacotes:** npm (package-lock.json)

### Build Atual

**Bundle Size (principais chunks):**
- 197-e587fdbced582bd2.js: 184K
- fd9d1056-62aaf4b921c84028.js: 172K (shared)
- framework-f66176bb897dc684.js: 140K
- 23-effea5b940252795.js: 124K (shared)
- main-9cf4f5081f7effa2.js: 108K

**First Load JS:** 87 KB (shared) + rotas específicas (87-160 KB)

**Compilação:** Sucesso com warnings do webpack (path resolution) e Node.js API na Edge Runtime

**TypeScript:** `strict: true` (bom!)

### Estrutura do Projeto

```
src/
├── app/
│   ├── auth/              # Client components (login/register)
│   ├── dashboard/         # Server components (páginas)
│   │   └── reports/       # Client component (único "use client" complexo)
│   └── api/               # (vazio - sem API routes)
├── components/
│   └── Sidebar.tsx
├── lib/
│   └── supabase/          # Cliente Supabase
└── types/
    └── index.ts
```

**Client vs Server Components:**
- 6 arquivos com diretivas `"use client"` ou `"use server"`
- Maioria das páginas são Server Components (correto para Next.js 14)
- Única página complexa client-side: `reports/page.tsx`

---

## FASE 1 — AUDITORIA

### 1. SEGURANÇA

#### 🔴 CRÍTICO: RLS vazando para anon

**Furo #1: SELECT com USING (true) sem TO authenticated**

Analisando o schema SQL (`supabase/schema_estoque.sql`):

**POLÍTICAS ABERTAS ENCONTRADAS:**

1. **categories** (linha 194-196):
```sql
create policy "Todos veem categorias"
  on categories for select
  using (auth.role() = 'authenticated');
```
✅ **OK** - Usa `auth.role() = 'authenticated'`, não USING (true)

2. **products** (linha 210-212):
```sql
create policy "Todos veem produtos ativos"
  on products for select
  using (auth.role() = 'authenticated' and active = true);
```
✅ **OK** - Usa `auth.role() = 'authenticated'`

3. **movements** (linha 235-237):
```sql
create policy "Todos veem movimentações"
  on movements for select
  using (auth.role() = 'authenticated');
```
✅ **OK** - Usa `auth.role() = 'authenticated'`

**VEREDICTO INICIAL:** As políticas parecem corretas, mas precisam ser testadas com `SET LOCAL ROLE anon` para confirmar que não vazam.

#### 🟡 MODERADO: WITH CHECK inadequados

**Sem políticas INSERT/UPDATE com WITH CHECK (true) inadequadas detectadas no schema.**

As políticas de INSERT/UPDATE existentes usam validação por role adequada:
- `movements` INSERT: verifica se usuário é almoxarife/gestor/super_admin
- `products` ALL: verifica role adequada
- `profiles` UPDATE: verifica ownership ou super_admin

#### 🟢 Middleware de autenticação

`src/middleware.ts` está correto:
- Valida sessão em rotas protegidas
- Redireciona não-autenticados para `/auth/login`
- Usa `@supabase/ssr` corretamente

#### 🔴 CRÍTICO: Anthropic SDK não utilizado mas presente

**Problema:** `@anthropic-ai/sdk` está instalado (`package.json:12`) e `ANTHROPIC_API_KEY` está no `.env.local.example`, mas:
- Grep encontrou 0 ocorrências de uso no código
- Nenhuma edge function que use IA
- Dependência desnecessária (aumenta bundle/ataque surface)

**Impacto:** Segurança (chave exposta sem uso) + Bundle (deps não utilizadas)

**Fix:** Remover dependência e variável de ambiente

---

### 2. DESEMPENHO

#### 🟡 MODERADO: Bundle size otimizável

**Análise do bundle:**
- First Load JS: 87 KB (razoável para Next.js)
- Maiores chunks: Supabase (172K), framework (140K)
- Rotas de reports: 154 KB total (cliente pesado)

**Oportunidades:**
1. `reports/page.tsx` é client-side com lógica pesada → candidato a Server Component com streaming
2. Não há code splitting além do automático do Next.js (rotas)
3. Supabase JS SDK completo carregado em todas as rotas

**Impacto:** Médio (87 KB é aceitável, mas pode melhorar)

#### 🔴 CRÍTICO: Índices do banco ausentes

**Análise do schema:**

Tabelas transacionais **sem índices** em colunas filtradas frequentemente:

1. **products:**
   - ❌ `category_id` (FK, usado em JOIN em `products/page.tsx:18`)
   - ❌ `created_by` (FK, não usado ainda mas auditável)
   - ❌ `active` (filtrado em queries: `eq("active", true)`)

2. **movements:**
   - ❌ `product_id` (FK, usado em JOIN em `reports/page.tsx:28`)
   - ❌ `created_by` (FK, auditável)
   - ❌ `created_at` (range queries em reports: `gte/lte`)
   - ❌ `type` (filtrado: `filter(m => m.type === "entrada")`)

3. **profiles:**
   - ✅ `id` (PK, OK)
   - ❌ `role` (filtrado em RLS policies repetidamente)

**Impacto:** Alto - queries N+1 potenciais, reports lentos com crescimento de dados

#### 🟡 MODERADO: Reports sem paginação

`src/app/dashboard/reports/page.tsx`:
- Carrega **TODAS** as movimentações do período sem limite
- Processa agregações no cliente (`.reduce`)
- Sem paginação/virtualização

**Impacto:** Médio agora, alto com crescimento de dados

#### 🔴 CRÍTICO: TypeScript config incompleto

`tsconfig.json` tem `"strict": true`, mas falta `strictNullChecks` explícito.

**Problemas encontrados no código:**
- `reports/page.tsx:12`: `useState<any>(null)` - tipo genérico não tipado
- `reports/page.tsx:13-14`: arrays de `any[]`
- `products/page.tsx:81`: `product: any` em map

**Impacto:** Bugs em runtime por null/undefined não tratados

---

### 3. DUPLICAÇÃO

#### 🟢 Sem duplicação crítica detectada

- Cliente Supabase centralizado em `src/lib/supabase/`
- Sem edge functions → sem necessidade de `_shared/`
- Lockfiles: apenas `package-lock.json` (correto)

**Oportunidades menores:**
- Padrão de carregamento de perfil repetido em múltiplas páginas do dashboard
- Poderia extrair para `lib/auth.ts` helper

---

### 4. QUALIDADE

#### 🟡 ErrorBoundary ausente

Não há ErrorBoundary global no layout:
- `src/app/layout.tsx` não tem error handling
- Next.js 14 suporta `error.tsx` por rota

#### 🟡 StrictMode ausente

`src/app/layout.tsx` não usa `<React.StrictMode>`

#### 🟢 ESLint configurado

`eslint-config-next` presente

---

## PLANO DE CORREÇÕES

### FASE 2 - Correções (por prioridade)

#### Segurança (ordem de execução)

1. **Testar RLS com anon role** (SQL via Dashboard)
2. **Remover Anthropic SDK não utilizado**
3. **Validar middleware está protegendo todas as rotas sensíveis**

#### Performance

1. **Criar índices no banco** (SQL via Dashboard, idempotente)
2. **Adicionar strictNullChecks e consertar tipos** (TypeScript)
3. **Otimizar reports com Server Components + streaming**

#### Qualidade

1. **Adicionar ErrorBoundary global**
2. **Habilitar StrictMode**
3. **Consertar tipos `any`**

---

## PRÓXIMOS PASSOS

1. ✅ Criar branch `feature/security-performance-improvements`
2. ⏳ Aplicar correções de segurança
3. ⏳ Aplicar correções de performance
4. ⏳ Rodar build + typecheck
5. ⏳ Abrir PR para revisão

---

## ENTREGÁVEIS MANUAIS (requerem ação do usuário)

### SQL para aplicar via Supabase Dashboard

1. **Teste de vazamento RLS:**
```sql
-- Executar como teste (não persiste):
SET LOCAL ROLE anon;
SELECT count(*) FROM categories;  -- deve dar erro ou 0
SELECT count(*) FROM products;    -- deve dar erro ou 0
SELECT count(*) FROM movements;   -- deve dar erro ou 0
RESET ROLE;
```

2. **Índices (aplicar via SQL Editor):**
```sql
-- Salvar em supabase/_manual_apply/001_indices_performance.sql

-- Products
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);

-- Movements
CREATE INDEX IF NOT EXISTS idx_movements_product_id ON movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_created_by ON movements(created_by);
CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(type);

-- Profiles (para RLS performance)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Índice composto para queries de reports
CREATE INDEX IF NOT EXISTS idx_movements_date_type ON movements(created_at DESC, type);
```

3. **Verificação pós-índices:**
```sql
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### Variáveis de Ambiente

**Remover do .env.local:**
```
ANTHROPIC_API_KEY=...  # não utilizado
```

**Manter:**
```
NEXT_PUBLIC_SUPABASE_URL=https://ffsymnxutfjmvwnurfby.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # se usado em API routes futuras
```

---

**FIM DA FASE 0 - DESCOBERTA**
