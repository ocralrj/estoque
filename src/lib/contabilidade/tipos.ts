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
export interface AnaliseGerada {
  contas: ContaClassificada[];
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
