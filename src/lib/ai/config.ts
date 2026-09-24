/**
 * Configuração do provedor de IA — só no servidor.
 * Padrão: Google Gemini (grátis no AI Studio).
 * Modelo e chave vêm de env; trocar provedor não exige mudar a UI.
 */

export type AiProvider = "gemini" | "openai";

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
  rateLimitPerUserPerHour: number;
}

export function getAiConfig(): AiConfig {
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    null;

  const openaiKey =
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    null;

  // Preferência: AI_PROVIDER explícito → senão Gemini se tiver chave → senão OpenAI-compat
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase();
  let provider: AiProvider = "gemini";
  if (explicit === "openai" || explicit === "groq") {
    provider = "openai";
  } else if (explicit === "gemini" || explicit === "google") {
    provider = "gemini";
  } else if (geminiKey) {
    provider = "gemini";
  } else if (openaiKey) {
    provider = "openai";
  }

  const apiKey = provider === "gemini" ? geminiKey || openaiKey : openaiKey || geminiKey;

  const baseUrl =
    process.env.AI_BASE_URL ||
    (provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta"
      : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");

  const model =
    process.env.AI_MODEL ||
    (provider === "gemini"
      ? process.env.GEMINI_MODEL || "gemini-2.0-flash"
      : process.env.OPENAI_MODEL || "gpt-4o-mini");

  // Interruptor geral; a presença de chave (qualquer provedor) liga o recurso.
  const enabled =
    process.env.AI_SUGGESTIONS_ENABLED !== "false" && temAlgumaChaveIA();

  return {
    enabled,
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 25000),
    maxRetries: Number(process.env.AI_MAX_RETRIES || 1),
    temperature: Number(process.env.AI_TEMPERATURE || 0.3),
    maxTokens: Number(process.env.AI_MAX_TOKENS || 800),
    rateLimitPerUserPerHour: Number(
      process.env.AI_RATE_LIMIT_PER_USER_HOUR || 40
    ),
  };
}

// ---------------------------------------------------------------
// Rotação de provedores com fallback automático (docs/IA_ROTACAO_GUIA.md).
// Ordem padrão: Gemini primeiro (custo zero, padrão do projeto);
// IA_PREFERIDA=openrouter inverte. Sem chave: tudo degrada para manual.
// ---------------------------------------------------------------

/** Modelos gratuitos verificados no OpenRouter (lista pública). */
const MODELOS_TEXTO_PADRAO = [
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "inclusionai/ling-3.0-flash-fin:free",
];

const MODELOS_VISAO_PADRAO = [
  "inclusionai/ling-3.0-flash-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

function listaDeEnv(valor: string | undefined, padrao: string[]): string[] {
  const lista = (valor ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.length > 0 ? Array.from(new Set(lista)) : [...padrao];
}

/** Todas as chaves Gemini (rotação); aceita GEMINI_API_KEYS (vírgula) e os nomes legados. */
export function getChavesGemini(): string[] {
  const brutas = [
    ...(process.env.GEMINI_API_KEYS ?? "").split(","),
    process.env.GEMINI_API_KEY ?? "",
    process.env.GOOGLE_AI_API_KEY ?? "",
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
  ];
  return Array.from(new Set(brutas.map((k) => k.trim()).filter(Boolean)));
}

/** Chave única do OpenRouter (atende todos os modelos). */
export function getChaveOpenRouter(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

/** Ordem de modelos do OpenRouter (env com vírgula ou padrão verificado). */
export function getModelosOpenRouter(tarefa: "texto" | "visao"): string[] {
  return tarefa === "visao"
    ? listaDeEnv(process.env.OPENROUTER_MODELOS_VISAO, MODELOS_VISAO_PADRAO)
    : listaDeEnv(process.env.OPENROUTER_MODELOS_TEXTO, MODELOS_TEXTO_PADRAO);
}

export type PreferenciaIA = "gemini" | "openrouter" | "openai";

/** Quem tenta primeiro. Padrão do projeto: Gemini (grátis). */
export function getPreferenciaIA(): PreferenciaIA {
  const v = (process.env.IA_PREFERIDA || "").toLowerCase();
  if (v === "openrouter") return "openrouter";
  if (v === "openai" || v === "groq") return "openai";
  return "gemini";
}

/** Há ao menos uma chave de IA (qualquer provedor)? */
export function temAlgumaChaveIA(): boolean {
  if (getChavesGemini().length > 0) return true;
  if (getChaveOpenRouter()) return true;
  const legada =
    process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
  return Boolean(legada?.trim());
}
