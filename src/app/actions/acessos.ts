"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import { convidarUsuario } from "@/app/actions/users";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Pedido de acesso feito por quem ainda não tem conta.
 *
 * Não cria usuário nem senha: cria um pedido. A conta só passa a existir
 * quando alguém responsável decide — que é o que a própria tela de cadastro
 * já prometia ao dizer "o acesso é por convite", enquanto na prática abria uma
 * conta para qualquer um que soubesse o endereço.
 *
 * Roda com a chave pública, sem sessão, porque quem pede ainda não entrou. O
 * que protege a mesa é a linha não conceder nada e haver um pedido pendente
 * por e-mail.
 */
export async function pedirAcesso(entrada: {
  nome: string;
  email: string;
  departamento: string;
  mensagem?: string;
}): Promise<Resultado> {
  const nome = entrada.nome.trim();
  const email = entrada.email.trim().toLowerCase();
  const departamento = entrada.departamento.trim();

  if (nome.length < 3) {
    return { ok: false, message: "Escreva seu nome completo." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: "Informe um e-mail válido." };
  }
  if (!departamento) {
    return { ok: false, message: "Escolha o departamento em que você trabalha." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    return { ok: false, message: "Serviço indisponível no momento." };
  }

  const supabase = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("access_requests").insert({
    nome: nome.slice(0, 120),
    email,
    departamento: departamento.slice(0, 60),
    mensagem: entrada.mensagem?.trim().slice(0, 500) || null,
  });

  if (error) {
    // Índice único de pendente por e-mail: pedir de novo não empilha na fila.
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Já existe um pedido em análise para este e-mail. Quem responde pelo seu departamento foi avisado.",
      };
    }
    if (error.code === "42P01" || error.code === "PGRST205") {
      return {
        ok: false,
        message:
          "O pedido de acesso ainda não está configurado. Avise a administração.",
      };
    }
    console.error("Falha ao registrar pedido de acesso:", error);
    return { ok: false, message: "Não foi possível registrar o pedido." };
  }

  return { ok: true, data: undefined };
}

export interface PedidoDeAcesso {
  id: string;
  nome: string;
  email: string;
  departamento: string;
  mensagem: string | null;
  status: "pendente" | "aprovado" | "recusado";
  motivo_recusa: string | null;
  created_at: string;
}

export async function listarPedidos(): Promise<Resultado<PedidoDeAcesso[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "create");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .order("status")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return {
        ok: false,
        message:
          "A fila de pedidos ainda não existe. Execute supabase/_manual_apply/028_solicitacao_de_acesso.sql.",
      };
    }
    return { ok: false, message: "Não foi possível carregar os pedidos." };
  }

  return { ok: true, data: (data ?? []) as PedidoDeAcesso[] };
}

/**
 * Aprova o pedido: cria a conta e devolve a senha provisória.
 *
 * A senha volta para a tela de quem aprovou, e não vai por e-mail, porque o
 * sistema não tem provedor de envio. Quem aprova repassa — e a conta já nasce
 * obrigada a trocar a senha no primeiro acesso, então ela vale uma vez só.
 */
export async function aprovarPedido(
  id: string
): Promise<Resultado<{ senha: string; email: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "create");
  if (!permitido.ok) return permitido;

  const { data: pedido } = await supabase
    .from("access_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (pedido.status !== "pendente") {
    return { ok: false, message: "Este pedido já foi decidido." };
  }

  const criado = await convidarUsuario({
    email: pedido.email as string,
    nome: pedido.nome as string,
    departamento: pedido.departamento as string,
  });

  if (!criado.ok) return { ok: false, message: criado.message };

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "aprovado", decidido_por: user.id, decidido_em: new Date().toISOString() })
    .eq("id", id);

  // A conta já existe: falhar em marcar o pedido não pode fazer a tela dizer
  // que deu errado, senão alguém tenta de novo e esbarra em "e-mail já tem
  // conta". O que fica pendente é só a marca na fila.
  if (error) {
    console.error("Conta criada, mas o pedido não foi marcado:", error);
  }

  revalidatePath("/dashboard/admin/acessos");
  revalidatePath("/dashboard/admin/usuarios");

  return { ok: true, data: { senha: criado.senha, email: pedido.email as string } };
}

export async function recusarPedido(
  id: string,
  motivo: string
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "create");
  if (!permitido.ok) return permitido;

  const { error } = await supabase
    .from("access_requests")
    .update({
      status: "recusado",
      motivo_recusa: motivo.trim().slice(0, 300) || null,
      decidido_por: user.id,
      decidido_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pendente");

  if (error) return { ok: false, message: "Não foi possível recusar o pedido." };

  revalidatePath("/dashboard/admin/acessos");
  return { ok: true, data: undefined };
}
