"use server";

import { createClient } from "@/lib/supabase/server";
import { runAiSuggestPipeline } from "@/lib/ai/suggest";
import type { AiPipelineOutcome, AiSuggestContext } from "@/lib/ai/types";
import type { SuggestionMessage } from "@/types/modules/suggestions";
import { buildSummary, clarifyIdea } from "@/lib/suggestions/clarify";

/**
 * Endpoint autenticado de sugestão por IA.
 * Nunca expõe a chave; valida auth + rate limit no pipeline.
 */
export async function suggestWithAi(
  input: AiSuggestContext
): Promise<AiPipelineOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, code: "UNAUTHORIZED", message: "Não autenticado" };
  }

  // Sanitização mínima da entrada (não confiar no cliente)
  const safe: AiSuggestContext = {
    tipo_campo: String(input.tipo_campo || "campo_generico").slice(0, 80),
    dominio: String(input.dominio || "ERP OCRAL - Estoque e Almoxarifado").slice(
      0,
      120
    ),
    n: input.n,
    o_que_sugerir: input.o_que_sugerir?.slice(0, 200),
    idioma: input.idioma || "português (Brasil)",
    tom: input.tom || "profissional, claro e objetivo",
    limite: input.limite || "até 300 caracteres por sugestão",
    contexto: (input.contexto && typeof input.contexto === "object"
      ? input.contexto
      : {}) as Record<string, unknown>,
    entrada_usuario: input.entrada_usuario?.slice(0, 2000),
    historico: Array.isArray(input.historico)
      ? input.historico.slice(-8).map((h) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content || "").slice(0, 800),
        }))
      : undefined,
  };

  return runAiSuggestPipeline(user.id, safe, { allowFallback: true });
}

/**
 * Clarifica ideia de melhoria (chat do modal) via pipeline.
 * Retorna reply + ready_for_summary compatível com o modal atual.
 */
export async function clarifyImprovementIdea(messages: SuggestionMessage[]): Promise<{
  ok: true;
  reply: string;
  ready_for_summary: boolean;
  source: "ai" | "fallback";
  aviso?: string | null;
} | { ok: false; message: string }> {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) {
    return {
      ok: true,
      reply:
        "Conte a melhoria que você gostaria de ver. Foque no que quer e no porquê.",
      ready_for_summary: false,
      source: "fallback",
    };
  }

  const last = userMessages[userMessages.length - 1]?.content || "";

  const outcome = await suggestWithAi({
    tipo_campo: "melhoria_sistema",
    dominio: "ERP OCRAL",
    n: 1,
    o_que_sugerir:
      "uma resposta curta de clarificação do pedido de melhoria (pergunte o que falta ou confirme que já dá para resumir)",
    limite: "até 280 caracteres",
    contexto: {
      objetivo:
        "Ajudar o usuário a deixar o pedido claro (o que / por quê). Não decidir implementação.",
      total_mensagens_usuario: userMessages.length,
      pronto_se:
        "já houver o que se quer e o porquê com detalhes suficientes",
    },
    entrada_usuario: last,
    historico: messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
  });

  if (!outcome.ok) {
    // fallback local síncrono
    const local = clarifyIdea(messages);
    return {
      ok: true,
      reply: local.reply,
      ready_for_summary: local.ready_for_summary,
      source: "fallback",
    };
  }

  const texto = outcome.data.sugestoes[0]?.texto || "";
  const local = clarifyIdea(messages);
  const ready =
    local.ready_for_summary ||
    /gerar resumo|já dá|ja da|pronto|suficiente|perfeito/i.test(texto);

  return {
    ok: true,
    reply: texto || local.reply,
    ready_for_summary: ready,
    source: outcome.source,
    aviso: outcome.data.aviso,
  };
}

/**
 * Gera resumo estruturado do pedido de melhoria (preview editável).
 */
export async function summarizeImprovementIdea(messages: SuggestionMessage[]): Promise<{
  ok: true;
  title: string;
  summary: string;
  what_wanted: string;
  why_wanted: string;
  priority: "baixa" | "media" | "alta";
  module_hint: string | null;
  source: "ai" | "fallback";
  aviso?: string | null;
  confianca?: string;
} | { ok: false; message: string }> {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) {
    return { ok: false, message: "Escreva sua ideia antes de gerar o resumo." };
  }

  const local = buildSummary(messages);

  const outcome = await suggestWithAi({
    tipo_campo: "improvement_summary",
    dominio: "ERP OCRAL",
    n: 1,
    o_que_sugerir:
      "um resumo claro do pedido de melhoria com título, o que se quer e o porquê",
    limite: "até 400 caracteres no texto principal",
    contexto: {
      objetivo: "Organizar o pedido; não decidir se será implementado",
      resumo_local: local,
      campos_desejados: ["titulo", "o_que", "por_que", "prioridade", "modulo"],
    },
    entrada_usuario: userMessages.map((m) => m.content).join("\n\n"),
    historico: messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
  });

  if (!outcome.ok) {
    return {
      ok: true,
      ...local,
      source: "fallback",
    };
  }

  const main = outcome.data.sugestoes[0];
  // Preferimos o resumo local estruturado e enriquecemos com o texto da IA se útil
  const summaryText =
    main?.texto && main.texto.length > 20 ? main.texto : local.summary;

  return {
    ok: true,
    title: local.title,
    summary: summaryText,
    what_wanted: local.what_wanted,
    why_wanted: local.why_wanted,
    priority: local.priority,
    module_hint: local.module_hint,
    source: outcome.source,
    aviso: outcome.data.aviso,
    confianca: main?.confianca,
  };
}
