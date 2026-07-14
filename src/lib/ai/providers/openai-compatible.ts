import type { AiConfig } from "../config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderResult {
  content: string;
  model: string;
}

/**
 * Cliente OpenAI-compatible (OpenAI, Groq, Azure OpenAI, etc.).
 * Roda apenas no servidor.
 */
export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[]
): Promise<ProviderResult> {
  if (!config.apiKey) {
    throw new Error("AI_API_KEY não configurada");
  }

  let lastError: Error | null = null;
  const attempts = Math.max(1, config.maxRetries + 1);

  for (let i = 0; i < attempts; i++) {
    try {
      return await callOnce(config, messages);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // não retenta em 4xx (exceto 429)
      if (lastError.message.includes("HTTP 4") && !lastError.message.includes("429")) {
        throw lastError;
      }
      if (i < attempts - 1) {
        await sleep(400 * (i + 1));
      }
    }
  }

  throw lastError || new Error("Falha na chamada à IA");
}

async function callOnce(
  config: AiConfig,
  messages: ChatMessage[]
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} do provedor de IA${body ? `: ${body.slice(0, 200)}` : ""}`
      );
    }

    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Provedor retornou resposta vazia");
    }

    return {
      content,
      model: json.model || config.model,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
