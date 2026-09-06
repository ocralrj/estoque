export type GedSetor =
  | "Fiscal"
  | "DP"
  | "Contábil"
  | "Jurídico"
  | "Administrativo";

export type GedStatus =
  | "Rascunho"
  | "Ativo"
  | "Assinado"
  | "Arquivado"
  | "Eliminado";

export const GED_SETORES: GedSetor[] = [
  "Fiscal",
  "DP",
  "Contábil",
  "Jurídico",
  "Administrativo",
];

export interface GedFolder {
  id: string;
  setor: GedSetor;
  nome: string;
  caminho: string;
  ativa: boolean;
  created_at: string;
}

export interface GedDocument {
  id: string;
  codigo: string;
  cliente: string;
  cnpj: string | null;
  setor: GedSetor;
  tipo: string;
  nome: string;
  folder_id: string | null;
  caminho: string | null;
  status: GedStatus;
  versao: number;
  hash: string | null;
  periodo: string | null;
  responsavel_id: string | null;
  data_documento: string | null;
  validade: string | null;
  categoria: string | null;
  resumo: string | null;
  tags: string[];
  storage_path: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  tamanho_original_bytes: number | null;
  /** Como o binário foi guardado — ver src/lib/ged/arquivos.ts */
  compressao: "nenhuma" | "imagem" | "gzip";
  /** todos = qualquer autenticado lê; restrito = só quem consta em ged_document_access */
  visibilidade: "todos" | "restrito";
  retention_rule_id: string | null;
  /** Vencimento do prazo de guarda, calculado pelo trigger no banco. */
  data_descarte: string | null;
  created_at: string;
  updated_at: string;
  responsavel?: { full_name: string | null; email: string } | null;
}

export interface GedRetentionRule {
  id: string;
  setor: GedSetor;
  tipo: string;
  prazo: string;
  /** Prazo em meses. null = guarda permanente, nunca descartado. */
  prazo_meses: number | null;
  destino: string;
  base_legal: string | null;
  ativa: boolean;
}

export interface GedCertificate {
  id: string;
  cliente: string;
  certificado: string;
  validade: string;
  observacao: string | null;
}

export interface GedAuditEntry {
  id: string;
  document_id: string | null;
  documento_nome: string;
  acao: string;
  detalhe: string | null;
  user_id: string | null;
  created_at: string;
  user?: { full_name: string | null; email: string } | null;
}

/** Classe do badge de status, alinhada às variáveis do tema. */
export const GED_STATUS_CLASSES: Record<GedStatus, string> = {
  Assinado: "bg-[var(--success)] text-[var(--text)]",
  Ativo: "bg-[var(--primary-soft)] text-[var(--primary-strong)]",
  Arquivado: "bg-[var(--warning)] text-[var(--text)]",
  Rascunho: "bg-[var(--surface-strong)] text-[var(--muted-strong)]",
  Eliminado: "bg-[var(--danger)] text-[var(--text)]",
};

export function gedStatusClass(status: string): string {
  return (
    GED_STATUS_CLASSES[status as GedStatus] ??
    "bg-[var(--surface-strong)] text-[var(--muted-strong)]"
  );
}

/** Dias restantes até o vencimento — negativo quando já venceu. */
export function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
