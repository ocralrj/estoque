# AGENTS.md

## Stack

Next.js 14 (App Router) + Supabase (PostgreSQL) + TypeScript + Tailwind CSS. Deploy no Vercel.

## Convenções principais

- **Todo texto visível ao usuário é em pt-BR.** Labels, mensagens de erro, commits e comentários SQL são em português.
- **Alias de caminho**: `@/*` → `src/*`. Usar em todos os imports.
- **Dois clientes Supabase**:
  - `@/lib/supabase/server` → `createClient()` (assíncrono, para Server Components/Actions)
  - `@/lib/supabase/client` → `createClient()` (síncrono, para Client Components)
- **Server Components** são o padrão (sem diretiva). Adicionar `"use client"` no topo apenas quando usar hooks/interatividade.
- **Server Actions** ficam em `src/app/actions/*.ts` com `"use server"` no topo. Arquivos atuais: `groups.ts`, `suggestions.ts`, `ai-suggest.ts`. Sempre chamar `revalidatePath()` após mutações.

## Auth e permissões

- Middleware (`src/middleware.ts`) redireciona usuários não autenticados para `/auth/login` e autenticados para fora de `/auth`.
- Todas as tabelas do DB têm RLS habilitado. Políticas verificam `auth.uid()` contra `profiles.role`.
- Quatro roles: `super_admin` > `gestor` > `almoxarife` > `requisitante`.
- Dois emails automaticamente promovidos a `super_admin` no signup: `jadirconsult@gmail.com`, `administrador@ocral.com.br`.

## Banco de dados

- Schemas ficam em `supabase/`. Aplicados manualmente via Supabase Dashboard → SQL Editor (sem ferramenta de migration).
- `schema_estoque.sql` é o schema principal (products, movements, categories, profiles + triggers + RLS).
- `schema_sugestoes.sql`, `schema_auditoria.sql`, `schema_grupos_permissoes.sql` são por feature.
- `_manual_apply/` contém correções pontuais (índices, fixes de RLS, etc.).
- A quantidade de estoque é atualizada pelo trigger DB `movement_update_quantity` no insert de `movements` — não atualizar `products.quantity_current` no código da aplicação.

## Funcionalidade de sugestões por IA (opcional)

- Somente server-side, env vars em `.env.local` (nunca `NEXT_PUBLIC_`).
- Provedores: Google Gemini (padrão, tier gratuito) ou OpenAI-compatível (Groq, etc.). Config em `src/lib/ai/config.ts`.
- Rate limit por usuário (padrão 40/hora, somente em memory — reseta no deploy). Ver `src/lib/ai/rate-limit.ts`.

## Comandos

```bash
npm install          # instalar dependências
npm run dev          # servidor dev em localhost:3000
npm run build        # build de produção (usar para verificar antes de push)
npm run lint         # ESLint (config padrão do Next.js)
```

Não há framework de testes configurado. Não existem workflows de CI (apenas um PR template em `.github/`). Não há script separado de `typecheck` — erros de TypeScript aparecem via `npm run build`.

## Cuidados

- `is_low_stock` em `products` é uma **coluna computada/generated** (`quantity_current <= quantity_minimum`) — não pode ser definida diretamente.
- `react-dropzone` está instalado (usado no módulo de sugestões).
- Dark mode usa estratégia `class` do Tailwind com um `ThemeScript` no layout raiz para evitar flash.
- `server.ts` `createClient()` usa `await cookies()` (API assíncrona de cookies do Next.js 14).
- `next.config.mjs` restringe `serverActions.allowedOrigins` a `localhost:3000` — atualizar para domínios de produção.
- Sidebar duplicada: `src/components/Sidebar.tsx` (client) e `src/components/layout/Sidebar.tsx`. Preferir `layout/Sidebar.tsx` para novos trabalhos.

---

## Manutenção deste arquivo

Este arquivo é a memória de longo prazo do projeto. Mantenha-o atualizado seguindo estas regras:

### Quando propor atualização

Ao final de qualquer tarefa que envolva uma ou mais das situações abaixo, proponha uma atualização deste arquivo antes de encerrar:

- Mudança de arquitetura, estrutura de pastas ou padrão de organização do código
- Adição, remoção ou troca de dependências/bibliotecas relevantes
- Criação ou alteração de comandos de build, teste, lint ou deploy
- Novas convenções de código, nomenclatura ou fluxo de trabalho adotadas durante a sessão
- Decisões técnicas importantes tomadas com o usuário (registrar a decisão e o motivo)
- Correção de alguma informação deste arquivo que se mostrou desatualizada ou errada

### O que NÃO registrar

- Detalhes temporários (bugs já corrigidos, experimentos descartados)
- Conteúdo que duplique a documentação oficial do projeto (linke em vez de copiar)
- Logs, saídas de comandos ou trechos longos de código
