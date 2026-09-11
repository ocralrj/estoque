import { exigirPermissao } from "@/lib/permissoes";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import CategoriasClient from "./CategoriasClient";

export default async function CategoriasPage() {
  const { supabase, user, profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "categories", "read");

  return (
    <CategoriasClient />
  );
}