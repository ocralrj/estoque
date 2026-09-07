import { exigirPermissao } from "@/lib/permissoes";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { listarDepartamentos } from "@/app/actions/departamentos";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const { supabase, user, profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "users", "read");

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const dep = await listarDepartamentos(true);

  const { data: grupos } = await supabase
    .from("user_groups")
    .select("id, name, nivel")
    .order("nivel");

  return (
    <UsersClient
      users={users ?? []}
      currentRole={profile?.role ?? ""}
      meuId={user.id}
      departamentos={dep.ok ? dep.data.map((d) => d.nome) : []}
      grupos={(grupos ?? []).map((g) => ({
        id: g.id as string,
        nome: g.name as string,
        nivel: (g.nivel as number) ?? 40,
      }))}
    />
  );
}
