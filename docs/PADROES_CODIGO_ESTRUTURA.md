# Padrões de Código e Estrutura - ERP OCRAL

## Data: 2026-07-14

---

## 1. ESTRUTURA DE DIRETÓRIOS

```
src/
├── app/
│   ├── (auth)/                    # Grupo de rotas: Autenticação
│   │   ├── login/
│   │   └── register/
│   │
│   └── (dashboard)/               # Grupo de rotas: Dashboard
│       ├── layout.tsx             # Layout principal com Sidebar + Breadcrumbs
│       ├── page.tsx               # Home do Dashboard
│       │
│       ├── estoque/               # Módulo: Estoque
│       │   ├── produtos/
│       │   ├── movimentacoes/
│       │   ├── alertas/
│       │   └── relatorios/
│       │
│       ├── certificados/          # Módulo: Certificados
│       │   ├── lista/
│       │   ├── upload/
│       │   └── validade/
│       │
│       ├── ged/                   # Módulo: GED
│       │   ├── documentos/
│       │   ├── pastas/
│       │   └── busca/
│       │
│       └── admin/                 # Módulo: Administração
│           ├── usuarios/
│           ├── grupos/
│           └── auditoria/
│
├── components/
│   ├── ui/                        # Componentes base reutilizáveis
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   └── index.ts             # Re-export de todos os componentes UI
│   │
│   ├── layout/                    # Componentes de layout
│   │   ├── Sidebar.tsx          # Menu hierárquico do ERP
│   │   ├── Breadcrumbs.tsx      # Navegação contextual
│   │   └── index.ts
│   │
│   └── modules/                   # Componentes específicos por módulo
│       ├── estoque/
│       ├── certificados/
│       ├── ged/
│       └── admin/
│
├── lib/
│   ├── supabase/                  # Clientes Supabase
│   │   ├── client.ts            # Cliente para Client Components
│   │   └── server.ts            # Cliente para Server Components
│   │
│   ├── hooks/                     # React hooks customizados
│   ├── api/                       # API helpers por módulo
│   └── utils/                     # Utilitários gerais
│
└── types/
    ├── database.ts                # Types gerados do Supabase
    ├── modules/
    │   ├── estoque.ts
    │   ├── certificados.ts
    │   ├── ged.ts
    │   └── admin.ts
    └── common.ts                  # Types compartilhados
```

---

## 2. CONVENÇÕES DE NOMENCLATURA

### 2.1 Arquivos e Pastas
- **Pastas**: kebab-case (ex: `user-management`, `stock-alerts`)
- **Componentes**: PascalCase (ex: `Button.tsx`, `UserProfile.tsx`)
- **Utilitários**: camelCase (ex: `formatDate.ts`, `validateEmail.ts`)
- **Types**: PascalCase para tipos, camelCase para arquivos (ex: `user.ts` exporta `User`, `UserRole`)

### 2.2 Código TypeScript
- **Interfaces**: PascalCase com prefixo `I` opcional (ex: `User` ou `IUser`)
- **Types**: PascalCase (ex: `UserRole`, `ProductStatus`)
- **Funções**: camelCase (ex: `getUserById`, `calculateTotal`)
- **Constantes**: UPPER_SNAKE_CASE (ex: `MAX_FILE_SIZE`, `DEFAULT_ROLE`)
- **Variáveis**: camelCase (ex: `userName`, `productList`)

### 2.3 Componentes React
- **Client Components**: Iniciar com `"use client"` no topo
- **Server Components**: Sem diretiva (padrão no Next.js App Router)
- **Props**: Interface com nome do componente + `Props` (ex: `ButtonProps`)

---

## 3. PADRÕES DE CÓDIGO

### 3.1 Estrutura de Componentes

**Server Component (padrão):**
```typescript
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function Page({ params, searchParams }: PageProps) {
  const supabase = await createClient();
  const { data } = await supabase.from("table").select();
  
  return <div>{/* JSX */}</div>;
}
```

**Client Component:**
```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ComponentProps {
  initialData: Data[];
}

export default function Component({ initialData }: ComponentProps) {
  const [data, setData] = useState(initialData);
  
  return <div>{/* JSX */}</div>;
}
```

### 3.2 Server Actions

Criar Server Actions em arquivos separados:

```typescript
// app/actions/products.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createProduct(formData: FormData) {
  const supabase = await createClient();
  
  const product = {
    name: formData.get("name") as string,
    sku: formData.get("sku") as string,
  };
  
  const { error } = await supabase.from("products").insert(product);
  
  if (error) throw new Error(error.message);
  
  revalidatePath("/dashboard/estoque/produtos");
}
```

### 3.3 Supabase Queries

**Padrão de query com error handling:**
```typescript
const { data, error } = await supabase
  .from("products")
  .select("*, category:categories(*)")
  .eq("active", true)
  .order("created_at", { ascending: false });

if (error) throw new Error(error.message);
```

**Query com RLS automático (usuário autenticado):**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/auth/login");

// RLS policies aplicam automaticamente baseado em auth.uid()
const { data } = await supabase.from("products").select();
```

### 3.4 Permissões e Roles

**Verificação de permissão em Server Component:**
```typescript
const { data: profile } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();

if (!["super_admin", "gestor"].includes(profile.role)) {
  redirect("/dashboard");
}
```

**Verificação de permissão em Client Component:**
```typescript
import { useUser } from "@/lib/hooks/useUser";

export default function Component() {
  const { profile } = useUser();
  
  if (!["super_admin", "gestor"].includes(profile.role)) {
    return <div>Acesso negado</div>;
  }
  
  return <div>{/* Conteúdo */}</div>;
}
```

### 3.5 Auditoria

**Registrar ação de auditoria:**
```typescript
import { logAudit } from "@/lib/api/audit";

await logAudit({
  module: "estoque",
  action: "create",
  resourceType: "product",
  resourceId: newProduct.id,
  details: { name: newProduct.name, sku: newProduct.sku },
});
```

**Função helper de auditoria:**
```typescript
// lib/api/audit.ts
import { createClient } from "@/lib/supabase/server";

export async function logAudit(params: {
  module: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: object;
}) {
  const supabase = await createClient();
  
  await supabase.rpc("log_audit", {
    p_module: params.module,
    p_action: params.action,
    p_resource_type: params.resourceType,
    p_resource_id: params.resourceId,
    p_details: params.details,
  });
}
```

---

## 4. PADRÕES DE UI

### 4.1 Tailwind CSS

**Classes base para containers:**
```tsx
<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
  {/* Conteúdo */}
</div>
```

**Classes para botões (usar componente Button):**
```tsx
import { Button } from "@/components/ui";

<Button variant="primary" size="md">Salvar</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="danger">Excluir</Button>
```

**Classes para formulários:**
```tsx
<input
  type="text"
  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
/>
```

### 4.2 Componentes de Layout

**Card com título:**
```tsx
import { Card } from "@/components/ui";

<Card title="Título do Card" subtitle="Subtítulo opcional">
  <p>Conteúdo do card</p>
</Card>
```

**Breadcrumbs (automático):**
```tsx
// Já incluído no layout.tsx do dashboard
// Renderiza automaticamente baseado na rota
```

---

## 5. BANCO DE DADOS

### 5.1 Convenções de Schema

**Nomes de tabelas:** plural, snake_case (ex: `products`, `user_groups`)

**Colunas padrão em todas as tabelas:**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
```

**Trigger automático de updated_at:**
```sql
CREATE TRIGGER update_table_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### 5.2 RLS Policies

**Padrão de policy para super_admin:**
```sql
CREATE POLICY table_super_admin_all ON table_name
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );
```

**Padrão de policy para leitura por role:**
```sql
CREATE POLICY table_role_read ON table_name
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'gestor', 'almoxarife')
    )
  );
```

### 5.3 Auditoria Automática

**Todas as tabelas críticas devem ter trigger de auditoria:**
```sql
CREATE TRIGGER table_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();
```

---

## 6. TRATAMENTO DE ERROS

### 6.1 Server Components

```typescript
try {
  const { data, error } = await supabase.from("products").select();
  if (error) throw error;
  return data;
} catch (error) {
  console.error("Error fetching products:", error);
  throw new Error("Erro ao buscar produtos");
}
```

### 6.2 Client Components

```typescript
"use client";

import { useState } from "react";

export default function Component() {
  const [error, setError] = useState<string | null>(null);
  
  async function handleSubmit() {
    try {
      setError(null);
      // operação
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  }
  
  return (
    <div>
      {error && <div className="text-red-600">{error}</div>}
      {/* Conteúdo */}
    </div>
  );
}
```

---

## 7. TESTES

### 7.1 Estrutura de Testes (Futuro)

```
__tests__/
├── components/
├── lib/
└── app/
```

### 7.2 Convenções de Testes

- Arquivos de teste: `.test.ts` ou `.spec.ts`
- Um arquivo de teste por componente/função
- Usar Jest + React Testing Library

---

## 8. GIT E VERSIONAMENTO

### 8.1 Commits

**Formato:** `<tipo>: <descrição>`

**Tipos:**
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `refactor`: Refatoração sem mudança de funcionalidade
- `style`: Mudanças de formatação
- `docs`: Documentação
- `test`: Testes
- `chore`: Tarefas de manutenção

**Exemplos:**
```
feat: adicionar módulo de certificados
fix: corrigir validação de estoque
refactor: reorganizar estrutura de pastas
docs: atualizar README com novos módulos
```

### 8.2 Branches

- `main`: Branch de produção
- `develop`: Branch de desenvolvimento
- `feature/<nome>`: Features novas
- `fix/<nome>`: Correções
- `refactor/<nome>`: Refatorações

---

## 9. PERFORMANCE

### 9.1 Server Components vs Client Components

**Usar Server Components quando:**
- Buscar dados do banco
- Acessar recursos do servidor
- Não precisa de interatividade (useState, useEffect)

**Usar Client Components quando:**
- Precisa de interatividade (onClick, onChange)
- Usa hooks do React (useState, useEffect)
- Acessa APIs do navegador (localStorage, window)

### 9.2 Otimizações

- Usar `revalidatePath` após mutations
- Implementar paginação em listas grandes
- Lazy loading de componentes pesados
- Otimizar queries com `select` específico

---

## 10. SEGURANÇA

### 10.1 Checklist de Segurança

- ✅ RLS habilitado em todas as tabelas
- ✅ Validação de permissões no servidor
- ✅ Sanitização de inputs
- ✅ Uso de Server Actions ao invés de API routes
- ✅ Validação de tipos com TypeScript
- ✅ Auditoria de ações sensíveis
- ✅ Uso de variáveis de ambiente para secrets

### 10.2 Validação de Inputs

```typescript
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(3).max(100),
  sku: z.string().min(3).max(50),
  quantity: z.number().int().nonnegative(),
});

export async function createProduct(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    sku: formData.get("sku"),
    quantity: Number(formData.get("quantity")),
  };
  
  const validated = productSchema.parse(raw);
  // Continuar com validated
}
```

---

## 11. MÓDULOS DO ERP

### 11.1 Estrutura de Módulo Padrão

Cada módulo deve ter:
- Rotas em `app/dashboard/<modulo>/`
- Componentes específicos em `components/modules/<modulo>/`
- Types em `types/modules/<modulo>.ts`
- API helpers em `lib/api/<modulo>.ts`
- Schema SQL em `supabase/schema_<modulo>.sql`

### 11.2 Integração entre Módulos

- Usar tipos compartilhados em `types/common.ts`
- Reutilizar componentes UI de `components/ui/`
- Seguir padrão de auditoria transversal
- Respeitar permissões de roles

---

## 12. DEPLOYMENT

### 12.1 Vercel

- Deploy automático no push para `main`
- Preview deploys em PRs
- Variáveis de ambiente configuradas no dashboard

### 12.2 Supabase

- Migrations em `supabase/migrations/`
- Aplicar schemas via SQL Editor
- Backup automático configurado

---

## 13. REFERÊNCIAS

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

---

**Documento atualizado em:** 2026-07-14
**Versão:** 1.0
**Status:** Ativo
