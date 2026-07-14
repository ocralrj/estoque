import { getAiConfig } from "./config";
import {
  PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompt-templates";
import { chatCompletion } from "./providers/openai-compatible";
import { checkRateLimit } from "./rate-limit";
import { parseAiSuggestionResponse } from "./validate";
import type {
  AiPipelineOutcome,
  AiSuggestContext,
  AiSuggestionResponse,
} from "./types";
import {
  buildSummary,
  clarifyIdea,
} from "@/lib/suggestions/clarify";
import type { SuggestionMessage } from "@/types/modules/suggestions";

/**
 * Pipeline: autorizar (caller) → rate limit → contexto → prompt → modelo → validar → pós-processar.
 * A IA recomenda; o usuário aceita/edita/descarta.
 */
export async function runAiSuggestPipeline(
  userId: string,
  input: AiSuggestContext,
  options?: { allowFallback?: boolean }
): Promise<AiPipelineOutcome> {
  const allowFallback = options?.allowFallback !== false;
  const config = getAiConfig();

  const n = clampInt(input.n ?? 3, 1, 5);
  const tipo = (input.tipo_campo || "campo_generico").slice(0, 80);
  const dominio = (input.dominio || "ERP OCRAL").slice(0, 80);

  // Rate limit por usuário
  const rl = checkRateLimit(
    `ai-suggest:${userId}`,
    config.rateLimitPerUserPerHour
  );
  if (!rl.allowed) {
    if (allowFallback) {
      const fb = localFallback(input);
      return {
        ok: true,
        data: fb,
        source: "fallback",
        prompt_version: PROMPT_VERSION,
      };
    }
    return {
      ok: false,
      code: "RATE_LIMIT",
      message:
        "Limite de sugestões por hora atingido. Tente novamente mais tarde.",
    };
  }

  if (!config.enabled || !config.apiKey) {
    if (allowFallback) {
      return {
        ok: true,
        data: localFallback(input),
        source: "fallback",
        prompt_version: PROMPT_VERSION,
      };
    }
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "Sugestões por IA não estão configuradas. Defina AI_API_KEY no servidor.",
    };
  }

  const system = buildSystemPrompt({
    tipo_campo: tipo,
    dominio,
    n,
    o_que_sugerir:
      input.o_que_sugerir || "textos claros e acionáveis para o usuário",
    idioma: input.idioma || "português (Brasil)",
    tom: input.tom || "profissional e objetivo",
    limite: input.limite || "até 300 caracteres por sugestão",
  });

  const user = buildUserPrompt({
    contexto: input.contexto || {},
    entrada_usuario: input.entrada_usuario,
    historico: input.historico,
  });

  try {
    const result = await chatCompletion(config, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const validated = parseAiSuggestionResponse(result.content, {
      maxItems: n,
      maxTextLen: 500,
    });

    if (!validated.ok) {
      if (allowFallback) {
        return {
          ok: true,
          data: {
            ...localFallback(input),
            aviso:
              "A IA retornou formato inválido; usamos uma sugestão local. " +
              validated.message,
          },
          source: "fallback",
          prompt_version: PROMPT_VERSION,
        };
      }
      return { ok: false, code: "VALIDATION", message: validated.message };
    }

    return {
      ok: true,
      data: postProcess(validated.data),
      source: "ai",
      model: result.model,
      prompt_version: PROMPT_VERSION,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (allowFallback) {
      return {
        ok: true,
        data: {
          ...localFallback(input),
          aviso:
            msg === "TIMEOUT"
              ? "A IA demorou demais; usamos sugestão local."
              : "Falha temporária na IA; usamos sugestão local.",
        },
        source: "fallback",
        prompt_version: PROMPT_VERSION,
      };
    }
    if (msg === "TIMEOUT") {
      return {
        ok: false,
        code: "TIMEOUT",
        message: "A IA demorou demais. Tente novamente.",
      };
    }
    return {
      ok: false,
      code: "PROVIDER",
      message: "Não foi possível obter sugestões agora. Tente novamente.",
    };
  }
}

function postProcess(data: AiSuggestionResponse): AiSuggestionResponse {
  return {
    aviso: data.aviso,
    sugestoes: data.sugestoes.map((s) => ({
      ...s,
      texto: s.texto.replace(/\s+/g, " ").trim(),
      justificativa: s.justificativa.replace(/\s+/g, " ").trim(),
    })),
  };
}

/**
 * Fallback determinístico (sem provedor externo).
 * Mantém o recurso utilizável sem chave de IA.
 */
function localFallback(input: AiSuggestContext): AiSuggestionResponse {
  const tipo = input.tipo_campo || "";

  if (tipo === "melhoria_sistema" || tipo === "improvement_summary") {
    const historico = (input.historico || []).map((h) => ({
      role: h.role,
      content: h.content,
      at: new Date().toISOString(),
    })) as SuggestionMessage[];

    const entrada = input.entrada_usuario?.trim();
    if (entrada) {
      historico.push({
        role: "user",
        content: entrada,
        at: new Date().toISOString(),
      });
    }

    if (tipo === "melhoria_sistema" && historico.filter((m) => m.role === "user").length > 0) {
      const clarified = clarifyIdea(historico);
      return {
        sugestoes: [
          {
            texto: clarified.reply,
            justificativa: "Resposta local de clarificação do pedido",
            confianca: clarified.ready_for_summary ? "media" : "baixa",
          },
        ],
        aviso: clarified.ready_for_summary
          ? null
          : "Contexto ainda incompleto — continue detalhando o pedido.",
      };
    }

    if (historico.filter((m) => m.role === "user").length > 0) {
      const summary = buildSummary(historico);
      return {
        sugestoes: [
          {
            texto: summary.summary,
            justificativa: `Título sugerido: ${summary.title}`,
            confianca: "media",
          },
          {
            texto: `O que: ${summary.what_wanted}`,
            justificativa: "Extraído da conversa",
            confianca: "media",
          },
          {
            texto: `Por quê: ${summary.why_wanted}`,
            justificativa: "Extraído da conversa",
            confianca: "media",
          },
        ],
        aviso: null,
      };
    }
  }

  // Genérico
  const seed =
    input.entrada_usuario?.trim() ||
    String(input.contexto?.titulo || input.contexto?.nome || "").trim();

  if (!seed) {
    return {
      sugestoes: [
        {
          texto: "Preencha mais detalhes no formulário para gerar uma sugestão útil.",
          justificativa: "Contexto insuficiente",
          confianca: "baixa",
        },
      ],
      aviso: "Contexto insuficiente para gerar sugestões de qualidade.",
    };
  }

  return {
    sugestoes: [
      {
        texto: seed.slice(0, 300),
        justificativa: "Baseado no texto informado (modo local)",
        confianca: "baixa",
      },
    ],
    aviso: "Modo local — configure AI_API_KEY para sugestões por modelo.",
  };
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(n)));
}
