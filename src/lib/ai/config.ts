/**
 * Configuração do provedor de IA — só no servidor.
 * Modelo e chave vêm de env; trocar provedor não exige mudar a UI.
 */

export interface AiConfig {
  enabled: boolean;
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
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    null;

  const baseUrl =
    process.env.AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1";

  const model =
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  const enabled =
    process.env.AI_SUGGESTIONS_ENABLED === "true" ||
    (process.env.AI_SUGGESTIONS_ENABLED !== "false" && Boolean(apiKey));

  return {
    enabled: enabled && Boolean(apiKey),
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),
    maxRetries: Number(process.env.AI_MAX_RETRIES || 1),
    temperature: Number(process.env.AI_TEMPERATURE || 0.3),
    maxTokens: Number(process.env.AI_MAX_TOKENS || 800),
    rateLimitPerUserPerHour: Number(
      process.env.AI_RATE_LIMIT_PER_USER_HOUR || 30
    ),
  };
}
