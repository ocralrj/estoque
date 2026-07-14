import type { AiConfig } from "../config";
import type { ChatMessage, ProviderResult } from "./openai-compatible";

/**
 * Google Gemini (AI Studio) — tier gratuito com GEMINI_API_KEY.
 * API: generativelanguage.googleapis.com
 * Roda apenas no servidor.
 */
export async function geminiChatCompletion(
  config: AiConfig,
  messages: ChatMessage[]
): Promise<ProviderResult> {
  if (!config.apiKey) {
    throw new Error("GEMINI_API_KEY não configurada");
  }

  let lastError: Error | null = null;
  const attempts = Math.max(1, config.maxRetries + 1);

  for (let i = 0; i < attempts; i++) {
    try {
      return await callGeminiOnce(config, messages);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (
        lastError.message.includes("HTTP 4") &&
        !lastError.message.includes("429")
      ) {
        throw lastError;
      }
      if (i < attempts - 1) {
        await sleep(500 * (i + 1));
      }
    }
  }

  throw lastError || new Error("Falha na chamada ao Gemini");
}

async function callGeminiOnce(
  config: AiConfig,
  messages: ChatMessage[]
): Promise<ProviderResult> {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  // Gemini exige alternância user/model; se o primeiro for model, injeta user vazio
  if (contents.length > 0 && contents[0].role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(contexto)" }] });
  }

  const model = config.model || "gemini-2.0-flash";
  const url = `${config.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey!)}`;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
      responseMimeType: "application/json",
    },
  };

  if (systemParts) {
    body.systemInstruction = {
      parts: [{ text: systemParts }],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} do Gemini${errBody ? `: ${errBody.slice(0, 240)}` : ""}`
      );
    }

    const json = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
      error?: { message?: string };
    };

    if (json.error?.message) {
      throw new Error(json.error.message);
    }

    const content = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    if (!content) {
      throw new Error("Gemini retornou resposta vazia");
    }

    return {
      content,
      model,
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
