import { getAiConfig } from "./config";
import {
  PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompt-templates";
import { chatCompletion } from "./providers/openai-compatible";
import { geminiChatCompletion } from "./providers/gemini";
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
 * Padrão: Google Gemini (grátis no AI Studio).
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
        "Sugestões por IA não estão configuradas. Defina GEMINI_API_KEY no servidor (Google AI Studio).",
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
    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];
    const result =
      config.provider === "gemini"
        ? await geminiChatCompletion(config, messages)
        : await chatCompletion(config, messages);

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

  // Fallbacks por tipo de campo (formulários)
  if (tipo === "descricao_produto") {
    return localProductDescription(input);
  }
  if (tipo === "descricao_grupo") {
    return localGroupDescription(input);
  }
  if (tipo === "motivo_movimentacao") {
    return localMovementReason(input);
  }
  if (tipo === "observacao_movimentacao") {
    return localMovementNotes(input);
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

function localGroupDescription(input: AiSuggestContext): AiSuggestionResponse {
  const ctx = input.contexto || {};
  const nome = String(ctx.nome_grupo || ctx.nome || "").trim();
  const rascunho = input.entrada_usuario?.trim();
  const base = nome || "Grupo de usuários";

  return {
    sugestoes: [
      {
        texto: (
          rascunho ||
          `${base}: grupo responsável por atividades operacionais no sistema OCRAL. Define permissões e acesso conforme o perfil dos membros.`
        ).slice(0, 300),
        justificativa: "Descrição operacional do grupo",
        confianca: nome ? "media" : "baixa",
      },
      {
        texto: `Grupo "${base}" para organização de usuários e concessão de permissões por função. Membros herdam as permissões atribuídas ao grupo.`.slice(
          0,
          300
        ),
        justificativa: "Foco em permissões",
        confianca: "media",
      },
      {
        texto: `Responsabilidades do ${base}: executar rotinas do módulo atribuído, manter dados consistentes e seguir as políticas de acesso definidas pela administração.`.slice(
          0,
          300
        ),
        justificativa: "Foco em responsabilidades",
        confianca: "baixa",
      },
    ],
    aviso: "Modo local — configure GEMINI_API_KEY para textos mais elaborados.",
  };
}

function localProductDescription(input: AiSuggestContext): AiSuggestionResponse {
  const ctx = input.contexto || {};
  const nome = String(ctx.nome || "").trim();
  const codigo = String(ctx.codigo || "").trim();
  const unidade = String(ctx.unidade || "").trim();
  const categoria = String(ctx.categoria || "").trim();
  const localizacao = String(ctx.localizacao || "").trim();
  const rascunho = input.entrada_usuario?.trim();

  if (!nome && !rascunho) {
    return {
      sugestoes: [
        {
          texto:
            "Informe o nome do produto para gerar uma descrição. Ex.: material de consumo do almoxarifado.",
          justificativa: "Falta o nome do produto",
          confianca: "baixa",
        },
      ],
      aviso: "Preencha ao menos o nome do produto.",
    };
  }

  const base = nome || rascunho || "Item";
  const parts: string[] = [];
  parts.push(`${base}`);
  if (categoria) parts.push(`Categoria: ${categoria}.`);
  if (unidade) parts.push(`Unidade de controle: ${unidade}.`);
  if (codigo) parts.push(`Código interno: ${codigo}.`);
  if (localizacao) parts.push(`Localização sugerida: ${localizacao}.`);

  const sugestoes: AiSuggestionResponse["sugestoes"] = [
    {
      texto: `${base} — item de almoxarifado para controle de estoque${
        categoria ? ` (${categoria})` : ""
      }.${unidade ? ` Controlado em ${unidade}.` : ""}${
        localizacao ? ` Guarde em ${localizacao}.` : ""
      }`.slice(0, 300),
      justificativa: "Descrição operacional com base no cadastro",
      confianca: nome ? "media" : "baixa",
    },
    {
      texto: `Material/item "${base}" destinado a uso interno. Manter saldo mínimo e registrar toda entrada/saída no sistema.${
        codigo ? ` Ref. ${codigo}.` : ""
      }`.slice(0, 300),
      justificativa: "Foco em rastreabilidade",
      confianca: "media",
    },
    {
      texto: (rascunho
        ? rascunho
        : `${base}: consumível/equipamento de almoxarifado. Verificar quantidade mínima antes de atender requisições.`
      ).slice(0, 300),
      justificativa: rascunho ? "A partir do texto já digitado" : "Sugestão genérica de uso",
      confianca: rascunho ? "media" : "baixa",
    },
  ];

  return {
    sugestoes,
    aviso: "Modo local — configure AI_API_KEY para textos mais elaborados.",
  };
}

function localMovementReason(input: AiSuggestContext): AiSuggestionResponse {
  const ctx = input.contexto || {};
  const tipo = String(ctx.tipo || "entrada");
  const produto = (ctx.produto || {}) as Record<string, unknown>;
  const nome = String(produto.nome || "produto");
  const rascunho = input.entrada_usuario?.trim();

  if (tipo === "entrada") {
    return {
      sugestoes: [
        {
          texto: rascunho || `Compra / recebimento de ${nome}`,
          justificativa: "Entrada por aquisição",
          confianca: "media",
        },
        {
          texto: `Devolução ao estoque — ${nome}`,
          justificativa: "Entrada por devolução",
          confianca: "media",
        },
        {
          texto: `Ajuste de inventário (entrada) — ${nome}`,
          justificativa: "Correção de saldo",
          confianca: "baixa",
        },
      ],
      aviso: "Modo local — revise o motivo antes de salvar.",
    };
  }

  return {
    sugestoes: [
      {
        texto: rascunho || `Requisição / utilização de ${nome}`,
        justificativa: "Saída operacional",
        confianca: "media",
      },
      {
        texto: `Consumo interno — ${nome}`,
        justificativa: "Uso no dia a dia",
        confianca: "media",
      },
      {
        texto: `Ajuste de inventário (saída) — ${nome}`,
        justificativa: "Correção de saldo",
        confianca: "baixa",
      },
    ],
    aviso: "Modo local — revise o motivo antes de salvar.",
  };
}

function localMovementNotes(input: AiSuggestContext): AiSuggestionResponse {
  const ctx = input.contexto || {};
  const tipo = String(ctx.tipo || "");
  const motivo = String(ctx.motivo || "").trim();
  const produto = (ctx.produto || {}) as Record<string, unknown>;
  const nome = String(produto.nome || "item");
  const qty = ctx.quantidade;

  const base = [
    motivo ? `Motivo: ${motivo}.` : null,
    qty ? `Quantidade: ${qty}.` : null,
    `Produto: ${nome}.`,
    tipo === "saida"
      ? "Registrar responsável e destino, se aplicável."
      : "Conferir nota fiscal / documento de origem, se houver.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    sugestoes: [
      {
        texto: (input.entrada_usuario?.trim() || base).slice(0, 300),
        justificativa: "Observação objetiva da movimentação",
        confianca: "media",
      },
      {
        texto: `Sem divergências aparentes. Movimentação de ${tipo || "estoque"} registrada para ${nome}.`.slice(
          0,
          300
        ),
        justificativa: "Nota curta padrão",
        confianca: "baixa",
      },
    ],
    aviso: "Modo local — edite se precisar de detalhes específicos.",
  };
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(n)));
}
