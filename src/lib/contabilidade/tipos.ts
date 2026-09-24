/**
 * Tipos do módulo Contabilidade (balancetes).
 *
 * O arquivo original nunca sai do navegador: o parse acontece no cliente e só
 * estes dados estruturados sobem para o banco.
 */

export type NaturezaConta = "" | "devedora" | "credora";

export type ClassificacaoConta =
  | "ativo"
  | "passivo"
  | "patrimonio_liquido"
  | "receita"
  | "custo"
  | "despesa"
  | "outro";

/** Uma linha de conta extraída do documento. */
export interface ContaExtraida {
  codigo: string;
  descricao: string;
  natureza: NaturezaConta;
  debitos: number;
  creditos: number;
  /** Positivo = devedor, negativo = credor. */
  saldo: number;
}

/** Resultado do parse, ainda sem classificação nem cálculos. */
export interface BalanceteExtraido {
  contas: ContaExtraida[];
  /** Período identificado dentro do documento, se o parser achou datas. */
  periodoDoc: { inicio: string; fim: string } | null;
  avisos: string[];
  origem: "csv" | "xlsx" | "pdf";
  linhasLidas: number;
}

export interface ContaClassificada extends ContaExtraida {
  classificacao: ClassificacaoConta;
  grupo: string;
  /** Id da linha no banco (presente ao ler uma análise salva). */
  id?: string;
}

export interface TotaisBalancete {
  ativo: number;
  passivo: number;
  patrimonioLiquido: number;
  receitas: number;
  custos: number;
  despesas: number;
  resultado: number;
  debitos: number;
  creditos: number;
  diferencaBalanco: number;
  balanceado: boolean;
}

export interface IndicadorCalculado {
  chave: string;
  rotulo: string;
  formula: string | null;
  valor: number | null;
  interpretacao: string;
  limitacao: string | null;
}

export interface PontoAtencao {
  fato: string;
  impacto: string;
  investigar: string;
  informacao: string;
}

export interface SecoesAnalise {
  resumo: string;
  patrimonial: string;
  resultado: string;
  liquidez: string;
  endividamento: string;
  giro: string;
}

/** Análise completa pronta para salvar e exibir. */
export interface AnaliseGerada {  contas: ContaClassificada[];
  totais: TotaisBalancete;
  indicadores: IndicadorCalculado[];
  secoes: SecoesAnalise;
  pontos: PontoAtencao[];
  podeConcluir: string[];
  naoPodeConcluir: string[];
  recomendacoes: string;
  documentos: { prioridade: string; item: string }[];
  avisosValidacao: string[];
}

/**
 * Entrada do Analista Financeiro e Contábil (IA): os números já calculados
 * pelo motor determinístico, no formato que o prompt espera. Nulo = ausente;
 * a IA nunca deve inventar esses valores.
 */
export interface EntradaAnaliseContabil {
  empresa: string;
  periodo_inicial: string;
  periodo_final: string;
  ativo_total: number | null;
  ativo_circulante: number | null;
  disponibilidades: number | null;
  estoques: number | null;
  clientes: number | null;
  passivo_circulante: number | null;
  passivo_nao_circulante: number | null;
  patrimonio_liquido: number | null;
  receita_bruta: number | null;
  deducoes_receita: number | null;
  receitas_periodo: number | null;
  custos: number | null;
  despesas_operacionais: number | null;
  despesas_financeiras: number | null;
  receita_financeira: number | null;
  indicadores: {
    chave: string;
    rotulo: string;
    formula: string | null;
    valor: number | null;
    limitacao: string | null;
  }[];
  pontos_atencao: { fato: string; impacto: string }[];
  avisos_validacao: string[];
  balancete_fechado: boolean;
}
