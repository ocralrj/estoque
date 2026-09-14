export type TarefaStatus =
  | "aberta"
  | "em_andamento"
  | "concluida"
  | "cancelada";

export type TarefaPrioridade = "baixa" | "media" | "alta";

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
  assigned_to_id?: string | null;
  assigned_to?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  assigned_group_id?: string | null;
  assigned_group?: {
    id: string;
    name: string;
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
}

export const TAREFA_STATUS_LABELS: Record<TarefaStatus, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const TAREFA_STATUS_CLASSES: Record<TarefaStatus, string> = {
  aberta: "neo-sit neo-sit--info",
  em_andamento: "neo-sit neo-sit--aviso",
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

/** Vencida, na visão de hoje: prazo é data pura, sem hora; venceu quem passou de ontem. */
export function tarefaAtrasada(t: Pick<Tarefa, "prazo" | "status">): boolean {
  if (!t.prazo) return false;
  if (t.status === "concluida" || t.status === "cancelada") return false;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(t.prazo) < hoje;
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