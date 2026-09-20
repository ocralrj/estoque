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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cliente = Awaited<ReturnType<typeof getSession>>["supabase"];

/**
 * A categoria ou localização existe e está ativa?
 *
 * Devolve a mensagem de recusa, ou null. O gatilho `products_cadastro_ativo`
 * (migração 043) recusa do mesmo jeito; conferir antes dá uma mensagem que
 * diz o que fazer, em vez do erro cru do banco.
 */
async function recusaDeCadastro(
  supabase: Cliente,
  tabela: "categories" | "locations",
  id: string
): Promise<string | null> {
  const nome = tabela === "categories" ? "categoria" : "localização";
  const tela = tabela === "categories" ? "Categorias" : "Localizações";

  if (!UUID.test(id)) return `Escolha uma ${nome} da lista.`;

  const { data, error } = await supabase
    .from(tabela)
    .select("active")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Falha ao conferir %s:", nome, error);
    return `Não foi possível conferir a ${nome}: ${error.message}`;
  }
  if (!data) return `A ${nome} escolhida não existe mais.`;
  if (data.active === false) {
    return `A ${nome} escolhida está inativa. Escolha outra ou reative-a em Estoque → ${tela}.`;
  }
  return null;
}

export async function definirCategoria(
  produtoId: string,
  categoriaId: string | null
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  if (categoriaId) {
    const recusa = await recusaDeCadastro(supabase, "categories", categoriaId);
    if (recusa) return { ok: false, message: recusa };
  }

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
 * Muda a localização de um produto — ou de todos que estão no mesmo lugar.
 *
 * Recebe o id de uma localização cadastrada e ativa. Não cria localização a
 * partir de texto: era esse caminho que produzia "Armário na Sala do TI" e
 * "Armário na sala do TI" como dois lugares. Localização nova se cadastra em
 * Estoque → Localizações.
 */
export async function definirLocalizacao(
  produtoId: string,
  localId: string | null,
  emTodos = false
): Promise<Resultado<{ afetados: number }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  const novo = localId || null;
  if (novo) {
    const recusa = await recusaDeCadastro(supabase, "locations", novo);
    if (recusa) return { ok: false, message: recusa };
  }

  if (emTodos) {
    const { data: atual, error: erroAtual } = await supabase
      .from("products")
      .select("location")
      .eq("id", produtoId)
      .single();

    if (erroAtual) {
      console.error("Falha ao ler localização atual:", erroAtual);
      return { ok: false, message: `Não foi possível salvar: ${erroAtual.message}` };
    }

    const antigo = atual?.location as string | null;

    if (antigo) {
      const { data, error } = await supabase
        .from("products")
        .update({ location: novo })
        .eq("location", antigo)
        .eq("active", true)
        .select("id");

      if (error) {
        console.error("Falha ao mudar localização em lote:", error);
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

// Não existe ação para trocar o código: ele é gerado pelo banco no cadastro
// (gatilho `products_gerar_codigo`) e o gatilho `products_codigo_imutavel`
// recusa qualquer alteração. Ver 042_codigo_e_listagem_de_produtos.sql.

/**
 * Troca o nome do produto. Só o nome: código é imutável, e categoria e
 * localização têm ações próprias na linha.
 */
export async function renomearProduto(
  produtoId: string,
  nome: string
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  const novo = nome.trim().slice(0, 120);
  if (!novo) return { ok: false, message: "Dê um nome para o produto." };

  const { error } = await supabase
    .from("products")
    .update({ name: novo })
    .eq("id", produtoId);

  if (error) {
    console.error("Falha ao renomear produto:", error);
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }

  revalidar();
  return { ok: true, data: undefined };
}

/**
 * Exclui o produto — ou o desativa, quando já tem movimentação.
 *
 * Apagar de verdade um produto com entrada/saída levaria o histórico junto
 * (a chave de `movements` é em cascata). O que resolve o caso real — "não
 * usamos mais isto" — é tirar da lista mantendo o rastro: `active = false`
 * some da listagem (que só mostra ativos) sem apagar as movimentações.
 */
export async function excluirProduto(
  produtoId: string
): Promise<Resultado<{ desativado: boolean }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "delete");
  if (!permitido.ok) return permitido;

  const { count, error: erroContagem } = await supabase
    .from("movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", produtoId);

  if (erroContagem) {
    console.error("Falha ao conferir movimentações:", erroContagem);
    return { ok: false, message: `Não foi possível excluir: ${erroContagem.message}` };
  }

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", produtoId);

    if (error) {
      console.error("Falha ao desativar produto:", error);
      return { ok: false, message: `Não foi possível desativar: ${error.message}` };
    }

    revalidar();
    return { ok: true, data: { desativado: true } };
  }

  const { error } = await supabase.from("products").delete().eq("id", produtoId);

  if (error) {
    console.error("Falha ao excluir produto:", error);
    return { ok: false, message: `Não foi possível excluir: ${error.message}` };
  }

  revalidar();
  return { ok: true, data: { desativado: false } };
}
