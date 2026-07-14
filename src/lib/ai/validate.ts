import type { AiConfidence, AiSuggestionItem, AiSuggestionResponse } from "./types";

const CONFIDENCES: AiConfidence[] = ["alta", "media", "baixa"];

function asConfidence(v: unknown): AiConfidence {
  if (typeof v === "string" && CONFIDENCES.includes(v as AiConfidence)) {
    return v as AiConfidence;
  }
  return "media";
}

function stripCodeFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return t.trim();
}

/** Extrai o primeiro objeto JSON balanceado do texto. */
function extractJsonObject(raw: string): string | null {
  const text = stripCodeFences(raw);
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAiSuggestionResponse(
  raw: string,
  opts?: { maxItems?: number; maxTextLen?: number }
): { ok: true; data: AiSuggestionResponse } | { ok: false; message: string } {
  const maxItems = opts?.maxItems ?? 5;
  const maxTextLen = opts?.maxTextLen ?? 500;

  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) {
    return { ok: false, message: "Resposta da IA não contém JSON válido." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, message: "JSON da IA inválido." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "Formato de resposta inválido." };
  }

  const obj = parsed as Record<string, unknown>;
  const list = obj.sugestoes;

  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, message: "Nenhuma sugestão retornada." };
  }

  const sugestoes: AiSuggestionItem[] = [];

  for (const item of list.slice(0, maxItems)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const texto = typeof row.texto === "string" ? row.texto.trim() : "";
    if (!texto) continue;

    const justificativa =
      typeof row.justificativa === "string"
        ? row.justificativa.trim().slice(0, 200)
        : "";

    sugestoes.push({
      texto: texto.slice(0, maxTextLen),
      justificativa,
      confianca: asConfidence(row.confianca),
    });
  }

  if (sugestoes.length === 0) {
    return { ok: false, message: "Sugestões vazias após validação." };
  }

  const aviso =
    obj.aviso === null || obj.aviso === undefined
      ? null
      : typeof obj.aviso === "string"
        ? obj.aviso.slice(0, 300)
        : String(obj.aviso).slice(0, 300);

  return {
    ok: true,
    data: { sugestoes, aviso },
  };
}
