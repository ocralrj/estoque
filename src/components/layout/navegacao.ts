import { useMemo } from "react";
import { usePode } from "@/components/auth/Permissoes";

export interface NavItem {
  href?: string;
  label: string;
  /**
   * Permissão que revela o item, como "modulo:recurso:acao". Sem ela o item
   * não aparece — e a página correspondente recusa o acesso direto pela URL,
   * porque esconder o link não protege nada.
   */
  permissao?: string;
  /** Ícone do item. Recolhido, é a única identificação visível. */
  icone?: string;
  /** O que a tela faz, mostrado na dica ao passar o ponteiro. */
  dica?: string;
  /**
   * Outras palavras pelas quais a tela é procurada na pesquisa. Quem procura
   * "entrada" quer Movimentações, mas a palavra não está no nome.
   */
  termos?: string[];
  roles: string[];
  children?: NavItem[];
}

const TODOS = ["super_admin", "gestor", "almoxarife", "requisitante"];
const ESTOQUE = ["super_admin", "gestor", "almoxarife"];
const GESTAO = ["super_admin", "gestor"];

/**
 * O menu lateral. É também a base da pesquisa de funções: uma lista só, para
 * que uma tela nova apareça nos dois lugares e com a mesma permissão.
 */
const ITENS_DO_MENU: NavItem[] = [
  {
    href: "/dashboard",
    label: "Início",
    icone: "inicio",
    dica: "Visão geral: totais de estoque, alertas e movimentações recentes",
    termos: ["painel", "dashboard", "resumo", "home"],
    roles: TODOS,
  },
  {
    label: "Estoque",
    icone: "estoque",
    permissao: "estoque:products:read",
    dica: "Produtos do almoxarifado, entradas e saídas",
    roles: TODOS,
    children: [
      { href: "/dashboard/estoque/produtos", label: "Produtos", icone: "produtos", permissao: "estoque:products:read", dica: "Cadastro dos itens do almoxarifado, com saldo e ponto de reposição", termos: ["itens", "material", "almoxarifado", "saldo"], roles: TODOS },
      { href: "/dashboard/estoque/categorias", label: "Categorias", icone: "categorias", permissao: "estoque:categories:read", dica: "Como os produtos são agrupados. Só as ativas aparecem no cadastro de produto", termos: ["classificação", "grupo de produtos", "tipo de produto"], roles: ESTOQUE },
      { href: "/dashboard/estoque/localizacoes", label: "Localizações", icone: "localizacoes", permissao: "estoque:locations:read", dica: "Onde os produtos ficam guardados. Só as ativas aparecem no cadastro de produto", termos: ["local", "prateleira", "armário", "depósito", "endereço"], roles: ESTOQUE },
      { href: "/dashboard/estoque/pedidos", label: "Pedidos de material", icone: "protocolos", permissao: "estoque:requisicoes:read", dica: "Pedir material e atender o que foi pedido. A baixa no estoque acontece na entrega", termos: ["requisição", "requisitar", "pedir material", "solicitar material"], roles: TODOS },
      { href: "/dashboard/estoque/movimentacoes", label: "Movimentações", icone: "movimentacoes", permissao: "estoque:movements:read", dica: "Histórico de entradas e saídas. O saldo do produto é atualizado por aqui", termos: ["entrada", "saída", "baixa", "histórico"], roles: ESTOQUE },
      { href: "/dashboard/estoque/alertas", label: "Alertas", icone: "alertas", permissao: "estoque:alerts:read", dica: "Produtos abaixo da quantidade mínima definida no cadastro", termos: ["estoque mínimo", "reposição", "em falta", "estoque baixo"], roles: ESTOQUE },
      { href: "/dashboard/estoque/relatorios", label: "Relatórios", icone: "relatorios", permissao: "estoque:reports:read", dica: "Volume movimentado por período, produto e categoria", termos: ["consumo", "período", "gráfico"], roles: GESTAO },
    ],
  },
  {
    // Grupo com href: o rótulo navega para o painel, a seta expande.
    href: "/dashboard/ged",
    label: "GED",
    icone: "ged",
    permissao: "ged:documents:read",
    dica: "Gestão eletrônica de documentos: acervo, prazos de guarda e certificados",
    termos: ["arquivo", "acervo", "temporalidade", "prazo de guarda"],
    roles: ESTOQUE,
    children: [
      { href: "/dashboard/ged/documentos", label: "Documentos", icone: "documentos", permissao: "ged:documents:read", dica: "Buscar, cadastrar e baixar arquivos do acervo", termos: ["arquivos", "anexo", "buscar documento", "baixar"], roles: TODOS },
      { href: "/dashboard/ged/pastas", label: "Pastas", icone: "pastas", permissao: "ged:folders:read", dica: "Estrutura de arquivamento por departamento", termos: ["arquivamento", "organização"], roles: ESTOQUE },
    ],
  },
  {
    href: "/dashboard/certificados",
    label: "Certificados",
    icone: "certificados",
    permissao: "certificados:certificates:read",
    dica: "Certificados digitais das empresas, com aviso de vencimento",
    termos: ["certificado digital", "A1", "e-CNPJ", "vencimento"],
    roles: ESTOQUE,
    children: [
      { href: "/dashboard/certificados", label: "Todos", icone: "certificados", permissao: "certificados:certificates:read", dica: "O acervo, ordenado pelo que vence primeiro", roles: ESTOQUE },
      { href: "/dashboard/certificados/empresas", label: "Empresas", icone: "departamentos", permissao: "certificados:certificates:read", dica: "As empresas e quem cuida dos certificados de cada uma", termos: ["CNPJ", "clientes"], roles: ESTOQUE },
    ],
  },
  {
    href: "/dashboard/sugestoes",
    label: "Minhas Sugestões",
    icone: "sugestoes",
    permissao: "sugestoes:minhas:read",
    dica: "Melhorias que você propôs e a resposta da equipe",
    termos: ["melhoria", "ideia", "feedback"],
    roles: TODOS,
  },
  {
    href: "/dashboard/protocolos",
    label: "Protocolos",
    icone: "protocolos",
    permissao: "protocolos:protocolos:read",
    dica: "Solicitações internas com número, responsável e situação",
    termos: ["NUP", "solicitação", "chamado"],
    roles: TODOS,
  },
  {
    label: "Administração",
    icone: "administracao",
    permissao: "admin:users:read",
    dica: "Usuários, grupos, departamentos e trilha de auditoria",
    roles: GESTAO,
    children: [
      { href: "/dashboard/admin/acessos", label: "Pedidos de acesso", icone: "usuarios", permissao: "admin:users:create", dica: "Quem pediu acesso pela tela pública, esperando aprovação", termos: ["aprovar acesso", "solicitação de acesso", "cadastro"], roles: GESTAO },
      { href: "/dashboard/admin/usuarios", label: "Usuários", icone: "usuarios", permissao: "admin:users:read", dica: "Convidar pessoas, definir papéis e ativar ou desativar contas", termos: ["pessoas", "contas", "convidar", "papel", "funções", "desativar"], roles: GESTAO },
      { href: "/dashboard/admin/departamentos", label: "Departamentos", icone: "departamentos", permissao: "admin:departamentos:read", dica: "Áreas da empresa que originam documentos no GED", termos: ["setor", "área"], roles: GESTAO },
      { href: "/dashboard/admin/cargos", label: "Cargos", icone: "usuarios", permissao: "admin:cargos:read", dica: "O que cada pessoa faz na empresa — separado do que ela pode fazer no sistema", termos: ["ocupação", "função"], roles: GESTAO },
      { href: "/dashboard/admin/grupos", label: "Grupos", icone: "grupos", permissao: "admin:groups:read", dica: "Conjuntos de usuários com permissões em comum", termos: ["permissões", "acesso"], roles: ["super_admin"] },
      { href: "/dashboard/admin/sugestoes", label: "Sugestões", icone: "sugestoes", permissao: "sugestoes:todas:read", dica: "Melhorias enviadas por todos: responder e definir prioridade", termos: ["melhorias", "responder sugestão"], roles: GESTAO },
      { href: "/dashboard/admin/auditoria", label: "Auditoria", icone: "auditoria", permissao: "admin:audit:read", dica: "Quem alterou papéis, grupos e permissões, e quando", termos: ["log", "histórico de alterações", "rastro"], roles: GESTAO },
    ],
  },
];

/**
 * Telas que não estão no menu, mas que alguém procura pelo nome: as de criação
 * e os cadastros de apoio. A permissão de cada uma é a mesma que a página
 * exige no servidor — se divergir, a pesquisa leva a uma tela que recusa.
 */
const ATALHOS: (NavItem & { grupo: string })[] = [
  { grupo: "Estoque", href: "/dashboard/estoque/produtos/new", label: "Novo produto", icone: "produtos", permissao: "estoque:products:create", dica: "Cadastrar um item no almoxarifado", termos: ["cadastrar produto", "incluir item"], roles: ESTOQUE },
  { grupo: "Estoque", href: "/dashboard/estoque/movimentacoes/new", label: "Nova movimentação", icone: "movimentacoes", permissao: "estoque:movements:create", dica: "Registrar entrada ou saída de material", termos: ["registrar entrada", "registrar saída", "dar baixa"], roles: ESTOQUE },
  { grupo: "GED", href: "/dashboard/ged/documentos/novo", label: "Novo documento", icone: "documentos", permissao: "ged:documents:create", dica: "Enviar um arquivo para o acervo", termos: ["enviar arquivo", "upload", "digitalizar", "anexar"], roles: ESTOQUE },
  { grupo: "Protocolos", href: "/dashboard/protocolos/novo", label: "Novo protocolo", icone: "protocolos", permissao: "protocolos:protocolos:create", dica: "Abrir uma solicitação interna", termos: ["abrir chamado", "nova solicitação"], roles: TODOS },
  { grupo: "Administração", href: "/dashboard/admin/grupos/novo", label: "Novo grupo", icone: "grupos", permissao: "admin:groups:create", dica: "Criar um conjunto de usuários com permissões em comum", roles: ["super_admin"] },
  { grupo: "Conta", href: "/dashboard/profile", label: "Meu perfil", icone: "usuarios", dica: "Nome, foto e senha da sua conta", termos: ["senha", "foto", "trocar senha", "minha conta"], roles: TODOS },
];

/** Tudo que menu e pesquisa perguntam. Fica explícito para o filtro poder ser um Set. */
const TODAS_AS_PERMISSOES = Array.from(
  new Set(
    [...ITENS_DO_MENU, ...ITENS_DO_MENU.flatMap((i) => i.children ?? []), ...ATALHOS]
      .map((i) => i.permissao)
      .filter((p): p is string => Boolean(p))
  )
);

/** As permissões desta sessão entre as que o menu e a pesquisa usam. */
export function usePermissoesDaNavegacao() {
  const pode = usePode();
  return useMemo(() => {
    const set = new Set<string>();
    for (const item of TODAS_AS_PERMISSOES) {
      const [m, r, a] = item.split(":");
      if (pode(m, r, a)) set.add(item);
    }
    return set;
  }, [pode]);
}

// A filtragem é por permissão, não por papel. O papel continua no item apenas
// como rede: se as permissões ainda não vieram do banco, o menu volta a ser o
// que era antes dos grupos, em vez de aparecer vazio.
function visivel(item: NavItem, role: string, permissoes: Set<string>) {
  return permissoes.size > 0
    ? !item.permissao || permissoes.has(item.permissao)
    : item.roles.includes(role);
}

export function navStructure(role: string, permissoes: Set<string>): NavItem[] {
  return ITENS_DO_MENU.filter((item) => visivel(item, role, permissoes))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => visivel(child, role, permissoes)),
    }))
    // Um grupo cujos filhos sumiram todos não deve aparecer sozinho: ele levaria
    // a uma tela que a pessoa não pode abrir.
    .filter((item) => !item.children || item.children.length > 0);
}

export interface Funcao {
  href: string;
  label: string;
  /** Onde a tela fica, como "Estoque" — desambigua "Sugestões" de "Minhas Sugestões". */
  grupo?: string;
  icone?: string;
  dica?: string;
  termos: string[];
}

/** As telas que esta sessão pode abrir, em lista plana, para a pesquisa. */
export function funcoesPermitidas(role: string, permissoes: Set<string>): Funcao[] {
  const funcoes: Funcao[] = [];
  const vistos = new Set<string>();

  function incluir(item: NavItem, grupo?: string) {
    // "Certificados › Todos" leva ao mesmo lugar que "Certificados": fica o primeiro.
    if (!item.href || vistos.has(item.href)) return;
    vistos.add(item.href);
    funcoes.push({
      href: item.href,
      label: item.label,
      grupo,
      icone: item.icone,
      dica: item.dica,
      termos: item.termos ?? [],
    });
  }

  for (const item of navStructure(role, permissoes)) {
    incluir(item);
    for (const child of item.children ?? []) incluir(child, item.label);
  }
  for (const atalho of ATALHOS) {
    if (visivel(atalho, role, permissoes)) incluir(atalho, atalho.grupo);
  }

  return funcoes;
}
