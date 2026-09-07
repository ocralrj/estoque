import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

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

/** Verbos que uma permissão pode conceder. */
export type Acao =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "print"
  | "import"
  | "upload"
  | "download"
  | "manage";

/** Chave achatada de uma permissão, como ela viaja e é comparada. */
export type Chave = `${string}:${string}:${string}`;

export function chave(modulo: string, recurso: string, acao: Acao | string): Chave {
  return `${modulo}:${recurso}:${acao}`;
}

/**
 * Permissões equivalentes a cada papel.
 *
 * Existe como rede de segurança, não como segunda fonte de verdade: se a função
 * `minhas_permissoes` ainda não estiver no banco — migração não aplicada, banco
 * restaurado de um backup antigo — sem isto TODA permissão seria negada e o
 * sistema inteiro ficaria inacessível, inclusive a tela que conserta o
 * problema. Aqui o sistema volta ao comportamento que tinha antes dos grupos,
 * que é conhecido e seguro, em vez de trancar todo mundo do lado de fora.
 *
 * Espelha a semeadura da migração 014.
 */
function permissoesDoPapel(papel: string | null | undefined): Set<Chave> {
  const set = new Set<Chave>();
  const add = (m: string, r: string, acoes: string[]) =>
    acoes.forEach((a) => set.add(chave(m, r, a)));

  const TODAS = ["read", "create", "update", "delete", "export", "print", "manage"];

  if (papel === "super_admin" || papel === "gestor") {
    for (const r of ["products", "movements", "categories", "alerts", "reports"]) {
      add("estoque", r, TODAS);
    }
    for (const r of ["documents", "folders", "search", "audit", "retention"]) {
      add("ged", r, [...TODAS, "upload", "download"]);
    }
    add("protocolos", "protocolos", TODAS);
    add("sugestoes", "minhas", ["read", "create"]);
    add("sugestoes", "todas", ["read", "manage"]);
    for (const r of ["users", "departamentos", "audit"]) add("admin", r, TODAS);
    if (papel === "super_admin") {
      add("admin", "groups", TODAS);
      add("admin", "permissions", ["manage"]);
    }
    return set;
  }

  if (papel === "almoxarife") {
    for (const r of ["products", "movements", "categories", "alerts", "reports"]) {
      add("estoque", r, ["read", "create", "update", "export", "print"]);
    }
    for (const r of ["documents", "folders", "search"]) {
      add("ged", r, ["read", "create", "update", "upload", "download", "export", "print"]);
    }
    add("protocolos", "protocolos", ["read", "create", "update", "manage"]);
    add("sugestoes", "minhas", ["read", "create"]);
    return set;
  }

  // Requisitante e qualquer papel desconhecido: o mínimo.
  add("estoque", "products", ["read"]);
  add("estoque", "alerts", ["read"]);
  add("ged", "documents", ["read", "download"]);
  add("ged", "search", ["read"]);
  add("protocolos", "protocolos", ["read", "create"]);
  add("sugestoes", "minhas", ["read", "create"]);
  return set;
}

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

/** Nível equivalente ao papel, para quando o grupo ainda não responde. */
export function nivelDoPapel(papel: string | null | undefined): number {
  if (papel === "super_admin") return 10;
  if (papel === "gestor") return 20;
  if (papel === "almoxarife") return 30;
  return 40;
}

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
  const { papel } = await sessaoAutorizada();
  if (!papel) return { ok: false, message: "Não autenticado" };
  if (!(await pode(modulo, recurso, acao))) {
    return { ok: false, message: "Você não tem permissão para esta ação." };
  }
  return { ok: true };
}

/** Lista achatada, para atravessar até os componentes de cliente. */
export async function permissoesParaCliente(): Promise<Chave[]> {
  const { permissoes } = await sessaoAutorizada();
  return Array.from(permissoes);
}
