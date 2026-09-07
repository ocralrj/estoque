import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
import { nomeDoNivel } from "@/lib/catalogo-permissoes";
import { Card } from "@/components/ui";
import type { UserGroup } from "@/types/modules/admin";

export default async function GruposPage({
  searchParams,
}: {
  searchParams: { salvo?: string };
}) {
  const { supabase, profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "groups", "read");

  // A contagem vem de profiles.group_id, e não de group_members: é ali que a
  // associação passou a viver, e a tabela antiga ficou vazia — todo grupo
  // aparecia com "0 membros" por isso.
  const [{ data: groups, error }, { data: pessoas }] = await Promise.all([
    supabase.from("user_groups").select("*").order("nivel").order("name"),
    supabase.from("profiles").select("group_id").eq("active", true),
  ]);

  const membrosPorGrupo = new Map<string, number>();
  for (const p of pessoas ?? []) {
    if (!p.group_id) continue;
    const id = p.group_id as string;
    membrosPorGrupo.set(id, (membrosPorGrupo.get(id) ?? 0) + 1);
  }

  if (error) {
    console.error("Error fetching groups:", error);
    throw new Error("Erro ao buscar grupos");
  }

  return (
    <div className="space-y-6">
      {/* Confirmação vinda da tela de permissões: sem ela, salvar e ser levado
          de volta pareceria que nada aconteceu. */}
      {searchParams.salvo && (
        <p className="rounded-2xl bg-[var(--ok-bg)] px-4 py-3 text-sm font-semibold text-[var(--ok-fg)]">
          {searchParams.salvo}
        </p>
      )}

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
            className="px-4 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors"
          >
            Criar Grupo
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups?.map((group: UserGroup & { nivel?: number }) => (
          <Link
            key={group.id}
            href={`/dashboard/admin/grupos/${group.id}`}
          >
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {group.name}
                    </h3>
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
                      Nível {group.nivel ?? 40} · {nomeDoNivel(group.nivel ?? 40)}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--primary-strong)]">
                    {membrosPorGrupo.get(group.id) ?? 0} membros
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
                className="inline-block mt-4 text-[var(--primary)] hover:underline"
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
