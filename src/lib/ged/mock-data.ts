export type GedSetor = "Fiscal" | "DP" | "Contábil";
export type GedStatus = "Ativo" | "Rascunho" | "Assinado" | "Arquivado" | "Eliminado";

export interface GedDocument {
  id: string;
  cliente: string;
  cnpj: string;
  setor: GedSetor;
  tipo: string;
  nome: string;
  path: string;
  status: GedStatus;
  versao: string;
  hash: string;
  periodo: string;
  responsavel: string;
  data: string;
  validade: string;
  categoria: string;
  preview: string;
  tags: string[];
}

export const gedDocuments: GedDocument[] = [
  {
    id: "GED-001",
    cliente: "Nexus Contabilidade",
    cnpj: "12.345.678/0001-90",
    setor: "Fiscal",
    tipo: "NF-e",
    nome: "NF-e_004321_08_2026.pdf",
    path: "Fiscal/Entradas e Saídas/NF-e/2026/08",
    status: "Assinado",
    versao: "v3",
    hash: "4b93d7e4d929a5f0a7b8828f9d7d4aab",
    periodo: "08/2026",
    responsavel: "Marina Costa",
    data: "2026-08-08",
    validade: "2026-12-31",
    categoria: "Entrada",
    preview: "Nota fiscal eletrônica referente à operação de venda no período de agosto, com chave de acesso 352608...",
    tags: ["nfe", "venda", "entrada", "assinatura"],
  },
  {
    id: "GED-002",
    cliente: "Asteria Serviços",
    cnpj: "98.765.432/0001-33",
    setor: "DP",
    tipo: "Contratos",
    nome: "Contrato_Admissao_Alessandra.pdf",
    path: "DP/Admissões e Contratos/2026",
    status: "Ativo",
    versao: "v1",
    hash: "11d2eeb6d5218ea7f537cce0f903086",
    periodo: "08/2026",
    responsavel: "Renata Lima",
    data: "2026-08-11",
    validade: "2029-08-11",
    categoria: "Contratual",
    preview: "Termo de admissão assinado com cláusulas de confidencialidade e jornada de trabalho, com dados do colaborador e da empresa.",
    tags: ["contrato", "admissao", "dp", "pessoal"],
  },
  {
    id: "GED-003",
    cliente: "Glass House LTDA",
    cnpj: "45.112.233/0001-10",
    setor: "Contábil",
    tipo: "DRE",
    nome: "DRE_2026_Q3.xlsx",
    path: "Contábil/Demonstrações Contábeis/2026/Q3",
    status: "Arquivado",
    versao: "v2",
    hash: "d1027b7947329d4ca3f2d00357f99150",
    periodo: "Q3/2026",
    responsavel: "Luan Pereira",
    data: "2026-08-14",
    validade: "2036-08-14",
    categoria: "Demonstração",
    preview: "Demonstração do resultado do exercício com receitas, despesas e margens consolidadas do trimestre.",
    tags: ["dre", "contabilidade", "trimestre", "arquivado"],
  },
  {
    id: "GED-004",
    cliente: "Blue Ocean Logística",
    cnpj: "76.334.991/0001-21",
    setor: "Fiscal",
    tipo: "DARF",
    nome: "DARF_08_2026.pdf",
    path: "Fiscal/Guias de Impostos/DARF/2026/08",
    status: "Rascunho",
    versao: "v1",
    hash: "b8e98194d0b0e1d40a4fb4807af64cff",
    periodo: "08/2026",
    responsavel: "Pedro Almeida",
    data: "2026-08-13",
    validade: "2026-09-15",
    categoria: "Tributação",
    preview: "Documento de guia de imposto com valores de tributos e data de vencimento de agosto do exercício atual.",
    tags: ["darf", "tributos", "guia", "rascunho"],
  },
  {
    id: "GED-005",
    cliente: "Vitral Indústria",
    cnpj: "88.990.421/0001-58",
    setor: "DP",
    tipo: "Férias",
    nome: "Ferias_Carlos_Moura.pdf",
    path: "DP/Folhas de Pagamento/Férias/2026",
    status: "Ativo",
    versao: "v2",
    hash: "67f3c8b9376afab52114d4f9c1f0df13",
    periodo: "08/2026",
    responsavel: "Rosa Nogueira",
    data: "2026-08-12",
    validade: "2031-08-12",
    categoria: "Folha",
    preview: "Registro de férias do colaborador Carlos Moura com dados de concessão, saldo e recibo de pagamento.",
    tags: ["ferias", "folha", "dp", "recibo"],
  },
];

export const retentionRules = [
  {
    setor: "Fiscal",
    tipo: "NF-e",
    prazo: "5 anos",
    destino: "Eliminação",
    baseLegal: "Lei 12.846/2013 e normas do Fisco",
  },
  {
    setor: "DP",
    tipo: "Prontuário do colaborador",
    prazo: "10 anos",
    destino: "Guarda permanente",
    baseLegal: "CLT / LGPD / instruções internas",
  },
  {
    setor: "Contábil",
    tipo: "Livro contábil",
    prazo: "Guarda permanente",
    destino: "Guarda permanente",
    baseLegal: "Decreto 3.000/1999 e normas societárias",
  },
];

export const certificateAlerts = [
  {
    cliente: "Nexus Contabilidade",
    certificado: "e-CNPJ A1",
    validade: "15 dias",
    status: "A vencer",
  },
  {
    cliente: "Blue Ocean Logística",
    certificado: "A3 token",
    validade: "30 dias",
    status: "A vencer",
  },
  {
    cliente: "Vitral Indústria",
    certificado: "e-CPF A1",
    validade: "90 dias",
    status: "Em alerta",
  },
];

export const auditTrail = [
  { id: "AUD-110", usuario: "Marina Costa", acao: "Upload", documento: "NF-e_004321_08_2026.pdf", data: "2026-08-08 14:35" },
  { id: "AUD-111", usuario: "Renata Lima", acao: "Assinatura digital", documento: "Contrato_Admissao_Alessandra.pdf", data: "2026-08-11 09:14" },
  { id: "AUD-112", usuario: "Luan Pereira", acao: "Arquivamento", documento: "DRE_2026_Q3.xlsx", data: "2026-08-14 18:00" },
  { id: "AUD-113", usuario: "Pedro Almeida", acao: "Visualização", documento: "DARF_08_2026.pdf", data: "2026-08-13 11:50" },
];

export const folderTree = [
  {
    setor: "Fiscal",
    items: [
      "Entradas e Saídas",
      "Guias de Impostos",
      "Declarações Acessórias",
    ],
  },
  {
    setor: "DP",
    items: [
      "Admissões e Contratos",
      "Prontuários de Colaboradores",
      "Folhas de Pagamento",
      "Encargos Trabalhistas",
    ],
  },
  {
    setor: "Contábil",
    items: [
      "Balanços e Balancetes",
      "Demonstrações Contábeis",
      "Livros Contábeis",
      "Ato Societários",
    ],
  },
];
