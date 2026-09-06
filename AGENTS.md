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
- **Server Actions** ficam em `src/app/actions/*.ts` com `"use server"` no topo. Arquivos atuais: `groups.ts`, `protocols.ts`, `suggestions.ts`, `users.ts`, `ai-suggest.ts`. Sempre chamar `revalidatePath()` após mutações.
- **Mutação sensível não sai do navegador.** Alterar papel, ativar/desativar usuário, mexer em grupos e permissões passa por Server Action que revalida o papel no servidor. O RLS é a segunda barreira, nunca a única.
- **Helpers compartilhados** (criados para acabar com a repetição de auth em cada página):
  - `@/lib/auth` → `requireSession(roles?)` para Server Components (redireciona), `getSession()` para Actions e Route Handlers (devolve `user: null`), mais `isManager`, `canManageStock`, `MANAGER_ROLES`, `STOCK_ROLES`.
  - `@/lib/labels` → rótulos e classes de badge (papéis, status e prioridade de protocolo) e `formatDate`/`formatDateTime`.
  - `@/lib/codes` → `generateRecordCode("NUP" | "SUG")` para códigos legíveis de registro.

## Auth e permissões

- Middleware (`src/middleware.ts`) redireciona usuários não autenticados para `/auth/login` e autenticados para fora de `/auth`.
- Todas as tabelas do DB têm RLS habilitado. Políticas verificam `auth.uid()` contra `profiles.role`.
- Quatro roles: `super_admin` > `gestor` > `almoxarife` > `requisitante`.
- Dois emails automaticamente promovidos a `super_admin` no signup: `jadirconsult@gmail.com`, `administrador@ocral.com.br`.

## Banco de dados

- Schemas ficam em `supabase/`. Aplicados manualmente via Supabase Dashboard → SQL Editor (sem ferramenta de migration). **Todos são idempotentes** — usam `if not exists` e `drop policy if exists` antes de cada `create policy`, então podem ser reexecutados. Mantenha essa propriedade ao editar.
- `schema_estoque.sql` é o schema principal (profiles, categories, products, movements, notifications, protocolos + triggers + RLS).
- `schema_sugestoes.sql`, `schema_auditoria.sql`, `schema_grupos_permissoes.sql` e `schema_ged.sql` são por feature. A ordem de aplicação está em `docs/APLICAR_SQL.md`.
- `_manual_apply/` contém correções pontuais (índices, fixes de RLS, etc.).
- Regra obrigatória: nunca desenvolver funcionalidade usando dados mockados. Qualquer tela, módulo ou fluxo novo deve consumir dados reais do banco e, quando necessário, a estrutura de persistência deve existir em tabela/relationship no Supabase antes do desenvolvimento.
- Toda nova feature precisa ter sua tabela e schema no banco, com colunas, índices e políticas RLS quando aplicável. Não criar fluxo funcional somente em frontend com dados simulados.
- A quantidade de estoque é atualizada pelo trigger DB `movement_update_quantity` no insert de `movements` — não atualizar `products.quantity_current` no código da aplicação.
- `protocolos` tem **duas** FKs para `profiles` (`requester_id` e `assigned_to`). Em embeds do PostgREST, sempre nomear a constraint — `requester:profiles!protocolos_requester_id_fkey(...)` — senão a query falha com PGRST201. O mesmo vale para qualquer tabela com FK dupla.
- Toda tabela nova precisa de `enable row level security` **e** de políticas. Conferir com a query de RLS em `docs/APLICAR_SQL.md`.

## Funcionalidade de sugestões por IA (opcional)

- Somente server-side, env vars em `.env.local` (nunca `NEXT_PUBLIC_`).
- Provedores: Google Gemini (padrão, tier gratuito) ou OpenAI-compatível (Groq, etc.). Config em `src/lib/ai/config.ts`.
- Rate limit por usuário (padrão 40/hora, somente em memory — reseta no deploy). Ver `src/lib/ai/rate-limit.ts`.

## Layout e responsividade

- `DashboardShell` (`@/components/layout`) é a casca client do dashboard: guarda o estado da sidebar recolhida (persistido em `localStorage`, chave `ocral-sidebar-collapsed`) e a gaveta de navegação do mobile.
- A sidebar tem três estados: expandida, recolhida (faixa de ícones, botão de seta no topo) e gaveta (abaixo de `lg`, aberta pelo botão de menu no header).
- Identidade do usuário e "Sair do sistema" ficam no `UserMenu` do header, ao lado de notificações e alternador de tema — não na sidebar.
- Toda tabela precisa de um contêiner com `overflow-x-auto`; grades de cartões partem de `grid-cols-1` e crescem em `sm:`/`xl:`.

## Rotina anti-pausa do Supabase

O plano gratuito pausa o projeto após ~7 dias sem atividade.
`.github/workflows/keep-alive.yml` chama `GET /api/internal/keep-alive`
(protegido por `CRON_SECRET`) todos os dias; exige os secrets `APP_URL` e
`CRON_SECRET` no repositório.

**Não adicione `vercel.json` com bloco `crons`.** Agendamento é recurso de plano
Pro; no Hobby a Vercel recusa a configuração e o deploy falha no mesmo segundo em
que é criado, sem chegar a compilar — foi o que derrubou o deploy de 06/09/2026.
Detalhes em `docs/manter-supabase-ativo.md`.

## Comandos

```bash
npm install          # instalar dependências
npm run dev          # servidor dev em localhost:3000
npm run build        # build de produção (usar para verificar antes de push)
npm run lint         # ESLint (config padrão do Next.js)
```

Não há framework de testes configurado. O workflow `.github/workflows/security.yml` executa TruffleHog e Semgrep em PRs, pushes, manualmente e semanalmente. Não há script separado de `typecheck` — erros de TypeScript aparecem via `npm run build`.

## Cuidados

- `is_low_stock` em `products` é uma **coluna computada/generated** (`quantity_current <= quantity_minimum`) — não pode ser definida diretamente.
- Dependências de runtime em uso: `@supabase/ssr`, `@supabase/supabase-js`, `clsx`, `next`, `react`, `react-dom`. Não há `date-fns`, `react-dropzone`, `tailwind-merge` nem `react-hook-form` — foram removidos por não terem nenhum import.
- Dark mode usa estratégia `class` do Tailwind com um `ThemeScript` no layout raiz para evitar flash.
- `server.ts` `createClient()` usa `await cookies()` (API assíncrona de cookies do Next.js 14).
- `next.config.mjs` monta `serverActions.allowedOrigins` a partir de `NEXT_PUBLIC_APP_URL` e `VERCEL_URL`, somados a `localhost:3000` e ao domínio de produção.
- Existe **uma** Sidebar: `src/components/layout/Sidebar.tsx`. A cópia órfã em `src/components/Sidebar.tsx` foi removida.
- **Handlers de evento não existem em Server Component.** Para confirmar antes de enviar um formulário use `<ConfirmSubmitButton>` (`@/components/ui`); passar `onClick` direto quebra a página em runtime.
- Redirect após `POST` em Route Handler precisa de **303** (`NextResponse.redirect(url, 303)`). O padrão, 307, reenvia o POST ao destino.
- `ThemeProvider` **não** deve bloquear a renderização enquanto lê o tema: o anti-flash é feito pelo `ThemeScript` inline, antes da hidratação. Um gate de "pronto" faria o SSR devolver uma página vazia.

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
