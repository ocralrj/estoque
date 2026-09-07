"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function revalidar() {
  revalidatePath("/dashboard/estoque/produtos");
  revalidatePath("/dashboard/estoque/alertas");
}

export async function definirCategoria(
  produtoId: string,
  categoriaId: string | null
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  const { error } = await supabase
    .from("products")
    .update({ category_id: categoriaId })
    .eq("id", produtoId);

  if (error) {
    console.error("Falha ao definir categoria:", error);
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }

  revalidar();
  return { ok: true, data: undefined };
}

/**
 * Muda a localização de um produto — ou de todos que dividem o mesmo lugar.
 *
 * `emTodos` existe porque o problema real não é o produto errado, é o lugar
 * escrito de três jeitos: "Armário na Sala do TI", "Armário no departamento de
 * TI" e "Armário na sala do TI" são a mesma prateleira em três linhas do
 * relatório. Corrigir de um em um é o trabalho que fez a divergência aparecer;
 * corrigir todos de uma vez é o que a resolve.
 */
export async function definirLocalizacao(
  produtoId: string,
  local: string | null,
  emTodos = false
): Promise<Resultado<{ afetados: number }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  const novo = local?.trim().slice(0, 200) || null;

  if (emTodos) {
    const { data: atual } = await supabase
      .from("products")
      .select("location")
      .eq("id", produtoId)
      .single();

    const antigo = (atual?.location as string | null)?.trim();

    if (antigo) {
      const { data, error } = await supabase
        .from("products")
        .update({ location: novo })
        .eq("location", antigo)
        .eq("active", true)
        .select("id");

      if (error) {
        console.error("Falha ao renomear localização:", error);
        return { ok: false, message: `Não foi possível salvar: ${error.message}` };
      }

      revalidar();
      return { ok: true, data: { afetados: data?.length ?? 0 } };
    }
  }

  const { error } = await supabase
    .from("products")
    .update({ location: novo })
    .eq("id", produtoId);

  if (error) {
    console.error("Falha ao definir localização:", error);
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }

  revalidar();
  return { ok: true, data: { afetados: 1 } };
}

/**
 * Muda o código do produto.
 *
 * O código é único e aparece em toda listagem — é por ele que se procura o
 * item na prateleira. Trocá-lo não mexe no histórico: as movimentações
 * apontam para o id, não para o código, então o passado continua correto.
 */
export async function definirCodigo(
  produtoId: string,
  codigo: string
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  const novo = codigo.trim().toUpperCase().slice(0, 40);
  if (novo.length < 2) {
    return { ok: false, message: "O código deve ter ao menos 2 caracteres." };
  }

  const { error } = await supabase
    .from("products")
    .update({ code: novo })
    .eq("id", produtoId);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `Já existe um produto com o código ${novo}.` };
    }
    console.error("Falha ao definir código:", error);
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }

  revalidar();
  return { ok: true, data: undefined };
}
