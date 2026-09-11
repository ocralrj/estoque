import { exigirPermissao } from "@/lib/permissoes";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import LocalizacoesClient from "./LocalizacoesClient";

export default async function LocalizacoesPage() {
  const { supabase, user, profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "locations", "read");

  return (
    <LocalizacoesClient />
  );
}