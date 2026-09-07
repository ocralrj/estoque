import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { listarDepartamentos } from "@/app/actions/departamentos";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const { supabase, user, profile } = await requireSession(MANAGER_ROLES);

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const dep = await listarDepartamentos(true);

  return (
    <UsersClient
      users={users ?? []}
      currentRole={profile?.role ?? ""}
      meuId={user.id}
      departamentos={dep.ok ? dep.data.map((d) => d.nome) : []}
    />
  );
}
