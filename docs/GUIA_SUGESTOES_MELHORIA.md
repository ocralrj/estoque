# Guia — Recurso "Sugerir uma melhoria" + Pipeline de IA

**Data:** 2026-07-14  
**Escopo:** Todos os usuários autenticados do ERP OCRAL

---

## O que é

Botão amarelo no topo do dashboard (todos os perfis) que abre um modal:

1. **Nova sugestão** — conversa guiada (o que / por quê)
2. **Gerar resumo** — organiza o texto (IA recomenda; usuário edita)
3. **Enviar pedido** — grava no banco com código `SUG-YYYYMMDD-####`
4. **Meus pedidos** — histórico e status do autor

Gestores e super_admin gerenciam em **Administração → Sugestões**.

A IA **não decide** implementação. Human-in-the-loop: aceitar / editar / descartar.

---

## Aplicar no Supabase (obrigatório)

1. Supabase Dashboard → **SQL Editor**
2. Execute:

```
supabase/schema_sugestoes.sql
```

3. Confirme a tabela `improvement_suggestions` e RLS

Se o login ainda loopar, aplique antes:

```
supabase/fix_rls_redirect_loop.sql
```

---

## Configurar IA (opcional, recomendado em produção)

Sem chave, o sistema usa **fallback local** (clarificação por regras).  
Com chave, o pipeline chama um provedor OpenAI-compatible **somente no servidor**.

No `.env.local` (nunca `NEXT_PUBLIC_` para a chave):

```env
AI_SUGGESTIONS_ENABLED=true
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
AI_MAX_RETRIES=1
AI_TEMPERATURE=0.3
AI_RATE_LIMIT_PER_USER_HOUR=30
```

**Groq (exemplo):**

```env
AI_API_KEY=gsk_...
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.1-8b-instant
```

Modelo configurável por env — trocar provedor não exige mudar a UI.

---

## Arquitetura do pipeline

```
[Usuário clica enviar / Gerar resumo]
        │
        ▼
[Cliente] envia contexto mínimo → Server Action autenticada
        │
        ▼
[Servidor]
  1. Autoriza (usuário logado)
  2. Rate limit por usuário
  3. Sanitiza contexto (anti prompt-injection / dados sensíveis)
  4. Monta prompt system + user (template versionado suggest-v1.0.0)
  5. Chama provedor (timeout + retry)
  6. Valida JSON (schema: sugestoes[], aviso)
  7. Pós-processa / fallback local se falhar
        │
        ▼
[Cliente] preview editável → aceitar / editar / regenerar / descartar
```

### Arquivos

| Arquivo | Função |
|---------|--------|
| `supabase/schema_sugestoes.sql` | Tabela + RLS |
| `src/lib/ai/config.ts` | Env / modelo / timeouts |
| `src/lib/ai/prompt-templates.ts` | System/user versionados |
| `src/lib/ai/validate.ts` | Parse + validação JSON |
| `src/lib/ai/rate-limit.ts` | Limite por usuário |
| `src/lib/ai/providers/openai-compatible.ts` | Cliente HTTP |
| `src/lib/ai/suggest.ts` | Pipeline completo + fallback |
| `src/app/actions/ai-suggest.ts` | Server Actions públicas |
| `src/lib/suggestions/clarify.ts` | Fallback local |
| `src/app/actions/suggestions.ts` | CRUD dos pedidos |
| `src/components/suggestions/SuggestImprovementModal.tsx` | UI |
| `src/components/layout/DashboardHeader.tsx` | Botão amarelo |
| `src/app/dashboard/sugestoes/page.tsx` | Meus pedidos |
| `src/app/dashboard/admin/sugestoes/*` | Gestão |

### Reutilizar em outros campos

```typescript
import { suggestWithAi } from "@/app/actions/ai-suggest";

const result = await suggestWithAi({
  tipo_campo: "motivo_movimentacao",
  dominio: "ERP OCRAL - Estoque",
  n: 3,
  o_que_sugerir: "motivos de saída de estoque",
  contexto: {
    produto: product.name,
    tipo: "saida",
    estoque_atual: product.quantity_current,
  },
  entrada_usuario: form.reasonDraft,
});

if (result.ok) {
  // result.data.sugestoes[].texto — preview, não gravar automático
}
```

---

## Permissões

| Ação | Quem |
|------|------|
| Abrir modal / enviar | Todos autenticados |
| Ver próprios pedidos | Autor |
| Ver todos / status / notas | `super_admin`, `gestor` |
| Chamar pipeline de IA | Qualquer autenticado (rate limited) |

---

## Fluxo do usuário

1. Clica no botão amarelo  
2. Descreve a ideia no chat  
3. IA clarifica (servidor) ou fallback local  
4. **Gerar resumo** → preview editável  
5. **Enviar pedido** → código `SUG-...`  
6. Acompanha em **Meus pedidos**  
7. Gestor atualiza status e nota  

---

## Boas práticas aplicadas

- Chave só no servidor  
- Saída JSON validada  
- Rate limit por usuário  
- Timeout + retry + fallback  
- Prompt versionado  
- Contexto sanitizado (sem senha/token/cpf)  
- Transparência na UI (“gerado por IA pode conter erros”)  
- Nunca grava sem revisão do usuário  

---

## Teste rápido

1. Aplicar `schema_sugestoes.sql`  
2. (Opcional) configurar `AI_API_KEY`  
3. `npm run dev`  
4. Login → botão amarelo → enviar ideia → gerar resumo → enviar  
5. **Meus pedidos**  
6. Gestor: **Administração → Sugestões**  

---

## Limitações

- Rate limit em memória (por processo); multi-instância → Redis  
- Modelos gratuitos: cota e disponibilidade instáveis  
- LGPD: não envie dados sensíveis no contexto  
- Sem chave: qualidade do fallback local é menor, mas o fluxo funciona  
