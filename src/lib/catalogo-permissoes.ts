/**
 * Nomes legíveis do catálogo de permissões.
 *
 * O banco guarda identificadores em inglês (`estoque` / `products` / `create`)
 * porque são chaves, e chave não se traduz. Mas a tela que concede acesso é
 * usada por quem administra a empresa, não por quem escreveu o código: pedir
 * que alguém decida se o grupo "Operadores" recebe `ged/retention/manage` é
 * pedir que decida no escuro.
 *
 * Um identificador sem tradução aqui ainda aparece na tela, com o nome cru:
 * uma permissão nova precisa ser concedível no dia em que é criada, e não no
 * dia em que alguém lembra de traduzi-la.
 */

export const NOMES_DE_MODULO: Record<string, string> = {
  estoque: "Estoque",
  ged: "Documentos (GED)",
  protocolos: "Protocolos",
  sugestoes: "Sugestões",
  admin: "Administração",
  certificados: "Certificados",
};

export const NOMES_DE_RECURSO: Record<string, string> = {
  products: "Produtos",
  movements: "Movimentações",
  categories: "Categorias",
  locations: "Localizações",
  alerts: "Alertas de estoque",
  reports: "Relatórios",
  documents: "Documentos",
  folders: "Pastas",
  search: "Busca no acervo",
  audit: "Auditoria",
  retention: "Temporalidade e descarte",
  certificates: "Certificados",
  protocolos: "Protocolos",
  minhas: "Minhas sugestões",
  todas: "Sugestões de todos",
  users: "Usuários",
  groups: "Grupos",
  permissions: "Permissões",
  departamentos: "Departamentos",
};

/** Ordem em que as ações aparecem, do mais brando ao mais destrutivo. */
export const ORDEM_DAS_ACOES = [
  "read",
  "create",
  "update",
  "delete",
  "upload",
  "download",
  "export",
  "print",
  "import",
  "manage",
];

export const NOMES_DE_ACAO: Record<string, string> = {
  read: "Ver",
  create: "Criar",
  update: "Editar",
  delete: "Excluir",
  upload: "Anexar",
  download: "Baixar",
  export: "Exportar",
  print: "Imprimir",
  import: "Importar",
  manage: "Administrar",
};

/** O que a ação significa na prática, mostrado como dica na matriz. */
export const EXPLICACAO_DA_ACAO: Record<string, string> = {
  read: "Abrir a tela e consultar os registros",
  create: "Incluir registros novos",
  update: "Alterar registros existentes",
  delete: "Excluir registros — irreversível",
  upload: "Anexar arquivos",
  download: "Baixar os arquivos anexados",
  export: "Baixar a listagem em planilha",
  print: "Gerar a versão para impressão",
  import: "Carregar registros em lote a partir de um arquivo",
  manage:
    "Ações próprias do recurso: responder, encaminhar, configurar. Em Certificados, é o que dá acesso aos de TODAS as empresas",
};

export function nomeDoModulo(id: string): string {
  return NOMES_DE_MODULO[id] ?? id;
}

export function nomeDoRecurso(id: string): string {
  return NOMES_DE_RECURSO[id] ?? id;
}

export function nomeDaAcao(id: string): string {
  return NOMES_DE_ACAO[id] ?? id;
}

/** Níveis da hierarquia, do mais poderoso ao menos. */
export const NIVEIS = [
  { nivel: 10, nome: "Administrador", detalhe: "Acesso total, inclusive a grupos e permissões" },
  { nivel: 20, nome: "Gestor", detalhe: "Gestão do acervo, do estoque e das pessoas" },
  { nivel: 30, nome: "Supervisor", detalhe: "Opera estoque e GED, sem administração" },
  { nivel: 40, nome: "Operador", detalhe: "Consulta e registra o próprio trabalho" },
];

export function nomeDoNivel(nivel: number): string {
  // Faixas, e não valores exatos: níveis intermediários criados depois caem no
  // patamar imediatamente superior, em vez de ficarem sem nome.
  if (nivel <= 10) return "Administrador";
  if (nivel <= 20) return "Gestor";
  if (nivel <= 30) return "Supervisor";
  return "Operador";
}
