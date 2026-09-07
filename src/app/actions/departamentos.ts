"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
import type { Departamento, MembroDepartamento } from "@/types/modules/admin";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };


function revalidar() {
  revalidatePath("/dashboard/admin/departamentos");
  revalidatePath("/dashboard/ged/documentos");
  revalidatePath("/dashboard/ged/pastas");
}

function validarNome(nome: string): string | null {
  const n = nome.trim();
  if (!n) return "Informe o nome do departamento.";
  if (n.length < 2) return "O nome deve ter ao menos 2 caracteres.";
  if (n.length > 60) return "O nome deve ter no máximo 60 caracteres.";
  return null;
}

export async function listarDepartamentos(
  somenteAtivos = false
): Promise<ActionResult<Departamento[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  let query = supabase.from("departamentos").select("*").order("nome");
  if (somenteAtivos) query = query.eq("ativo", true);

  const { data, error } = await query;

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        ok: false,
        message:
          "A tabela de departamentos ainda não existe. Execute supabase/_manual_apply/009_departamentos.sql.",
      };
    }
    return { ok: false, message: "Não foi possível carregar os departamentos." };
  }
  return { ok: true, data: (data ?? []) as Departamento[] };
}

export async function criarDepartamento(
  nome: string,
  descricao?: string
): Promise<ActionResult<Departamento>> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "departamentos", "create");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const erro = validarNome(nome);
  if (erro) return { ok: false, message: erro };

  const { data, error } = await supabase
    .from("departamentos")
    .insert({
      nome: nome.trim().slice(0, 60),
      descricao: descricao?.trim().slice(0, 300) || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe um departamento com esse nome." };
    }
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        ok: false,
        message:
          "A tabela de departamentos ainda não existe. Execute supabase/_manual_apply/009_departamentos.sql.",
      };
    }
    return { ok: false, message: "Não foi possível criar o departamento." };
  }

  revalidar();
  return { ok: true, data: data as Departamento };
}

/**
 * Renomeia e, opcionalmente, atualiza os registros que já usam o nome antigo.
 *
 * O nome fica gravado como texto nos documentos: sem a cascata, o histórico
 * continua apontando para o nome anterior. Nem sempre isso é indesejado — um
 * departamento extinto pode ter de continuar nomeado nos documentos da época —
 * por isso a escolha é de quem renomeia, e não automática.
 */
export async function atualizarDepartamento(
  id: string,
  nome: string,
  descricao: string | undefined,
  ativo: boolean,
  propagarNome: boolean,
  gestorId?: string | null
): Promise<ActionResult<{ registrosAtualizados: number }>> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "departamentos", "update");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const erro = validarNome(nome);
  if (erro) return { ok: false, message: erro };

  const { data: atual } = await supabase
    .from("departamentos")
    .select("nome")
    .eq("id", id)
    .single();

  const nomeNovo = nome.trim().slice(0, 60);
  const nomeAntigo = (atual?.nome as string) ?? "";

  const { error } = await supabase
    .from("departamentos")
    .update({
      nome: nomeNovo,
      descricao: descricao?.trim().slice(0, 300) || null,
      ativo,
      // `undefined` não é mudança: quem chamar sem informar o gestor mantém o
      // que está lá, em vez de apagá-lo sem querer.
      ...(gestorId !== undefined ? { gestor_id: gestorId || null } : {}),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe um departamento com esse nome." };
    }
    return { ok: false, message: "Não foi possível atualizar o departamento." };
  }

  let registrosAtualizados = 0;
  if (propagarNome && nomeAntigo && nomeAntigo !== nomeNovo) {
    const { data: total } = await supabase.rpc("renomear_departamento", {
      antigo: nomeAntigo,
      novo: nomeNovo,
    });
    registrosAtualizados = typeof total === "number" ? total : 0;
  }

  revalidar();
  return { ok: true, data: { registrosAtualizados } };
}

export async function excluirDepartamento(id: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "departamentos", "delete");
  if (!permitido.ok) return permitido;

  if (profile?.role !== "super_admin") {
    return { ok: false, message: "Apenas o administrador pode excluir departamentos." };
  }

  const { data: dep } = await supabase
    .from("departamentos")
    .select("nome")
    .eq("id", id)
    .single();

  // Excluir o catálogo não apaga o nome já gravado nos documentos — eles
  // ficariam apontando para um departamento que sumiu da lista. Melhor barrar e
  // sugerir desativar, que tira das opções sem mexer no histórico.
  if (dep?.nome) {
    const { count } = await supabase
      .from("ged_documents")
      .select("id", { count: "exact", head: true })
      .eq("setor", dep.nome);

    if (count && count > 0) {
      return {
        ok: false,
        message: `Este departamento é usado por ${count} documento(s). Desative-o em vez de excluir, para não deixar o histórico órfão.`,
      };
    }
  }

  const { error } = await supabase.from("departamentos").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir o departamento." };

  revalidar();
  return { ok: true, data: undefined };
}

/**
 * Quem trabalha em cada departamento.
 *
 * Devolvido agrupado pelo nome do departamento, que é como o vínculo existe:
 * `profiles.departamento` guarda o nome, não a chave — foi assim que a
 * visibilidade do GED foi montada, para que o histórico continue correto quando
 * alguém muda de área.
 *
 * Só a gestão chama isto, e é a gestão que já enxerga todos os perfis pelo RLS.
 */
export async function listarMembrosPorDepartamento(): Promise<
  ActionResult<Record<string, MembroDepartamento[]>>
> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "read");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, avatar_url, role, active, status, departamento, cargo:cargos(nome)"
    )
    .eq("active", true)
    .order("full_name", { nullsFirst: false });

  if (error) {
    return { ok: false, message: "Não foi possível carregar as pessoas." };
  }

  const paraMembro = (linha: Record<string, unknown>): MembroDepartamento => ({
    id: linha.id as string,
    nome: (linha.full_name as string | null) ?? (linha.email as string),
    email: linha.email as string,
    avatar_url: (linha.avatar_url as string | null) ?? null,
    role: linha.role as string,
    ativo: linha.active !== false,
    cargo:
      ((linha.cargo as { nome?: string } | null)?.nome as string | undefined) ??
      null,
    departamentoAtual: (linha.departamento as string | null) ?? null,
  });

  const porDepartamento: Record<string, MembroDepartamento[]> = {};
  // A chave "" guarda quem ainda não está em departamento nenhum: é de lá que
  // vem a maior parte de quem precisa ser acrescentado a um.
  porDepartamento[""] = [];

  for (const linha of data ?? []) {
    const membro = paraMembro(linha);
    const dep = membro.departamentoAtual?.trim() || "";
    (porDepartamento[dep] ??= []).push(membro);
  }

  return { ok: true, data: porDepartamento };
}
