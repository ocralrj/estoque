"use server";

import { exigir, sessaoAutorizada, chave, type Acao } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

/**
 * Guarda das ações de localização.
 */
async function autorizar(modulo: string, recurso: string, acao: Acao) {
  const { supabase, user } = await getSession();
  if (!user) throw new Error("Não autenticado");

  const permitido = await exigir(modulo, recurso, acao);
  if (!permitido.ok) throw new Error(permitido.message);

  return { supabase, user };
}

export async function listarLocalizacoes() {
  const { supabase } = await getSession();
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .order("name");

  if (error) throw error;
  return data;
}

export async function criarLocalizacao(formData: FormData) {
  const { supabase, user } = await autorizar("admin", "locations", "create");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) throw new Error("Nome da localização é obrigatório");

  const { error } = await supabase.from("locations").insert({
    name: name.slice(0, 120),
    description: description || null,
    created_by: user.id,
  });

  if (error) throw error;

  revalidatePath("/dashboard/admin/localizacoes");
}

export async function atualizarLocalizacao(id: string, formData: FormData) {
  const { supabase, user } = await autorizar("admin", "locations", "update");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) throw new Error("Nome da localização é obrigatório");

  const { error } = await supabase
    .from("locations")
    .update({
      name: name.slice(0, 120),
      description: description || null,
    })
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/dashboard/admin/localizacoes");
}

export async function excluirLocalizacao(id: string) {
  const { supabase, user } = await autorizar("admin", "locations", "delete");

  const { error } = await supabase.from("locations").delete().eq("id", id);

  if (error) throw error;

  revalidatePath("/dashboard/admin/localizacoes");
}