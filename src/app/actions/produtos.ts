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
 * Resumo do produto para a busca do pedido: o suficiente para identificar.
 */
export interface ProdutoResumo {
  id: string;
  name: string;
  code: string;
  unit: string;
  quantity_current: number;
}

/**
 * Busca produtos pelo nome para o autocomplete do pedido.
 *
 * Parcial e sem diferenciar maiúsculas (`ilike`), limitada a 10 linhas: a
 * lista completa não viaja para o navegador, e cada tecla dispara no máximo
 * uma consulta (o campo usa debounce). `%` e `_` digitados valem como letra.
 */
export async function buscarProdutos(termo: string): Promise<Resultado<ProdutoResumo[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "read");
  if (!permitido.ok) return permitido;

  const texto = termo.trim().slice(0, 60);
  if (!texto) return { ok: true, data: [] };

  const LIKE = texto.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

  const { data, error } = await supabase
    .from("products")
    .select("id, name, code, unit, quantity_current")
    .eq("active", true)
    .ilike("name", `%${LIKE}%`)
    .order("name")
    .limit(10);

  if (error) {
    console.error("Falha ao buscar produtos:", error);
    return { ok: false, message: "Não foi possível buscar os produtos." };
  }

  return { ok: true, data: (data ?? []) as ProdutoResumo[] };
}

/**
 * Atualiza o cadastro completo do produto (tela "Alterar Produto").
 *
 * Nunca toca em `code` (imutável pelo gatilho da 042) nem em
 * `quantity_current` (dono é o gatilho de movimentação — a quantidade muda por
 * movimentação, não por edição de cadastro). Atualiza o registro existente.
 */
export interface DadosDoProduto {
  name: string;
  description: string | null;
  category_id: string | null;
  unit: string;
  quantity_minimum: number;
  location: string | null;
}

export async function atualizarProdutoCompleto(
  produtoId: string,
  dados: DadosDoProduto
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "products", "update");
  if (!permitido.ok) return permitido;

  const nome = dados.name.trim().slice(0, 120);
  const unidade = dados.unit.trim().slice(0, 20);
  if (!nome) return { ok: false, message: "Dê um nome para o produto." };
  if (!unidade) return { ok: false, message: "Informe a unidade para continuar." };
  if (!Number.isInteger(dados.quantity_minimum) || dados.quantity_minimum < 0) {
    return { ok: false, message: "Quantidade mínima inválida." };
  }

  if (dados.category_id) {
    const recusa = await recusaDeCadastro(supabase, "categories", dados.category_id);
    if (recusa) return { ok: false, message: recusa };
  }
  if (dados.location) {
    const recusa = await recusaDeCadastro(supabase, "locations", dados.location);
    if (recusa) return { ok: false, message: recusa };
  }

  const { error } = await supabase
    .from("products")
    .update({
      name: nome,
      description: dados.description?.slice(0, 4000) || null,
      category_id: dados.category_id,
      unit: unidade,
      quantity_minimum: dados.quantity_minimum,
      location: dados.location,
    })
    .eq("id", produtoId);

  if (error) {
    console.error("Falha ao atualizar produto:", error);
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
