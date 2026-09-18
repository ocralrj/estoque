export type TarefaStatus =
  | "aguardando"
  | "em_andamento"
  | "confirmacao"
  | "concluida"
  | "cancelada";

export type TarefaPrioridade = "baixa" | "media" | "alta";

/** Linha do histórico/comentário de uma tarefa (o embutido da FK é a pessoa). */
export interface TarefaComentario {
  id: string;
  tarefa_id: string;
  autor_id: string;
  tipo: "comentario" | "transicao";
  texto: string;
  created_at: string;
  autor?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export interface Tarefa {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  prioridade: TarefaPrioridade;
  status: TarefaStatus;
  /** Null = sem data combinada. Atrasar só existe quando há prazo. */
  prazo: string | null;
  created_by: string;
  assigned_to: string | null;
  executor?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  concluida_por_id?: string | null;
  concluida_por?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  concluida_em?: string | null;
  created_at: string;
  updated_at: string;
  criada_por?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  comentarios?: TarefaComentario[];
}

export const TAREFA_STATUS_LABELS: Record<TarefaStatus, string> = {
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  confirmacao: "Confirmação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const TAREFA_STATUS_CLASSES: Record<TarefaStatus, string> = {
  aguardando: "neo-sit neo-sit--info",
  em_andamento: "neo-sit neo-sit--aviso",
  confirmacao: "neo-sit neo-sit--info",
  concluida: "neo-sit neo-sit--ok",
  cancelada: "neo-sit neo-sit--erro",
};

export const TAREFA_PRIORIDADE_LABELS: Record<TarefaPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const TAREFA_PRIORIDADE_CLASSES: Record<TarefaPrioridade, string> = {
  alta: "neo-sit neo-sit--erro",
  media: "neo-sit neo-sit--aviso",
  baixa: "neo-sit neo-sit--ok",
};

const FALLBACK_BADGE = "neo-sit neo-sit--info";

export function tarefaStatusClass(status: string): string {
  return TAREFA_STATUS_CLASSES[status as TarefaStatus] ?? FALLBACK_BADGE;
}

export function tarefaStatusLabel(status: string): string {
  return TAREFA_STATUS_LABELS[status as TarefaStatus] ?? status.replace("_", " ");
}

export function tarefaPrioridadeClass(prioridade: string): string {
  return TAREFA_PRIORIDADE_CLASSES[prioridade as TarefaPrioridade] ?? FALLBACK_BADGE;
}

export function tarefaPrioridadeLabel(prioridade: string): string {
  return TAREFA_PRIORIDADE_LABELS[prioridade as TarefaPrioridade] ?? prioridade;
}

export function tarefaStatus(): TarefaStatus[] {
  return ["aguardando", "em_andamento", "confirmacao", "concluida", "cancelada"];
}

/** Em aberto: ainda dentro do fluxo normal, sujeita a atraso. */
export function tarefaEmCurso(status: string): boolean {
  return status === "aguardando" || status === "em_andamento" || status === "confirmacao";
}

/** Dias de atraso, em inteiro positivo. Só existe para tarefa em curso com prazo no passado. */
export function tarefaDiasDeAtraso(t: Pick<Tarefa, "prazo" | "status">): number | null {
  if (!t.prazo) return null;
  if (!tarefaEmCurso(t.status)) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(t.prazo);
  prazo.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - prazo.getTime()) / 86400000);
  return dias > 0 ? dias : null;
}

/** Vencida, na visão de hoje: prazo é data pura, sem hora; venceu quem passou de ontem. */
export function tarefaAtrasada(t: Pick<Tarefa, "prazo" | "status">): boolean {
  return tarefaDiasDeAtraso(t) !== null;
}

/** Vence ainda hoje? Para pintar de vermelho o que não passou do ponto, mas já corre. */
export function tarefaVenceHoje(t: Pick<Tarefa, "prazo" | "status">): boolean {
  if (!t.prazo) return false;
  if (t.status === "concluida" || t.status === "cancelada") return false;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(t.prazo);
  prazo.setHours(0, 0, 0, 0);
  return prazo.getTime() === hoje.getTime();
}