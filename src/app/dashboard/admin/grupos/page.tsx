import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";
import type { UserGroup } from "@/types/modules/admin";

export default async function GruposPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "gestor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const { data: groups, error } = await supabase
    .from("user_groups")
    .select(`
      *,
      members:group_members(count)
    `)
    .order("name");

  if (error) {
    console.error("Error fetching groups:", error);
    throw new Error("Erro ao buscar grupos");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grupos de Usuários</h1>
          <p className="text-sm text-gray-600 mt-1">
            Gerencie grupos e suas permissões no sistema
          </p>
        </div>
        {profile.role === "super_admin" && (
          <Link
            href="/dashboard/admin/grupos/novo"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Criar Grupo
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups?.map((group: UserGroup & { members: { count: number }[] }) => (
          <Link
            key={group.id}
            href={`/dashboard/admin/grupos/${group.id}`}
          >
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {group.name}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                    {group.members[0]?.count || 0} membros
                  </span>
                </div>

                {group.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {group.description}
                  </p>
                )}

                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Criado em {new Date(group.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {!groups || groups.length === 0 && (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhum grupo cadastrado</p>
            {profile.role === "super_admin" && (
              <Link
                href="/dashboard/admin/grupos/novo"
                className="inline-block mt-4 text-primary-600 hover:text-primary-700"
              >
                Criar primeiro grupo
              </Link>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
