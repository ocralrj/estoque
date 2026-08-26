import type { Movement, Product, Profile } from "./database";

export * from "./database";

export type MovementType = "entrada" | "saida";

export type MovementWithDetails = Omit<Movement, "product"> & {
  product?: Pick<Product, "name" | "code" | "unit"> | null;
  user?: Pick<Profile, "full_name" | "email"> | null;
};
