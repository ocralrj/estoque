"use server";

import { exigir, sessaoAutorizada, chave, type Acao } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

/**
 * Guarda das ações de categoria.
 */
async function autorizar(modulo: string, recurso: string, acao: Acao) {
  const { supabase, user } = await getSession();
  if (!user) throw new Error("Não autenticado");

  const permitido = await exigir(modulo, recurso, acao);
  if (!permitido.ok) throw new Error(permitido.message);

  return { supabase, user };
}

export async function listarCategorias() {
  const { supabase } = await getSession();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name");

  if (error) throw error;
  return data;
}

export async function criarCategoria(formData: FormData) {
  const { supabase, user } = await autorizar("admin", "categories", "create");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) throw new Error("Nome da categoria é obrigatório");

  const { error } = await supabase.from("categories").insert({
    name: name.slice(0, 120),
    description: description || null,
    created_by: user.id,
  });

  if (error) throw error;

  revalidatePath("/dashboard/admin/categorias");
}

export async function atualizarCategoria(id: string, formData: FormData) {
  const { supabase, user } = await autorizar("admin", "categories", "update");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!name) throw new Error("Nome da categoria é obrigatório");

  const { error } = await supabase
    .from("categories")
    .update({
      name: name.slice(0, 120),
      description: description || null,
    })
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/dashboard/admin/categorias");
}

export async function excluirCategoria(id: string) {
  const { supabase, user } = await autorizar("admin", "categories", "delete");

  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) throw error;

  revalidatePath("/dashboard/admin/categorias");
}