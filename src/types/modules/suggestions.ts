export type SuggestionStatus =
  | "rascunho"
  | "enviada"
  | "em_analise"
  | "planejada"
  | "em_andamento"
  | "concluida"
  | "recusada"
  /** A gestão escreveu de volta e devolveu a bola ao autor. */
  | "reenviada"
  /** O autor deu o assunto por resolvido. Só ele pode marcar. */
  | "atendida";

export type SuggestionPriority = "baixa" | "media" | "alta";

export type ConversationRole = "user" | "assistant" | "system";

export interface SuggestionMessage {
  role: ConversationRole;
  content: string;
  at: string;
}

export interface ImprovementSuggestion {
  id: string;
  code: string;
  user_id: string;
  title: string;
  raw_idea: string;
  summary: string;
  what_wanted: string | null;
  why_wanted: string | null;
  conversation: SuggestionMessage[];
  status: SuggestionStatus;
  priority: SuggestionPriority;
  module_hint: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Quantas vezes a gestão escreveu de volta. Alto = assunto que não fecha. */
  idas_e_vindas?: number;
  /** Quando o autor encerrou. Conta os 30 dias até o descarte. */
  atendida_em?: string | null;
  /** O fio de conversa entre o autor e a equipe. */
  mensagens?: MensagemDaSugestao[];
  created_at: string;
  updated_at: string;
  user?: {
    full_name: string | null;
    email: string;
  } | null;
}

export interface CreateSuggestionInput {
  title: string;
  raw_idea: string;
  summary: string;
  what_wanted?: string;
  why_wanted?: string;
  conversation: SuggestionMessage[];
  priority?: SuggestionPriority;
  module_hint?: string;
}

export interface ClarifyResult {
  reply: string;
  ready_for_summary: boolean;
  extracted?: {
    what?: string;
    why?: string;
    module_hint?: string;
  };
}

export interface SummaryResult {
  title: string;
  summary: string;
  what_wanted: string;
  why_wanted: string;
  priority: SuggestionPriority;
  module_hint: string | null;
}

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  em_analise: "Em análise",
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  recusada: "Recusada",
  reenviada: "Reenviada ao autor",
  atendida: "Atendida",
};

export const SUGGESTION_PRIORITY_LABELS: Record<SuggestionPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const SUGGESTION_STATUS_COLORS: Record<SuggestionStatus, string> = {
  rascunho: "bg-gray-100 text-gray-800",
  enviada: "bg-blue-100 text-blue-800",
  em_analise: "bg-yellow-100 text-yellow-800",
  planejada: "bg-purple-100 text-purple-800",
  em_andamento: "bg-orange-100 text-orange-800",
  reenviada: "bg-amber-100 text-amber-800",
  atendida: "bg-emerald-100 text-emerald-800",
  concluida: "bg-green-100 text-green-800",
  recusada: "bg-red-100 text-red-800",
};


/** Uma fala no fio de conversa da sugestão. */
export interface MensagemDaSugestao {
  id: string;
  suggestion_id: string;
  user_id: string;
  texto: string;
  /** true quando quem escreveu respondia pela gestão naquele momento. */
  da_gestao: boolean;
  created_at: string;
  autor?: {
    full_name: string | null;
    email: string;
    avatar_url?: string | null;
  } | null;
}
