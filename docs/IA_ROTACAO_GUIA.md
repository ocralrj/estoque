# Rotação de IAs com fallback automático — guia reutilizável

> Processo extraído do USA PARK (verificado em produção em 22/09/2026).
> Objetivo: o usuário nunca escolhe modelo; o sistema tenta em ordem,
> detecta limite/erro pelos sinais reais do provedor e troca sozinho,
> sem perder o contexto da tarefa.

## 1. Arquitetura

```text
TELA / SERVER ACTION
        ↓  (mesmo prompt/arquivo — nada é reenviado a mais)
ORQUESTRADOR DE PROVEDORES  (quem vem primeiro: preferência + castigo)
        ↓
┌──────────────┐  ┌─────────────────────────┐  ┌──────────┐
│ Gemini       │  │ OpenRouter (ROTAÇÃO     │  │ OpenAI   │
│ (rotação de  │  │  interna de modelos)    │  │ (teste   │
│  chaves)     │  │  Ling · Nemotron · …    │  │  isolado)│
└──────────────┘  └─────────────────────────┘  └──────────┘
        ↓
RESPOSTA (+ qual modelo respondeu, log técnico)
```

Camadas:

| Camada | Arquivo de referência | Papel |
|---|---|---|
| Orquestrador | `src/lib/ia.ts` | Ordem de provedores, castigo (cooldown), estado consolidado |
| Rotação OpenRouter | `src/lib/openrouter.ts` | Ordem de modelos, castigo por modelo, log em anel, timeout |
| Rotação Gemini | `src/lib/gemini.ts` | Rotação de chaves (`GEMINI_API_KEYS`) |
| Leitura de documento | `src/lib/ia-fita.ts` | Tenta provedores em ordem; mesmo contrato de erro |
| Status (admin) | `src/app/(painel)/ia-status/` | Chaves, rotação, teste ao vivo |
| Uso estimado | `supabase/migrations/0050_uso_ia_por_mes.sql` | Proxy por documentos (não é log real) |

## 2. Modelos grátis verificados (OpenRouter, lista pública)

| ID exato | Uso | Visão? |
|---|---|---|
| `nvidia/nemotron-3.5-lightning:free` | texto | não |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | texto | não |
| `inclusionai/ling-3.0-flash-fin:free` | texto | não |
| `inclusionai/ling-3.0-flash-vl:free` | imagem/PDF-texto | **sim** |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | imagem (reserva) | **sim** |

> **MiMo (Xiaomi) e Muse Spark (Meta) NÃO têm variante `:free`** na
> OpenRouter (conferido em 22/09/2026). Não inclua IDs sem `:free` na
> lista padrão — o roteador pula 404 sozinho, mas cada ID morto custa
> uma chamada. Se ganharem variante free, basta pôr o ID na env.

## 3. Variáveis de ambiente (todas server-side, nunca `NEXT_PUBLIC_`)

| Var | Para quê | Obrigatória? |
|---|---|---|
| `OPENROUTER_API_KEY` | chave única que atende todos os modelos | sim (sem ela, só Gemini) |
| `OPENROUTER_MODELOS_TEXTO` | ordem de texto, IDs com vírgula | não (tem padrão) |
| `OPENROUTER_MODELOS_VISAO` | ordem de visão, IDs com vírgula | não (tem padrão) |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | uma ou várias chaves (vírgula) | não (mas recomendado) |
| `IA_PREFERIDA` | `openrouter` (padrão), `gemini` ou `meta` | não |

## 4. Política de falha e cooldown (só sinais reais)

| Sinal | Classificação | Castigo |
|---|---|---|
| HTTP 429 | sem cota | modelo 15 min fora |
| HTTP 401/402/403 | conta/chave | modelo 24 h fora |
| HTTP 404 | modelo saiu do ar | modelo 24 h fora |
| rede/timeout (120 s) | transiente | nenhum — tenta o próximo na hora |
| resposta sem conteúdo | transiente | nenhum |

Regras que evitam flapping: quem está de castigo vai para o fim da fila
(mas continua sendo tentado); castigo expirado limpa sozinho; sucesso
limpa o castigo na hora. Estado é por instância do servidor (limitação
documentada no serverless — o comportamento correto não depende dele).

## 5. Logs (admin, sem segredos)

- Anel dos últimos 30 eventos: hora, tarefa (texto/visão), modelo,
  ok/falha, motivo, duração ms, tokens **quando o provedor informa**.
- Por modelo: chamadas, acertos, motivo do castigo, minutos p/ voltar.
- Nunca logar: chave, prompt com dados sensíveis, documento inteiro.

## 6. Instalação em outro projeto (passo a passo)

1. Copie `openrouter.ts`, `ia.ts`, `gemini.ts` (opcional) e ajuste o alias
   de import (`@/` → o do projeto). `openrouter.ts` não tem dependências
   (só `fetch`/`Buffer`).
2. Aponte os pontos de chamada para `gerarTextoIA()` (texto) e para um
   `pedirJson()` no molde de `ia-fita.ts` (documento + schema + prompt
   que proíbe chute).
3. Crie as envs da seção 3 (`.env.local` + Vercel). Sem chave, tudo
   degrada para manual — nunca trava a tela.
4. Copie a tela de status (ou equivalente): chave presente?, rotação,
   teste ao vivo que mostra **qual modelo respondeu**.
5. Valide (seção 7) antes do deploy.

## 7. Validação

- [ ] `npm run lint` e `npm run build` passam.
- [ ] Sem chave: retorna `sem-chave` sem chamar rede; tela orienta o manual.
- [ ] Teste de rotação com `fetch` simulado: 404 → pula; 429 → pula +
  castigo; 2ª chamada não alterna com quem está de castigo; modelo e
  tokens registrados (padrão em `iatest/test.mjs` — 12 asserts).
- [ ] Teste ao vivo (admin): cada provedor responde; o detalhe cita o modelo.
- [ ] Troca invisível: mesma entrada, tentativa seguinte continua do
  mesmo ponto, sem reenviar contexto extra.
- [ ] Nenhuma chave em log, código, bundle ou `.env.example`
  (só nomes + comentários).

## 8. Problemas que ainda pedem configuração externa

- Sem `OPENROUTER_API_KEY`, não há fallback (só Gemini/manual).
- Modelos `:free` podem sair do ar ou mudar de nome — a env resolve
  sem deploy de código; o 404 é absorvido sozinho.
- Cota exata/saldo de tokens: **nenhuma API informa** — o gatilho é
  sempre o erro real (429 etc.), nunca consulta inventada.
