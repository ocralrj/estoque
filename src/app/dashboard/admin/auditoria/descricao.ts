import { roleLabel } from "@/lib/labels";

export interface Registro {
  id: string;
  user_id: string | null;
  module: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user?: { full_name: string | null; email: string } | null;
}

/** Nomes das coisas que a trilha guarda só pelo id. */
export interface Referencias {
  produtos: Map<string, string>;
  grupos: Map<string, string>;
  permissoes: Map<string, string>;
  pessoas: Map<string, string>;
}

/**
 * Os gatilhos gravaram em três dialetos ao longo do tempo: o schema original
 * em inglês ("update", "product", "old_name"), a correção de produto com as
 * chaves em português ("nome_antes") e os de administração já em português
 * ("alterar_papel"). A trilha não pode ser reescrita — é o que a torna prova —,
 * então a tradução acontece aqui, na leitura, e vale para o histórico inteiro.
 */
const VERBO: Record<string, "criar" | "alterar" | "excluir"> = {
  create: "criar",
  criar: "criar",
  INSERT: "criar",
  update: "alterar",
  alterar: "alterar",
  UPDATE: "alterar",
  delete: "excluir",
  excluir: "excluir",
  DELETE: "excluir",
};

/** Rótulo de cada ação no filtro. */
export const ACOES: Record<string, string> = {
  criar: "Criou",
  create: "Criou",
  INSERT: "Criou",
  alterar: "Alterou",
  update: "Alterou",
  UPDATE: "Alterou",
  excluir: "Excluiu",
  delete: "Excluiu",
  DELETE: "Excluiu",
  alterar_papel: "Alterou o papel",
  ativar: "Ativou",
  desativar: "Desativou",
  conceder_permissao: "Concedeu permissão",
  revogar_permissao: "Revogou permissão",
};

export const MODULOS: Record<string, string> = {
  admin: "Administração",
  estoque: "Estoque",
  ged: "GED",
  certificados: "Certificados",
  protocolos: "Protocolos",
  sugestoes: "Sugestões",
};

/** Ações que mudam quem pode o quê, ou que apagam, merecem destaque na varredura. */
export const SENSIVEIS = new Set([
  "alterar_papel",
  "conceder_permissao",
  "revogar_permissao",
  "desativar",
  "excluir",
  "delete",
  "DELETE",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor: unknown): string | undefined {
  if (valor === null || valor === undefined || valor === "") return undefined;
  return String(valor);
}

/** Os ids que precisam de nome, separados pela tabela onde procurar. */
export function idsParaResolver(registros: Registro[]) {
  const produtos = new Set<string>();
  const grupos = new Set<string>();
  const permissoes = new Set<string>();

  for (const r of registros) {
    const d = r.details ?? {};
    const tipo = r.resource_type;
    if ((tipo === "product" || tipo === "products") && r.resource_id) produtos.add(r.resource_id);
    if (tipo === "movement" || tipo === "movements") {
      const id = texto(d.product_id);
      if (id) produtos.add(id);
    }
    if ((tipo === "user_groups" || tipo === "group_permissions" || tipo === "group_members") && r.resource_id) {
      grupos.add(r.resource_id);
    }
    const permissao = texto(d.permission_id);
    if (permissao) permissoes.add(permissao);
  }

  // Um valor que não é UUID derrubaria a consulta inteira com erro de conversão.
  const validos = (s: Set<string>) => Array.from(s).filter((id) => UUID.test(id));
  return { produtos: validos(produtos), grupos: validos(grupos), permissoes: validos(permissoes) };
}

export function rotuloDePermissao(p: {
  module: string;
  resource: string;
  action: string;
  description: string | null;
}): string {
  return p.description || `${MODULOS[p.module] ?? p.module} › ${p.resource} › ${p.action}`;
}

export function descrever(r: Registro, ref: Referencias): string {
  const d = r.details ?? {};
  const verbo = VERBO[r.action];
  const id = r.resource_id ?? "";

  switch (r.resource_type) {
    case "product":
    case "products": {
      const nome =
        texto(d.nome_depois) ?? texto(d.new_name) ?? texto(d.nome) ?? texto(d.name) ??
        ref.produtos.get(id) ?? "(produto já excluído)";
      const codigo = texto(d.codigo) ?? texto(d.code);

      if (verbo === "criar") return `Cadastrou o produto ${nome}${codigo ? ` (código ${codigo})` : ""}`;
      if (verbo === "excluir") return `Excluiu o produto ${nome}${codigo ? ` (código ${codigo})` : ""}`;

      // O gatilho só registra nome e saldo. Se nenhum dos dois mudou, a
      // alteração foi em outro campo — dizer isso é mais honesto que inventar.
      const mudancas: string[] = [];
      const nomeAntes = texto(d.nome_antes) ?? texto(d.old_name);
      const nomeDepois = texto(d.nome_depois) ?? texto(d.new_name);
      if (nomeAntes && nomeDepois && nomeAntes !== nomeDepois) {
        mudancas.push(`nome “${nomeAntes}” → “${nomeDepois}”`);
      }
      const qtdAntes = texto(d.quantidade_antes) ?? texto(d.old_quantity);
      const qtdDepois = texto(d.quantidade_depois) ?? texto(d.new_quantity);
      if (qtdAntes !== undefined && qtdDepois !== undefined && qtdAntes !== qtdDepois) {
        mudancas.push(`saldo ${qtdAntes} → ${qtdDepois}`);
      }
      return mudancas.length > 0
        ? `Alterou o produto ${nome}: ${mudancas.join("; ")}`
        : `Alterou o cadastro do produto ${nome} (nome e saldo sem mudança)`;
    }

    case "movement":
    case "movements": {
      const produto = ref.produtos.get(texto(d.product_id) ?? "") ?? "(produto já excluído)";
      const tipo = d.type === "entrada" ? "entrada" : d.type === "saida" ? "saída" : "movimentação";
      const quantidade = texto(d.quantity) ?? "?";
      if (verbo === "excluir") return `Excluiu a ${tipo} de ${quantidade} × ${produto}`;
      return `Registrou ${tipo} de ${quantidade} × ${produto}`;
    }

    case "profile":
    case "profiles":
    case "user": {
      const pessoa = texto(d.email) ?? ref.pessoas.get(id) ?? "(usuário já excluído)";
      if (r.action === "alterar_papel") {
        return `Alterou o papel de ${pessoa}: ${roleLabel(texto(d.de))} → ${roleLabel(texto(d.para))}`;
      }
      if (r.action === "ativar") return `Ativou a conta de ${pessoa}`;
      if (r.action === "desativar") return `Desativou a conta de ${pessoa}`;
      if (verbo === "criar") {
        const papel = texto(d.papel) ?? texto(d.role);
        return `Cadastrou o usuário ${pessoa}${papel ? ` como ${roleLabel(papel)}` : ""}`;
      }
      if (verbo === "excluir") return `Excluiu o usuário ${pessoa}`;

      // Formato do schema original: um só registro com papel e status.
      const mudancas: string[] = [];
      if (d.old_role !== d.new_role && d.new_role !== undefined) {
        mudancas.push(`papel ${roleLabel(texto(d.old_role))} → ${roleLabel(texto(d.new_role))}`);
      }
      if (d.old_active !== d.new_active && d.new_active !== undefined) {
        mudancas.push(d.new_active ? "conta ativada" : "conta desativada");
      }
      return mudancas.length > 0
        ? `Alterou o usuário ${pessoa}: ${mudancas.join("; ")}`
        : `Alterou o cadastro de ${pessoa}`;
    }

    case "user_groups": {
      const nome = texto(d.name) ?? texto(d.nome) ?? ref.grupos.get(id) ?? "(grupo já excluído)";
      if (verbo === "criar") return `Criou o grupo ${nome}`;
      if (verbo === "excluir") return `Excluiu o grupo ${nome}`;
      return `Alterou o grupo ${nome}`;
    }

    case "departamentos": {
      const nome = texto(d.nome) ?? texto(d.name) ?? "(sem nome)";
      if (verbo === "criar") return `Criou o departamento ${nome}`;
      if (verbo === "excluir") return `Excluiu o departamento ${nome}`;
      return `Alterou o departamento ${nome}`;
    }

    case "group_permissions": {
      const grupo = ref.grupos.get(id) ?? "(grupo já excluído)";
      const permissao = ref.permissoes.get(texto(d.permission_id) ?? "") ?? "(permissão removida)";
      return r.action === "revogar_permissao"
        ? `Revogou do grupo ${grupo}: ${permissao}`
        : `Concedeu ao grupo ${grupo}: ${permissao}`;
    }

    case "group_members": {
      const grupo = ref.grupos.get(id) ?? "(grupo já excluído)";
      const pessoa = ref.pessoas.get(texto(d.user_id) ?? "") ?? "um usuário";
      return r.action === "revogar_permissao"
        ? `Retirou ${pessoa} do grupo ${grupo}`
        : `Incluiu ${pessoa} no grupo ${grupo}`;
    }

    case "access_requests": {
      const nome = texto(d.nome) ?? "(sem nome)";
      const email = texto(d.email);
      return `Excluiu o pedido de acesso de ${nome}${email ? ` (${email})` : ""}`;
    }
  }

  // Tipo que ainda não tem frase própria: melhor uma descrição genérica com o
  // nome, quando houver, do que o id cru — que não diz nada a quem lê.
  const acao = ACOES[r.action] ?? r.action;
  const nome = texto(d.nome) ?? texto(d.name) ?? texto(d.email) ?? texto(d.codigo);
  return `${acao} ${r.resource_type.replace(/_/g, " ")}${nome ? `: ${nome}` : ""}`;
}
