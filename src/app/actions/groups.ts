"use server";

import { exigir, sessaoAutorizada, chave, type Acao } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

/**
 * Guarda das ações de grupo.
 *
 * Antes era um teste fixo de super_admin. Agora pergunta ao mesmo lugar que a
 * tela pergunta: quem decide é a permissão do grupo de quem chama, não um papel
 * escrito aqui dentro. É o que impede a tela e a ação de divergirem.
 */
async function autorizar(modulo: string, recurso: string, acao: Acao) {
  const { supabase, user } = await getSession();
  if (!user) throw new Error("Não autenticado");

  const permitido = await exigir(modulo, recurso, acao);
  if (!permitido.ok) throw new Error(permitido.message);

  return { supabase, user };
}

/**
 * Ninguém concede o que não tem, nem mexe em grupo acima do seu.
 *
 * São as duas travas contra escalada. Sem a primeira, um gestor montaria um
 * grupo com permissões de administrador e entraria nele. Sem a segunda,
 * editaria o próprio grupo de administradores por cima.
 */
async function validarEscalada(
  groupId: string,
  permissionIds: string[]
): Promise<string | null> {
  const { supabase } = await getSession();

  const [{ data: meuNivel }, { data: grupo }, { permissoes }] = await Promise.all([
    supabase.rpc("meu_nivel"),
    supabase.from("user_groups").select("nivel, name").eq("id", groupId).single(),
    sessaoAutorizada(),
  ]);

  const nivelChamador = typeof meuNivel === "number" ? meuNivel : 99;
  const nivelAlvo = (grupo?.nivel as number | undefined) ?? 99;

  if (nivelAlvo < nivelChamador) {
    return `O grupo "${grupo?.name ?? ""}" está acima do seu na hierarquia.`;
  }

  if (permissionIds.length === 0) return null;

  const { data: alvos } = await supabase
    .from("permissions")
    .select("module, resource, action")
    .in("id", permissionIds);

  const semRespaldo = (alvos ?? []).find(
    (p) => !permissoes.has(chave(p.module as string, p.resource as string, p.action as string))
  );

  if (semRespaldo) {
    return `Você não pode conceder "${semRespaldo.module} / ${semRespaldo.resource} / ${semRespaldo.action}", porque não a possui.`;
  }

  return null;
}

export async function createGroup(formData: FormData) {
  const { supabase, user } = await autorizar("admin", "groups", "create");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) throw new Error("Nome do grupo é obrigatório");

  const { error } = await supabase.from("user_groups").insert({
    name: name.slice(0, 120),
    description: description || null,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/grupos");
}

export async function updateGroup(groupId: string, formData: FormData) {
  const { supabase } = await autorizar("admin", "groups", "update");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) throw new Error("Nome do grupo é obrigatório");

  const { error } = await supabase
    .from("user_groups")
    .update({
      name: name.slice(0, 120),
      description: description || null,
    })
    .eq("id", groupId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/grupos");
  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function deleteGroup(groupId: string) {
  const { supabase } = await autorizar("admin", "groups", "delete");

  const { error } = await supabase.from("user_groups").delete().eq("id", groupId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/grupos");
}

export async function addGroupMember(groupId: string, userId: string) {
  const { supabase, user } = await autorizar("admin", "groups", "update");

  if (!userId) throw new Error("Selecione um usuário");

  const { error } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    added_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function removeGroupMember(groupId: string, userId: string) {
  const { supabase } = await autorizar("admin", "groups", "update");

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function addGroupPermission(groupId: string, permissionId: string) {
  const { supabase, user } = await autorizar("admin", "permissions", "manage");

  const { error } = await supabase.from("group_permissions").insert({
    group_id: groupId,
    permission_id: permissionId,
    granted_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function removeGroupPermission(groupId: string, permissionId: string) {
  const { supabase } = await autorizar("admin", "permissions", "manage");

  const { error } = await supabase
    .from("group_permissions")
    .delete()
    .eq("group_id", groupId)
    .eq("permission_id", permissionId);

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}


/**
 * Define de uma vez todas as permissões do grupo.
 *
 * Substitui o conjunto inteiro em vez de conceder e revogar uma a uma: a tela
 * é uma matriz onde a pessoa marca dezenas de caixas e salva, e trinta idas ao
 * servidor deixariam o grupo em estado intermediário se uma delas falhasse.
 */
export async function definirPermissoesDoGrupo(
  groupId: string,
  permissionIds: string[]
): Promise<{ ok: true; total: number } | { ok: false; message: string }> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "permissions", "manage");
  if (!permitido.ok) return permitido;

  const impedimento = await validarEscalada(groupId, permissionIds);
  if (impedimento) return { ok: false, message: impedimento };

  const { error: erroLimpeza } = await supabase
    .from("group_permissions")
    .delete()
    .eq("group_id", groupId);

  if (erroLimpeza) {
    return { ok: false, message: "Não foi possível atualizar as permissões." };
  }

  if (permissionIds.length > 0) {
    const { error } = await supabase.from("group_permissions").insert(
      permissionIds.map((permission_id) => ({
        group_id: groupId,
        permission_id,
        granted_by: user.id,
      }))
    );

    if (error) {
      return { ok: false, message: "Não foi possível gravar as permissões." };
    }
  }

  revalidatePath("/dashboard/admin/grupos");
  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
  revalidatePath("/dashboard");
  return { ok: true, total: permissionIds.length };
}

/**
 * Muda o nível hierárquico do grupo.
 *
 * O nível decide o papel projetado de quem está no grupo, então mexer aqui
 * altera o acesso de todo mundo que pertence a ele — inclusive no banco, via
 * RLS. Por isso não se pode elevar um grupo acima de quem o edita.
 */
export async function definirNivelDoGrupo(
  groupId: string,
  nivel: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "groups", "update");
  if (!permitido.ok) return permitido;

  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 99) {
    return { ok: false, message: "O nível deve ser um número entre 1 e 99." };
  }

  const { data: meuNivel } = await supabase.rpc("meu_nivel");
  const nivelChamador = typeof meuNivel === "number" ? meuNivel : 99;

  if (nivel < nivelChamador) {
    return {
      ok: false,
      message: "Você não pode colocar um grupo acima do seu próprio nível.",
    };
  }

  const impedimento = await validarEscalada(groupId, []);
  if (impedimento) return { ok: false, message: impedimento };

  const { error } = await supabase
    .from("user_groups")
    .update({ nivel })
    .eq("id", groupId);

  if (error) {
    // O gatilho da migração 014 recusa mexer no nível dos grupos base.
    return {
      ok: false,
      message: error.message.includes("ancora")
        ? "Este grupo sustenta a hierarquia e tem nível fixo."
        : "Não foi possível alterar o nível.",
    };
  }

  revalidatePath("/dashboard/admin/grupos");
  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
  return { ok: true };
}
