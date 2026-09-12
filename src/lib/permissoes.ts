import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import {
  chave,
  nivelDoPapel,
  permissoesDoPapel,
  type Acao,
  type Chave,
} from "@/lib/atribuicoes";

/**
 * Autorização do sistema, em um lugar só.
 *
 * A cadeia é sempre a mesma:
 *
 *   usuário -> grupo -> nível hierárquico -> permissões -> módulo/ação
 *
 * Toda tela, rota e Server Action pergunta aqui. Nenhuma decide por conta
 * própria: regra espalhada é regra que diverge, e divergência em autorização
 * significa uma tela escondendo o botão enquanto a API continua aceitando a
 * chamada.
 */

export type { Acao, Chave } from "@/lib/atribuicoes";
export { chave, nivelDoPapel } from "@/lib/atribuicoes";

interface Sessao {
  permissoes: Set<Chave>;
  papel: UserRole | null;
  nivel: number;
  /** true quando as permissões vieram do papel, e não do grupo. */
  emReserva: boolean;
}

/**
 * Permissões da sessão, buscadas uma vez por requisição.
 *
 * `cache` do React deduplica: menu, dashboard e guarda de rota podem perguntar
 * à vontade dentro da mesma renderização sem repetir a consulta.
 */
export const sessaoAutorizada = cache(async (): Promise<Sessao> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { permissoes: new Set(), papel: null, nivel: 99, emReserva: false };
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, group_id, active")
    .eq("id", user.id)
    .single();

  const papel = (perfil?.role as UserRole) ?? null;

  // Conta desativada não recebe permissão nenhuma, qualquer que seja o grupo.
  if (!perfil || perfil.active === false) {
    return { permissoes: new Set(), papel, nivel: 99, emReserva: false };
  }

  const { data, error } = await supabase.rpc("minhas_permissoes");

  if (error || !Array.isArray(data)) {
    console.error("[permissoes] minhas_permissoes falhou; usando o papel como reserva", user.id, error);
    return {
      permissoes: permissoesDoPapel(papel),
      papel,
      nivel: nivelDoPapel(papel),
      emReserva: true,
    };
  }

  const permissoes = new Set<Chave>(
    (data as { module: string; resource: string; action: string }[]).map((p) =>
      chave(p.module, p.resource, p.action)
    )
  );

  // Grupo sem permissão alguma é quase sempre cadastro pela metade, não uma
  // decisão de bloquear tudo. Cair para o papel evita trancar a pessoa fora do
  // sistema por um grupo que ninguém terminou de configurar.
  if (permissoes.size === 0) {
    return {
      permissoes: permissoesDoPapel(papel),
      papel,
      nivel: nivelDoPapel(papel),
      emReserva: true,
    };
  }

  const { data: nivel } = await supabase.rpc("meu_nivel");

  return {
    permissoes,
    papel,
    nivel: typeof nivel === "number" ? nivel : nivelDoPapel(papel),
    emReserva: false,
  };
});

/** A sessão pode executar esta ação neste recurso? */
export async function pode(
  modulo: string,
  recurso: string,
  acao: Acao
): Promise<boolean> {
  const { permissoes } = await sessaoAutorizada();
  return permissoes.has(chave(modulo, recurso, acao));
}

/** Basta uma das ações — usado para decidir se a tela aparece no menu. */
export async function podeAlguma(
  modulo: string,
  recurso: string,
  acoes: Acao[]
): Promise<boolean> {
  const { permissoes } = await sessaoAutorizada();
  return acoes.some((a) => permissoes.has(chave(modulo, recurso, a)));
}

/** A sessão alcança alguma coisa dentro deste módulo? */
export async function podeVerModulo(modulo: string): Promise<boolean> {
  const { permissoes } = await sessaoAutorizada();
  return Array.from(permissoes).some((c) => c.startsWith(`${modulo}:`));
}

/**
 * Guarda de página: sem a permissão, a pessoa não chega ao conteúdo.
 *
 * Esconder o item do menu não protege nada — a URL continua digitável. Toda
 * página protegida chama isto.
 */
export async function exigirPermissao(
  modulo: string,
  recurso: string,
  acao: Acao
): Promise<void> {
  const { papel } = await sessaoAutorizada();
  if (!papel) redirect("/auth/login");
  if (!(await pode(modulo, recurso, acao))) {
    redirect("/dashboard?negado=" + encodeURIComponent(`${modulo}:${recurso}`));
  }
}

/**
 * Guarda de Server Action e rota: devolve o erro em vez de redirecionar.
 *
 * O botão escondido é conveniência; esta é a barreira. Um POST montado à mão
 * chega aqui do mesmo jeito que o clique na tela.
 */
export async function exigir(
  modulo: string,
  recurso: string,
  acao: Acao
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { papel, permissoes, emReserva } = await sessaoAutorizada();
  if (!papel) return { ok: false, message: "Não autenticado" };
  if (!(await pode(modulo, recurso, acao))) {
    console.warn("[permissoes] negado", {
      chave: chave(modulo, recurso, acao),
      papel,
      emReserva,
      totalDePermissoes: permissoes.size,
    });
    return { ok: false, message: "Você não tem permissão para esta ação." };
  }
  return { ok: true };
}

/** Lista achatada, para atravessar até os componentes de cliente. */
export async function permissoesParaCliente(): Promise<Chave[]> {
  const { permissoes } = await sessaoAutorizada();
  return Array.from(permissoes);
}
