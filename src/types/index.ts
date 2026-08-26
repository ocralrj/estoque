export * from "./database";

export type MovementType = "entrada" | "saida";

export interface MovementWithDetails extends Movement {
  product?: Pick<Product, "name" | "code" | "unit"> | null;
  user?: Pick<Profile, "full_name" | "email"> | null;
}
