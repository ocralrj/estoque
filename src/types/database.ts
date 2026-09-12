export type UserRole = 'super_admin' | 'gestor' | 'almoxarife' | 'requisitante';

/**
 * Situação da conta.
 *
 * "ferias" não bloqueia o acesso de propósito: é entrando que a pessoa dispara
 * o próprio retorno, quando a data prevista já passou.
 */
export type StatusUsuario = 'ativo' | 'ferias' | 'inativo';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url?: string | null;
  role: UserRole;
  /** Departamento a que pertence — define o que vê no GED. */
  departamento?: string | null;
  /** Grupo principal: define o nível hierárquico e as permissões. */
  group_id?: string | null;
  /** Cargo: o que a pessoa faz. Não concede acesso — isso é o grupo. */
  cargo_id?: string | null;
  /** Função: onde a pessoa está na hierarquia. Projeta o papel por gatilho. */
  funcao_id?: string | null;
  /** true enquanto a senha provisória não for trocada. */
  must_change_password?: boolean;
  /** Situação da conta. `active` é derivado daqui por gatilho no banco. */
  status?: StatusUsuario;
  /** Volta prevista, obrigatória enquanto o status for "ferias". */
  retorno_previsto?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  category?: Category | null;
  unit: string;
  quantity_current: number;
  quantity_minimum: number;
  location: string | null;
  active: boolean;
  is_low_stock: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type MovementType = 'entrada' | 'saida';

export interface Movement {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  reason: string;
  notes: string | null;
  previous_quantity: number;
  new_quantity: number;
  created_by: string;
  created_at: string;
  product?: Product;
}

export type ProtocolStatus = "aberto" | "em_andamento" | "concluido" | "cancelado";
export type ProtocolPriority = "baixa" | "media" | "alta";

export interface Protocol {
  id: string;
  nup: string;
  title: string;
  description: string | null;
  priority: ProtocolPriority;
  status: ProtocolStatus;
  requester_id: string;
  assigned_to_id?: string | null;
  assigned_to?: Pick<Profile, "id" | "full_name" | "email"> | null;
  created_at: string;
  updated_at: string;
  requester?: Pick<Profile, "id" | "full_name" | "email"> | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  is_read: boolean;
  /** Rota que o clique abre, quando há para onde ir. */
  link?: string | null;
  /** Permissão exigida pelo destino, como "modulo:recurso:acao". */
  permissao?: string | null;
  /** Quem originou o aviso — é para essa pessoa que a resposta volta. */
  origem_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportStats {
  totalMovements: number;
  totalEntradas: number;
  totalSaidas: number;
  volumeEntrada: number;
  volumeSaida: number;
}

export interface ProductMovementStats {
  product: Product | null;
  entradas: number;
  saidas: number;
  totalMovements: number;
}

export interface CategoryStats {
  name: string;
  count: number;
}
