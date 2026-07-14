export type UserRole = "super_admin" | "gestor" | "almoxarife" | "requisitante";

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
}

export interface Movement {
  id: string;
  product_id: string;
  type: "entrada" | "saida";
  quantity: number;
  reason: string;
  notes: string | null;
  previous_quantity: number;
  new_quantity: number;
  created_by: string;
  created_at: string;
}

export interface ProductWithCategory extends Product {
  category?: Category | null;
}

export interface MovementWithDetails extends Movement {
  product?: Pick<Product, "name" | "code" | "unit"> | null;
  user?: Pick<Profile, "full_name" | "email"> | null;
}
