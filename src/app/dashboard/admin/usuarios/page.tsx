import { exigirPermissao } from "@/lib/permissoes";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { listarDepartamentos } from "@/app/actions/departamentos";
import { listarCargos } from "@/app/actions/cargos";
import { listarFuncoes } from "@/app/actions/funcoes";
import { resumirPermissoes } from "@/lib/atribuicoes";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const { supabase, user, profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "users", "read");

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const [dep, cargos, funcoes] = await Promise.all([
    listarDepartamentos(true),
    listarCargos(),
    listarFuncoes(),
  ]);

  const { data: grupos } = await supabase
    .from("user_groups")
    .select("id, name, description, nivel")
    .order("nivel");

  // As permissões de cada grupo, para a dica dizer o que o grupo concede em vez
  // de repetir o nome que já está no botão. Uma consulta só, achatada aqui: a
  // alternativa seria uma por linha da tabela.
  const { data: concessoes } = await supabase
    .from("group_permissions")
    .select("group_id, permissions(module, resource, action)");

  const chavesPorGrupo = new Map<string, string[]>();
  for (const c of concessoes ?? []) {
    const bruto = (c as { permissions?: unknown }).permissions;
    const p = (Array.isArray(bruto) ? bruto[0] : bruto) as
      | { module: string; resource: string; action: string }
      | undefined;
    if (!p) continue;
    const id = c.group_id as string;
    const atual = chavesPorGrupo.get(id) ?? [];
    atual.push(`${p.module}:${p.resource}:${p.action}`);
    chavesPorGrupo.set(id, atual);
  }

  // O nível de quem está olhando vem da função dele, e não do papel: com
  // funções cadastradas, duas pessoas do mesmo papel podem estar em degraus
  // diferentes, e é o degrau que decide quem edita quem.
  const listaFuncoes = funcoes.ok ? funcoes.data : [];
  const minhaFuncao = listaFuncoes.find((f) => f.id === profile?.funcao_id);
  const currentNivel =
    minhaFuncao?.nivel ??
    listaFuncoes.find((f) => f.sistema && f.papel_base === profile?.role)?.nivel ??
    null;

  return (
    <UsersClient
      users={users ?? []}
      currentRole={profile?.role ?? ""}
      currentEmail={user.email ?? profile?.email ?? ""}
      currentDepartamento={profile?.departamento ?? null}
      currentNivel={currentNivel}
      meuId={user.id}
      departamentos={
        dep.ok
          ? dep.data.map((d) => ({ nome: d.nome, descricao: d.descricao ?? null }))
          : []
      }
      cargos={cargos.ok ? cargos.data : []}
      funcoes={listaFuncoes}
      avisoFuncoes={funcoes.ok ? null : funcoes.message}
      grupos={(grupos ?? []).map((g) => ({
        id: g.id as string,
        nome: g.name as string,
        descricao: (g.description as string) ?? null,
        nivel: (g.nivel as number) ?? 40,
        atribuicoes: resumirPermissoes(chavesPorGrupo.get(g.id as string) ?? []),
      }))}
    />
  );
}
