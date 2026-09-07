import type { UserRole } from "@/types/database";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  gestor: "Gestor",
  almoxarife: "Almoxarife",
  requisitante: "Requisitante",
};

export function roleLabel(role?: string | null): string {
  return ROLE_LABELS[role as UserRole] ?? role ?? "—";
}

export const PROTOCOL_STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/**
 * Classes de situação do NEO (seção 3b). O glifo vem do ::before da classe e é
 * obrigatório: as quatro cores semânticas têm contraste 1.00:1 entre si — em
 * escala de cinza são o mesmo tom, e sem o símbolo quem tem daltonismo não
 * distingue um estado do outro.
 */
export const PROTOCOL_STATUS_CLASSES: Record<string, string> = {
  aberto: "neo-sit neo-sit--info",
  em_andamento: "neo-sit neo-sit--aviso",
  concluido: "neo-sit neo-sit--ok",
  cancelado: "neo-sit neo-sit--erro",
};

export const PRIORITY_LABELS: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const PRIORITY_CLASSES: Record<string, string> = {
  alta: "neo-sit neo-sit--erro",
  media: "neo-sit neo-sit--aviso",
  baixa: "neo-sit neo-sit--ok",
};

const FALLBACK_BADGE = "neo-sit neo-sit--info";

export function protocolStatusClass(status: string): string {
  return PROTOCOL_STATUS_CLASSES[status] ?? FALLBACK_BADGE;
}

export function protocolStatusLabel(status: string): string {
  return PROTOCOL_STATUS_LABELS[status] ?? status.replace("_", " ");
}

export function priorityClass(priority: string): string {
  return PRIORITY_CLASSES[priority] ?? FALLBACK_BADGE;
}

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

/** Data e hora no formato brasileiro, a partir de um timestamp do banco. */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

/** Apenas a data, no formato brasileiro. */
export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Situação da conta, como aparece na tela. */
export const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  ferias: "Férias",
  inativo: "Inativo",
};

/**
 * Classes da pastilha de situação.
 *
 * O glifo do `.neo-sit` é obrigatório: as quatro cores semânticas do sistema
 * têm contraste 1:1 entre si, então a cor sozinha não diria nada a quem não as
 * distingue. O neon é o terceiro reforço, nunca a informação.
 */
export const STATUS_CLASSES: Record<string, string> = {
  ativo: "neo-sit neo-sit--ok neo-sit--neon-ok",
  ferias: "neo-sit neo-sit--aviso neo-sit--neon-aviso",
  inativo: "neo-sit neo-sit--erro neo-sit--neon-erro",
};

/** Situação a partir do perfil, tolerando bases sem a coluna `status`. */
export function statusDoPerfil(p: {
  status?: string | null;
  active?: boolean;
}): "ativo" | "ferias" | "inativo" {
  if (p.status === "ferias" || p.status === "inativo" || p.status === "ativo") {
    return p.status;
  }
  return p.active === false ? "inativo" : "ativo";
}
