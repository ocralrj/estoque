import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { addGroupMember, removeGroupMember, addGroupPermission, removeGroupPermission, deleteGroup } from "@/app/actions/groups";

export default async function GrupoDetalhesPage({ params }: { params: { id: string } }) {
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

  const { data: group, error } = await supabase
    .from("user_groups")
    .select(`
      *,
      members:group_members(
        user_id,
        added_at,
        profile:profiles(id, email, full_name, role)
      ),
      permissions:group_permissions(
        permission_id,
        granted_at,
        permission:permissions(*)
      )
    `)
    .eq("id", params.id)
    .single();

  if (error || !group) {
    redirect("/dashboard/admin/grupos");
  }

  const { data: allUsers } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("active", true)
    .order("email");

  const { data: allPermissions } = await supabase
    .from("permissions")
    .select("*")
    .order("module", { ascending: true })
    .order("resource", { ascending: true })
    .order("action", { ascending: true });

  const memberIds = new Set(group.members.map((m: any) => m.user_id));
  const permissionIds = new Set(group.permissions.map((p: any) => p.permission_id));

  const availableUsers = allUsers?.filter(u => !memberIds.has(u.id)) || [];
  const availablePermissions = allPermissions?.filter(p => !permissionIds.has(p.id)) || [];

  const groupedPermissions = allPermissions?.reduce((acc: any, perm: any) => {
    if (!acc[perm.module]) acc[perm.module] = {};
    if (!acc[perm.module][perm.resource]) acc[perm.module][perm.resource] = [];
    acc[perm.module][perm.resource].push(perm);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/admin/grupos"
            className="text-sm text-primary-600 hover:text-primary-700 mb-2 inline-block"
          >
            ← Voltar para grupos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-gray-600 mt-1">{group.description}</p>
          )}
        </div>
        {profile.role === "super_admin" && (
          <div className="flex gap-2">
            <Link
              href={`/dashboard/admin/grupos/${params.id}/editar`}
              className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Editar
            </Link>
            <form action={deleteGroup.bind(null, params.id)}>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                onClick={(e) => {
                  if (!confirm("Tem certeza que deseja excluir este grupo?")) {
                    e.preventDefault();
                  }
                }}
              >
                Excluir
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Membros" subtitle={`${group.members.length} usuários neste grupo`}>
          <div className="space-y-3">
            {group.members.map((member: any) => (
              <div key={member.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{member.profile.full_name || member.profile.email}</p>
                  <p className="text-sm text-gray-600">{member.profile.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Role: {member.profile.role}
                  </p>
                </div>
                {profile.role === "super_admin" && (
                  <form action={removeGroupMember.bind(null, params.id, member.user_id)}>
                    <button
                      type="submit"
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remover
                    </button>
                  </form>
                )}
              </div>
            ))}

            {profile.role === "super_admin" && availableUsers.length > 0 && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Adicionar membro:</p>
                <form action={async (formData: FormData) => {
                  "use server";
                  const userId = formData.get("userId") as string;
                  await addGroupMember(params.id, userId);
                }} className="flex gap-2">
                  <select
                    name="userId"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    required
                  >
                    <option value="">Selecione um usuário</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name || user.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                  >
                    Adicionar
                  </button>
                </form>
              </div>
            )}
          </div>
        </Card>

        <Card title="Permissões" subtitle={`${group.permissions.length} permissões atribuídas`}>
          <div className="space-y-4">
            {Object.entries(groupedPermissions || {}).map(([module, resources]: [string, any]) => (
              <div key={module}>
                <h4 className="font-medium text-gray-900 mb-2 capitalize">{module}</h4>
                {Object.entries(resources).map(([resource, perms]: [string, any]) => (
                  <div key={resource} className="ml-4 mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">{resource}</p>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((perm: any) => {
                        const hasPermission = permissionIds.has(perm.id);
                        return (
                          <form
                            key={perm.id}
                            action={hasPermission
                              ? removeGroupPermission.bind(null, params.id, perm.id)
                              : addGroupPermission.bind(null, params.id, perm.id)
                            }
                          >
                            <button
                              type="submit"
                              disabled={profile.role !== "super_admin"}
                              className={`px-2 py-1 text-xs rounded ${
                                hasPermission
                                  ? "bg-primary-100 text-primary-800"
                                  : "bg-gray-100 text-gray-600"
                              } ${profile.role === "super_admin" ? "hover:opacity-75 cursor-pointer" : "cursor-default"}`}
                            >
                              {perm.action} {hasPermission && "✓"}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
