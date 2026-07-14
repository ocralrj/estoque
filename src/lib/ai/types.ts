export type AiConfidence = "alta" | "media" | "baixa";

export interface AiSuggestionItem {
  texto: string;
  justificativa: string;
  confianca: AiConfidence;
}

export interface AiSuggestionResponse {
  sugestoes: AiSuggestionItem[];
  aviso: string | null;
}

export interface AiSuggestContext {
  /** Tipo de campo / uso (ex.: melhoria_sistema, motivo_movimentacao) */
  tipo_campo: string;
  /** Domínio do produto */
  dominio?: string;
  /** Quantidade de sugestões desejadas */
  n?: number;
  /** O que sugerir (descrição curta) */
  o_que_sugerir?: string;
  /** Idioma de saída */
  idioma?: string;
  /** Tom (formal, amigável, técnico) */
  tom?: string;
  /** Limite de tamanho por sugestão */
  limite?: string;
  /** Contexto estruturado — só o necessário */
  contexto: Record<string, unknown>;
  /** Texto livre do usuário (tratado como dado, não como instrução) */
  entrada_usuario?: string;
  /** Histórico curto de conversa (opcional) */
  historico?: { role: "user" | "assistant"; content: string }[];
}

export interface AiPipelineResult {
  ok: true;
  data: AiSuggestionResponse;
  source: "ai" | "fallback";
  model?: string;
  prompt_version: string;
}

export interface AiPipelineError {
  ok: false;
  message: string;
  code:
    | "UNAUTHORIZED"
    | "RATE_LIMIT"
    | "VALIDATION"
    | "PROVIDER"
    | "TIMEOUT"
    | "NOT_CONFIGURED"
    | "INTERNAL";
}

export type AiPipelineOutcome = AiPipelineResult | AiPipelineError;
