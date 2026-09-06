import Link from "next/link";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
import { Card } from "@/components/ui";
import type { UserGroup } from "@/types/modules/admin";

export default async function GruposPage() {
  const { supabase, profile } = await requireSession(MANAGER_ROLES);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Grupos de Usuários</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Gerencie grupos e suas permissões no sistema
          </p>
        </div>
        {profile?.role === "super_admin" && (
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
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    {group.name}
                  </h3>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--primary-strong)]">
                    {group.members[0]?.count || 0} membros
                  </span>
                </div>

                {group.description && (
                  <p className="line-clamp-2 text-sm text-[var(--muted)]">
                    {group.description}
                  </p>
                )}

                <div className="border-t border-[var(--stroke)] pt-3">
                  <p className="text-xs text-[var(--muted)]">
                    Criado em {formatDate(group.created_at)}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {(!groups || groups.length === 0) && (
        <Card>
          <div className="text-center py-12">
            <p className="text-[var(--muted)]">Nenhum grupo cadastrado</p>
            {profile?.role === "super_admin" && (
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
