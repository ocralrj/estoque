"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const AVISO_MIGRACAO =
  "O pedido de material ainda não está no banco. Execute supabase/_manual_apply/032_pedidos_de_material.sql.";

function faltaMigracao(codigo?: string) {
  return codigo === "42P01" || codigo === "PGRST205" || codigo === "42703";
}

export interface ItemDoPedido {
  id: string;
  product_id: string;
  quantidade: number;
  quantidade_atendida: number | null;
  produto?: { name: string; code: string; unit: string; quantity_current: number } | null;
}

export interface PedidoDeMaterial {
  id: string;
  numero: string;
  solicitante_id: string;
  departamento: string | null;
  justificativa: string | null;
  status: "aberto" | "atendido" | "parcial" | "recusado" | "cancelado";
  observacao_atendimento: string | null;
  atendido_em: string | null;
  created_at: string;
  solicitante?: { full_name: string | null; email: string; avatar_url: string | null } | null;
  itens?: ItemDoPedido[];
}

export async function listarPedidos(): Promise<Resultado<PedidoDeMaterial[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "requisicoes", "read");
  if (!permitido.ok) return permitido;

  // A RLS decide o recorte: quem pede vê os seus, quem atende vê todos. A
  // ordem põe os abertos primeiro — é a fila, e fila se lê de cima.
  const { data, error } = await supabase
    .from("pedidos_material")
    .select(
      `*,
       solicitante:profiles!pedidos_material_solicitante_id_fkey(full_name, email, avatar_url),
       itens:pedido_itens(
         id, product_id, quantidade, quantidade_atendida,
         produto:products(name, code, unit, quantity_current)
       )`
    )
    .order("status")
    .order("created_at", { ascending: false });

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao listar pedidos de material:", error);
    return { ok: false, message: "Não foi possível carregar os pedidos." };
  }

  return { ok: true, data: (data ?? []) as PedidoDeMaterial[] };
}

/**
 * Abre o pedido.
 *
 * Não toca no estoque: é o atendimento que gera a saída. Aqui só fica
 * registrado o que a pessoa precisa — e o pedido nasce aberto, à espera de
 * quem cuida do almoxarifado.
 */
export async function criarPedido(entrada: {
  justificativa?: string;
  itens: { productId: string; quantidade: number }[];
}): Promise<Resultado<{ numero: string }>> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "requisicoes", "create");
  if (!permitido.ok) return permitido;

  const itens = entrada.itens.filter((i) => i.productId && i.quantidade > 0);
  if (itens.length === 0) {
    return { ok: false, message: "Inclua ao menos um item com quantidade." };
  }

  // Um produto por linha: pedir a mesma caneta duas vezes no mesmo pedido é
  // engano de digitação, não intenção — e o banco recusaria de todo jeito.
  const repetido = itens.find(
    (i, idx) => itens.findIndex((o) => o.productId === i.productId) !== idx
  );
  if (repetido) {
    return { ok: false, message: "O mesmo produto aparece mais de uma vez." };
  }

  const { data: pedido, error } = await supabase
    .from("pedidos_material")
    .insert({
      solicitante_id: user.id,
      departamento: profile?.departamento ?? null,
      justificativa: entrada.justificativa?.trim().slice(0, 500) || null,
    })
    .select("id, numero")
    .single();

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao abrir pedido:", error);
    return { ok: false, message: "Não foi possível abrir o pedido." };
  }

  const { error: erroItens } = await supabase.from("pedido_itens").insert(
    itens.map((i) => ({
      pedido_id: pedido.id,
      product_id: i.productId,
      quantidade: i.quantidade,
    }))
  );

  if (erroItens) {
    // Pedido sem item é pedido vazio na fila de quem atende: melhor desfazer.
    await supabase.from("pedidos_material").delete().eq("id", pedido.id);
    console.error("Falha ao gravar itens do pedido:", erroItens);
    return { ok: false, message: "Não foi possível gravar os itens do pedido." };
  }

  revalidatePath("/dashboard/estoque/pedidos");
  return { ok: true, data: { numero: pedido.numero as string } };
}

/**
 * Atende o pedido, entregando o que houver.
 *
 * A conta toda acontece no banco, numa transação: as saídas são registradas, o
 * saldo cai pelo gatilho de sempre, o pedido fecha e quem pediu é avisado. Ou
 * tudo isso, ou nada — metade das entregas gravadas com o pedido aberto seria
 * pior do que não ter atendido.
 */
export async function atenderPedido(
  pedidoId: string,
  entregas: Record<string, number>,
  observacao?: string
): Promise<Resultado<{ situacao: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", "requisicoes", "manage");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase.rpc("atender_pedido_material", {
    p_pedido: pedidoId,
    p_entregas: entregas,
    p_observacao: observacao?.trim() || null,
  });

  if (error) {
    if (error.message?.includes("schema cache") || error.code === "PGRST202") {
      return { ok: false, message: AVISO_MIGRACAO };
    }
    // A mensagem do banco é específica e útil: "Quantidade insuficiente em
    // estoque", "já foi decidido". Escondê-la só faria a pessoa tentar de novo.
    return { ok: false, message: error.message || "Não foi possível atender." };
  }

  revalidatePath("/dashboard/estoque/pedidos");
  revalidatePath("/dashboard/estoque/movimentacoes");
  revalidatePath("/dashboard/estoque/produtos");
  return { ok: true, data: { situacao: String(data) } };
}

export async function cancelarPedido(pedidoId: string): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { error } = await supabase
    .from("pedidos_material")
    .update({ status: "cancelado" })
    .eq("id", pedidoId)
    .eq("solicitante_id", user.id)
    .eq("status", "aberto");

  if (error) {
    return { ok: false, message: "Não foi possível cancelar o pedido." };
  }

  revalidatePath("/dashboard/estoque/pedidos");
  return { ok: true, data: undefined };
}
