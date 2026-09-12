import type { UserRole } from "@/types/database";

/**
 * A matriz de permissões, e como explicá-la em português.
 *
 * Vive fora de `permissoes.ts` por um motivo prático: aquele módulo importa o
 * cliente de servidor e `redirect`, e por isso não pode ser importado por um
 * componente cliente. As dicas da tela de usuários precisam justamente dizer o
 * que cada função permite — e a única forma de essa dica não envelhecer é ela
 * ser calculada da mesma matriz que autoriza de verdade, e não de um texto
 * escrito à parte que ninguém lembra de atualizar.
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
export function permissoesDoPapel(papel: string | null | undefined): Set<Chave> {
  const set = new Set<Chave>();
  const add = (m: string, r: string, acoes: string[]) =>
    acoes.forEach((a) => set.add(chave(m, r, a)));

  const TODAS = ["read", "create", "update", "delete", "export", "print", "manage"];

  if (papel === "super_admin" || papel === "gestor") {
    for (const r of ["products", "movements", "categories", "locations", "alerts", "reports"]) {
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
    for (const r of ["products", "movements", "categories", "locations", "alerts", "reports"]) {
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

/** Nível equivalente ao papel, para quando o grupo ainda não responde. */
export function nivelDoPapel(papel: string | null | undefined): number {
  if (papel === "super_admin") return 10;
  if (papel === "gestor") return 20;
  if (papel === "almoxarife") return 30;
  return 40;
}

/** Papel herdado por um nível hierárquico. Espelha `papel_do_nivel()` no banco. */
export function papelDoNivel(nivel: number): UserRole {
  if (nivel <= 10) return "super_admin";
  if (nivel <= 20) return "gestor";
  if (nivel <= 30) return "almoxarife";
  return "requisitante";
}

// ------------------------------------------------------------
// Traduzir a matriz para quem lê a tela
// ------------------------------------------------------------

const MODULOS: Record<string, string> = {
  estoque: "estoque",
  ged: "GED",
  protocolos: "protocolos",
  sugestoes: "sugestões",
  admin: "administração",
  certificados: "certificados",
};

/**
 * O quanto um conjunto de verbos representa, em uma palavra.
 *
 * Listar os dez verbos de cada módulo daria uma dica de cinco linhas que
 * ninguém termina de ler. Três degraus dizem o que importa na hora de decidir
 * se alguém deve ou não estar naquela função.
 */
function degrau(acoes: Set<string>): "gerencia" | "opera" | "consulta" {
  if (acoes.has("manage") || acoes.has("delete")) return "gerencia";
  if (acoes.has("create") || acoes.has("update") || acoes.has("upload")) return "opera";
  return "consulta";
}

function juntar(itens: string[]): string {
  if (itens.length === 0) return "";
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Resume um conjunto de permissões em uma ou duas frases.
 *
 * Serve tanto para as permissões de um papel quanto para as de um grupo, que
 * vêm do banco no mesmo formato módulo/recurso/ação.
 */
export function resumirPermissoes(chaves: Iterable<string>): string {
  const porModulo = new Map<string, Set<string>>();

  for (const c of Array.from(chaves)) {
    const [modulo, , acao] = c.split(":");
    if (!modulo || !acao) continue;
    const atual = porModulo.get(modulo) ?? new Set<string>();
    atual.add(acao);
    porModulo.set(modulo, atual);
  }

  if (porModulo.size === 0) return "Nenhuma permissão concedida.";

  const porDegrau: Record<string, string[]> = { gerencia: [], opera: [], consulta: [] };
  for (const [modulo, acoes] of Array.from(porModulo.entries())) {
    porDegrau[degrau(acoes)].push(MODULOS[modulo] ?? modulo);
  }

  const frases: string[] = [];
  if (porDegrau.gerencia.length) frases.push(`Gerencia ${juntar(porDegrau.gerencia)}`);
  if (porDegrau.opera.length) frases.push(`opera ${juntar(porDegrau.opera)}`);
  if (porDegrau.consulta.length) frases.push(`consulta ${juntar(porDegrau.consulta)}`);

  return `${frases.join("; ")}.`;
}

/** O que uma função permite, derivado do papel que ela herda. */
export function resumoDoPapel(papel: string | null | undefined): string {
  return resumirPermissoes(permissoesDoPapel(papel));
}
