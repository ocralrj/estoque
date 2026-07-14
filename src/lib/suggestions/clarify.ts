import type {
  ClarifyResult,
  SuggestionMessage,
  SuggestionPriority,
  SummaryResult,
} from "@/types/modules/suggestions";

/**
 * Clarificação local da ideia do usuário.
 * Não decide implementação — só organiza o pedido (o que / por quê).
 * Pode ser substituída depois por chamada a um LLM sem mudar a UI.
 */

const MODULE_KEYWORDS: { hint: string; words: string[] }[] = [
  { hint: "Estoque", words: ["estoque", "produto", "almoxarifado", "moviment", "inventário", "inventario", "requisi"] },
  { hint: "Certificados", words: ["certificado", "validade", "ssl", "digital"] },
  { hint: "GED", words: ["documento", "ged", "arquivo", "pasta", "upload"] },
  { hint: "Administração", words: ["usuário", "usuario", "grupo", "permiss", "role", "admin"] },
  { hint: "Relatórios", words: ["relatório", "relatorio", "dashboard", "export", "csv", "gráfico", "grafico"] },
  { hint: "Interface", words: ["tela", "botão", "botao", "menu", "layout", "filtro", "busca", "mobile"] },
];

function detectModule(text: string): string | null {
  const lower = text.toLowerCase();
  for (const m of MODULE_KEYWORDS) {
    if (m.words.some((w) => lower.includes(w))) return m.hint;
  }
  return null;
}

function detectPriority(text: string): SuggestionPriority {
  const lower = text.toLowerCase();
  if (/(urgente|crítico|critico|bloqueia|parou|não consigo|nao consigo|erro grave)/.test(lower)) {
    return "alta";
  }
  if (/(seria bom|opcional|melhoria|facilita|comodidade)/.test(lower)) {
    return "baixa";
  }
  return "media";
}

function extractWhatWhy(messages: SuggestionMessage[]): { what: string; why: string } {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const joined = userTexts.join("\n");

  let what = "";
  let why = "";

  const whyMatch = joined.match(/(?:porque|por que|pois|para que|já que|ja que|motivo[:\s]+)(.+)/i);
  if (whyMatch) {
    why = whyMatch[1].trim().slice(0, 400);
  }

  // O "o que" é a ideia principal (primeira mensagem ou trecho sem o porquê)
  const first = userTexts[0] || joined;
  what = first
    .replace(/(?:porque|por que|pois).+$/i, "")
    .trim()
    .slice(0, 500);

  if (!what) what = first.slice(0, 500);
  if (!why) {
    // tenta achar intenção em mensagens posteriores
    const later = userTexts.slice(1).join(" ");
    if (later) why = later.slice(0, 400);
    else why = "Melhorar a experiência e a eficiência no uso do sistema.";
  }

  return { what, why };
}

function countUserMessages(messages: SuggestionMessage[]) {
  return messages.filter((m) => m.role === "user").length;
}

function totalUserChars(messages: SuggestionMessage[]) {
  return messages
    .filter((m) => m.role === "user")
    .reduce((n, m) => n + m.content.trim().length, 0);
}

export function clarifyIdea(messages: SuggestionMessage[]): ClarifyResult {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || lastUser.content.trim().length < 8) {
    return {
      reply:
        "Conte um pouco mais sobre a melhoria. O que você gostaria de ver no sistema e por quê isso ajuda no seu dia a dia?",
      ready_for_summary: false,
    };
  }

  const userCount = countUserMessages(messages);
  const chars = totalUserChars(messages);
  const { what, why } = extractWhatWhy(messages);
  const module_hint = detectModule(messages.map((m) => m.content).join(" ")) || undefined;

  // Primeira resposta: pede o "por quê" se ainda fraco
  if (userCount === 1 && chars < 80) {
    return {
      reply:
        "Entendi o começo da ideia. Pode detalhar um pouco mais? Em qual tela ou situação isso aparece, e qual problema resolve para você?",
      ready_for_summary: false,
      extracted: { what, why, module_hint },
    };
  }

  if (userCount === 1 && !/(porque|por que|pois|para |assim |hoje |sempre )/i.test(lastUser.content)) {
    return {
      reply:
        "Boa! Só para deixar o pedido bem claro: por que essa melhoria é importante para o seu trabalho? O que fica difícil ou lento hoje?",
      ready_for_summary: false,
      extracted: { what, why, module_hint },
    };
  }

  // Já tem conteúdo suficiente
  if (chars >= 40 || userCount >= 2) {
    return {
      reply:
        "Perfeito. Com o que você descreveu já dá para montar um resumo claro do pedido. Clique em \"Gerar resumo\" quando quiser revisar e enviar — ou continue escrevendo se quiser acrescentar detalhes.",
      ready_for_summary: true,
      extracted: { what, why, module_hint },
    };
  }

  return {
    reply: "Pode continuar — quanto mais contexto (tela, frequência, quem usa), melhor fica o pedido.",
    ready_for_summary: false,
    extracted: { what, why, module_hint },
  };
}

export function buildSummary(messages: SuggestionMessage[]): SummaryResult {
  const { what, why } = extractWhatWhy(messages);
  const allText = messages.map((m) => m.content).join(" ");
  const module_hint = detectModule(allText);
  const priority = detectPriority(allText);

  const titleBase = what
    .split(/[.!?\n]/)[0]
    .trim()
    .slice(0, 80);

  const title =
    titleBase.length >= 8
      ? titleBase.charAt(0).toUpperCase() + titleBase.slice(1)
      : "Melhoria sugerida no sistema";

  const summary = [
    `O usuário solicita: ${what}`,
    `Motivo / benefício: ${why}`,
    module_hint ? `Módulo provável: ${module_hint}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    summary,
    what_wanted: what,
    why_wanted: why,
    priority,
    module_hint,
  };
}
