export type UserRole = 'super_admin' | 'gestor' | 'almoxarife' | 'requisitante';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
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
  unit: string;
  quantity_current: number;
  quantity_minimum: number;
  location: string | null;
  active: boolean;
  is_low_stock: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  category?: Category;
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
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  requester?: Pick<Profile, "id" | "full_name" | "email"> | null;
  assigned_to?: Pick<Profile, "id" | "full_name" | "email"> | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  is_read: boolean;
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

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
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
