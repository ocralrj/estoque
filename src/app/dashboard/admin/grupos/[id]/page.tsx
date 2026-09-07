import { exigirPermissao } from "@/lib/permissoes";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { Card, ConfirmSubmitButton } from "@/components/ui";
import { deleteGroup } from "@/app/actions/groups";
import { pode } from "@/lib/permissoes";
import { nomeDoNivel } from "@/lib/catalogo-permissoes";
import MatrizDePermissoes from "./MatrizDePermissoes";
import NivelDoGrupo from "./NivelDoGrupo";
import MembrosDoGrupo from "./MembrosDoGrupo";

export default async function GrupoDetalhesPage({ params }: { params: { id: string } }) {
  const { supabase, profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "groups", "read");

  const podeEditarGrupo = await pode("admin", "groups", "update");
  const podeConcederPermissoes = await pode("admin", "permissions", "manage");
  const podeExcluirGrupo = await pode("admin", "groups", "delete");
  const podeGerenciarPessoas = await pode("admin", "users", "manage");

  const { data: group, error } = await supabase
    .from("user_groups")
    .select(`
      *,
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

  // A associação é profiles.group_id, e não group_members: um grupo por
  // pessoa, porque "qual é o nível desta pessoa" precisa de resposta única.
  const [{ data: todos }, { data: grupos }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, role, group_id")
      .eq("active", true)
      .order("full_name", { nullsFirst: false }),
    supabase.from("user_groups").select("id, name"),
  ]);

  const nomePorGrupo = new Map(
    (grupos ?? []).map((g) => [g.id as string, g.name as string])
  );

  const paraPessoa = (u: Record<string, unknown>) => ({
    id: u.id as string,
    full_name: (u.full_name as string | null) ?? null,
    email: u.email as string,
    avatar_url: (u.avatar_url as string | null) ?? null,
    role: u.role as string,
    grupoAtual: u.group_id ? nomePorGrupo.get(u.group_id as string) ?? null : null,
  });

  const membros = (todos ?? [])
    .filter((u) => u.group_id === params.id)
    .map(paraPessoa);

  const candidatos = (todos ?? [])
    .filter((u) => u.group_id !== params.id)
    .map(paraPessoa);

  const { data: allPermissions } = await supabase
    .from("permissions")
    .select("*")
    .order("module", { ascending: true })
    .order("resource", { ascending: true })
    .order("action", { ascending: true });

  const permissionIds = new Set(group.permissions.map((p: any) => p.permission_id));


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
            className="text-sm text-[var(--primary)] hover:underline mb-2 inline-block"
          >
            ← Voltar para grupos
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text)]">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-[var(--text-muted)] mt-1">{group.description}</p>
          )}
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
            Nível {(group.nivel as number) ?? 40} · {nomeDoNivel((group.nivel as number) ?? 40)}
          </p>
        </div>
        {podeExcluirGrupo && (
          <div className="flex gap-2">
            <Link
              href={`/dashboard/admin/grupos/${params.id}/editar`}
              className="px-4 py-2 bg-[var(--neo-flat-alt)] text-[var(--text)] rounded-lg hover:brightness-95 transition-colors"
            >
              Editar
            </Link>
            <form action={deleteGroup.bind(null, params.id)}>
              <ConfirmSubmitButton
                message="Tem certeza que deseja excluir este grupo?"
                className="px-4 py-2 bg-[var(--erro-solid)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors"
              >
                Excluir
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      <MembrosDoGrupo
        grupoId={params.id}
        nomeDoGrupo={group.name as string}
        membros={membros}
        candidatos={candidatos}
        podeEditar={podeGerenciarPessoas}
      />

      <NivelDoGrupo
        grupoId={params.id}
        nivelAtual={(group.nivel as number) ?? 40}
        fixo={Boolean(group.sistema)}
        podeEditar={podeEditarGrupo}
        quantidadeDeMembros={group.members.length}
      />

      <MatrizDePermissoes
        grupoId={params.id}
        catalogo={(allPermissions ?? []) as never}
        concedidas={group.permissions.map((p: any) => p.permission_id)}
        podeEditar={podeConcederPermissoes}
      />
    </div>
  );
}
