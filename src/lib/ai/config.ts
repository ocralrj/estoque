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

  const enabled =
    process.env.AI_SUGGESTIONS_ENABLED === "true" ||
    (process.env.AI_SUGGESTIONS_ENABLED !== "false" && Boolean(apiKey));

  return {
    enabled: enabled && Boolean(apiKey),
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
