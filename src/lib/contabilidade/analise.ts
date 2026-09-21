/**
 * Motor determinístico da análise de balancetes.
 *
 * Classifica contas (heurística documentada pelo plano brasileiro usual),
 * valida o balancete, calcula totais e indicadores e monta o relatório em
 * texto. Cada afirmação nasce de um número presente; o que falta vira item
 * explícito de "não é possível concluir".
 */

import type {
  AnaliseGerada,
  ClassificacaoConta,
  ContaClassificada,
  ContaExtraida,
  IndicadorCalculado,
  PontoAtencao,
  TotaisBalancete,
} from "./tipos";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Moeda para exibição: R$ 1.234,56 (negativo com menos). */
export function moeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function percentual(n: number): string {
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Classificação heurística: 1 ativo, 2 passivo (2.3 patrimônio), 3 receita,
 * 4+ custo quando a descrição fala em custo, senão despesa. Descrição com
 * "receita" ou "patrimônio/capital/lucros/reservas" corrige o código.
 */
export function classificarConta(codigo: string, descricao: string): ClassificacaoConta {
  const d = norm(descricao);
  const digitos = codigo.replace(/[^0-9]/g, "");
  if (/patrimonio|capital social|lucros?|prejuizos?|reservas?|acoes em tesouraria/.test(d)) {
    return "patrimonio_liquido";
  }
  if (/receita/.test(d)) return "receita";
  if (!digitos) {
    if (/custo/.test(d)) return "custo";
    if (/despesa/.test(d)) return "despesa";
    return "outro";
  }
  if (/^1/.test(digitos)) return "ativo";
  if (/^2/.test(digitos)) {
    return /^2\.?0*3/.test(codigo.replace(/\s/g, "")) || /^23/.test(digitos)
      ? "patrimonio_liquido"
      : "passivo";
  }
  if (/^3/.test(digitos)) return "receita";
  return /custo/.test(d) ? "custo" : "despesa";
}

function grupoDe(codigo: string, classificacao: ClassificacaoConta): string {
  const partes = codigo.split(".").filter(Boolean);
  if (partes.length >= 2) return `${partes[0]}.${partes[1]}`;
  return classificacao;
}

/** Prefixos de circulante no plano usual (1.1, 1.01…, 2.1, 2.01…, 2.2, 1.2). */
function casaCom(codigo: string, raiz: "1" | "2", nivel: "1" | "2"): boolean {
  const c = codigo.replace(/\s/g, "");
  return new RegExp(`^${raiz}\\.0*${nivel}(\\.|$)`).test(c);
}

function ehEstoque(c: ContaClassificada): boolean {
  return c.classificacao === "ativo" && /estoque/.test(norm(c.descricao));
}

function ehDisponivel(c: ContaClassificada): boolean {
  return (
    c.classificacao === "ativo" &&
    /caixa|banco|disponivel|aplicacao financeira|numerario/.test(norm(c.descricao))
  );
}

function ehClientes(c: ContaClassificada): boolean {
  return (
    c.classificacao === "ativo" &&
    /clientes?|contas a receber|duplicatas a receber/.test(norm(c.descricao))
  );
}

/** Abertura para os gráficos: só usa contas reais, sem estimar nada. */
export interface ComposicaoPatrimonial {
  ac: number;
  anc: number;
  pc: number;
  pnc: number;
  estoques: number;
  disponivel: number;
  clientes: number;
}

export function composicao(contas: ContaClassificada[]): ComposicaoPatrimonial {
  return {
    ac: soma(contas, (c) => casaCom(c.codigo, "1", "1")),
    anc: soma(contas, (c) => casaCom(c.codigo, "1", "2")),
    pc: soma(contas, (c) => casaCom(c.codigo, "2", "1")),
    pnc: soma(contas, (c) => casaCom(c.codigo, "2", "2")),
    estoques: soma(contas, ehEstoque),
    disponivel: soma(contas, ehDisponivel),
    clientes: soma(contas, ehClientes),
  };
}

function soma(contas: ContaClassificada[], pred: (c: ContaClassificada) => boolean): number {
  return contas.filter(pred).reduce((acc, c) => acc + Math.abs(c.saldo), 0);
}

export interface BalanceteClassificado {
  contas: ContaClassificada[];
  /** Contas que caíram em "outro" e merecem revisão manual. */
  semClasse: ContaClassificada[];
}

export function classificarContas(extraidas: ContaExtraida[]): BalanceteClassificado {
  const contas = extraidas.map((c) => {
    const classificacao = classificarConta(c.codigo, c.descricao);
    return { ...c, classificacao, grupo: grupoDe(c.codigo, classificacao) };
  });
  return { contas, semClasse: contas.filter((c) => c.classificacao === "outro") };
}

export function calcularTotais(contas: ContaClassificada[]): TotaisBalancete {
  const por = (cl: ClassificacaoConta) =>
    contas.filter((c) => c.classificacao === cl).reduce((a, c) => a + Math.abs(c.saldo), 0);
  const ativo = por("ativo");
  const passivo = por("passivo");
  const patrimonioLiquido = por("patrimonio_liquido");
  const receitas = por("receita");
  const custos = por("custo");
  const despesas = por("despesa");
  const debitos = contas.reduce((a, c) => a + c.debitos, 0);
  const creditos = contas.reduce((a, c) => a + c.creditos, 0);
  const diferencaBalanco = debitos - creditos;
  return {
    ativo,
    passivo,
    patrimonioLiquido,
    receitas,
    custos,
    despesas,
    resultado: receitas - custos - despesas,
    debitos,
    creditos,
    diferencaBalanco,
    balanceado: Math.abs(diferencaBalanco) < 0.01,
  };
}

interface BaseIndicadores {
  ac: number;
  anc: number;
  pc: number;
  pnc: number;
  pl: number;
  estoques: number;
  temCirculante: boolean;
}

/** Indicadores só com dados suficientes; o resto volta com limitação. */
export function calcularIndicadores(
  contas: ContaClassificada[],
  t: TotaisBalancete
): { indicadores: IndicadorCalculado[]; base: BaseIndicadores } {
  const ac = soma(contas, (c) => casaCom(c.codigo, "1", "1"));
  const anc = soma(contas, (c) => casaCom(c.codigo, "1", "2"));
  const pc = soma(contas, (c) => casaCom(c.codigo, "2", "1"));
  const pnc = soma(contas, (c) => casaCom(c.codigo, "2", "2"));
  const pl = t.patrimonioLiquido;
  const estoques = soma(contas, ehEstoque);
  const temCirculante = ac > 0 && pc > 0;
  const semAbertura =
    "O balancete não traz abertura de circulante (grupos 1.1 e 2.1).";

  const ind: IndicadorCalculado[] = [];
  const por = (
    chave: string,
    rotulo: string,
    formula: string,
    valor: number | null,
    interpretacao: string,
    limitacao: string | null = null
  ) => ind.push({ chave, rotulo, formula, valor, interpretacao, limitacao });

  if (temCirculante) {
    const lc = ac / pc;
    por(
      "liquidez_corrente",
      "Liquidez corrente",
      "Ativo Circulante / Passivo Circulante",
      lc,
      `Para cada R$ 1,00 devido no curto prazo há ${moeda(lc)} em bens e direitos de curto prazo.`
    );
    const ls = (ac - estoques) / pc;
    por(
      "liquidez_seca",
      "Liquidez seca",
      "(Ativo Circulante − Estoques) / Passivo Circulante",
      ls,
      `Sem contar o estoque (que precisa ser vendido), há ${moeda(ls)} para cada R$ 1,00 de curto prazo.`,
      estoques === 0 ? "Nenhuma conta de estoque identificada; equivale à corrente." : null
    );
  } else {
    por("liquidez_corrente", "Liquidez corrente", "Ativo Circulante / Passivo Circulante", null, "", semAbertura);
    por("liquidez_seca", "Liquidez seca", "(Ativo Circulante − Estoques) / Passivo Circulante", null, "", semAbertura);
  }

  if (pc + pnc > 0 && ac + anc > 0) {
    const lg = (ac + anc) / (pc + pnc);
    por(
      "liquidez_geral",
      "Liquidez geral",
      "(Ativo Circulante + Ativo Não Circulante) / (Passivo Circulante + Passivo Não Circulante)",
      lg,
      `Considerando todos os prazos, há ${moeda(lg)} em ativos para cada R$ 1,00 de obrigações.`
    );
  } else {
    por("liquidez_geral", "Liquidez geral", "Ativos totais / Obrigações totais", null, "", semAbertura);
  }

  if (t.ativo > 0) {
    const end = (pc + pnc) / t.ativo;
    por(
      "endividamento_total",
      "Endividamento total",
      "(Passivo Circulante + Passivo Não Circulante) / Ativo Total",
      end,
      `${percentual(end)} dos ativos é financiado por capital de terceiros.`
    );
  } else {
    por("endividamento_total", "Endividamento total", "Capital de terceiros / Ativo Total", null, "", "Ativo total zerado no balancete.");
  }

  if (pl > 0 && pc + pnc > 0) {
    const pct = (pc + pnc) / pl;
    por(
      "participacao_terceiros",
      "Participação de capital de terceiros",
      "Capital de terceiros / Patrimônio Líquido",
      pct,
      `Para cada R$ 1,00 próprio há ${moeda(pct)} de terceiros.`
    );
  } else {
    por(
      "participacao_terceiros",
      "Participação de capital de terceiros",
      "Capital de terceiros / Patrimônio Líquido",
      null,
      "",
      pl <= 0 ? "Patrimônio líquido zerado ou negativo: a divisão não faz sentido." : semAbertura
    );
  }

  if (pc + pnc > 0) {
    const conc = pc / (pc + pnc);
    por(
      "concentracao_curto_prazo",
      "Concentração no curto prazo",
      "Passivo Circulante / Capital de terceiros",
      conc,
      `${percentual(conc)} das dívidas vencem no curto prazo.`
    );
  }

  if (t.receitas > 0) {
    const margem = t.resultado / t.receitas;
    por(
      "margem_liquida",
      "Margem líquida",
      "Resultado / Receitas",
      margem,
      `De cada R$ 100,00 de receita sobram ${moeda(margem * 100)} de resultado.`
    );
  } else {
    por("margem_liquida", "Margem líquida", "Resultado / Receitas", null, "", "Sem receitas no período: não há base para margem.");
  }

  return { indicadores: ind, base: { ac, anc, pc, pnc, pl, estoques, temCirculante } };
}

/** Monta o relatório completo a partir dos números. */
export function gerarAnalise(
  contas: ContaClassificada[],
  empresaNome: string,
  periodo: string
): AnaliseGerada {
  const t = calcularTotais(contas);
  const { indicadores, base } = calcularIndicadores(contas, t);
  const avisosValidacao: string[] = [];
  if (!t.balanceado) {
    avisosValidacao.push(
      `Débitos (${moeda(t.debitos)}) e créditos (${moeda(t.creditos)}) não fecham: diferença de ${moeda(Math.abs(t.diferencaBalanco))}. Confira o arquivo com a contabilidade antes de usar este resultado.`
    );
  }
  const semClasse = contas.filter((c) => c.classificacao === "outro");
  if (semClasse.length > 0) {
    avisosValidacao.push(
      `${semClasse.length} conta(s) sem classificação (${semClasse.slice(0, 3).map((c) => c.descricao).join("; ")}${semClasse.length > 3 ? "…" : ""}). Os totais as ignoram; revise com a contabilidade.`
    );
  }

  const disponivel = soma(contas, ehDisponivel);
  const clientes = soma(contas, ehClientes);
  const estoques = soma(contas, ehEstoque);
  const capitalGiro = base.ac - base.pc;

  const partesResumo = [
    `${empresaNome}, período ${periodo}: ativo de ${moeda(t.ativo)}, obrigações de ${moeda(base.pc + base.pnc)} e patrimônio líquido de ${moeda(t.patrimonioLiquido)}.`,
  ];
  if (t.receitas > 0 || t.custos + t.despesas > 0) {
    partesResumo.push(
      `No resultado, receitas de ${moeda(t.receitas)} contra ${moeda(t.custos + t.despesas)} de custos e despesas: ${t.resultado >= 0 ? "lucro" : "prejuízo"} de ${moeda(Math.abs(t.resultado))}.`
    );
  } else {
    partesResumo.push("O balancete não traz movimento de resultado no período.");
  }
  if (base.temCirculante) {
    partesResumo.push(
      capitalGiro >= 0
        ? `O curto prazo fecha positivo em ${moeda(capitalGiro)}.`
        : `O curto prazo fecha negativo em ${moeda(Math.abs(capitalGiro))}: atenção ao caixa.`
    );
  }

  const partesPatrimonial = [
    `O ativo soma ${moeda(t.ativo)}.`,
  ];
  if (base.ac > 0) {
    const fatias: string[] = [];
    if (disponivel > 0) fatias.push(`disponibilidades ${moeda(disponivel)}`);
    if (clientes > 0) fatias.push(`clientes ${moeda(clientes)}`);
    if (estoques > 0) fatias.push(`estoques ${moeda(estoques)}`);
    partesPatrimonial.push(
      fatias.length > 0
        ? `No curto prazo (${moeda(base.ac)}): ${fatias.join(", ")}.`
        : `O curto prazo soma ${moeda(base.ac)}.`
    );
  }
  if (base.anc > 0) partesPatrimonial.push(`O não circulante soma ${moeda(base.anc)}.`);
  partesPatrimonial.push(
    `Do outro lado: ${moeda(base.pc)} vencem no curto prazo, ${moeda(base.pnc)} no longo prazo e ${moeda(t.patrimonioLiquido)} é patrimônio líquido.`
  );

  const partesResultado =
    t.receitas > 0 || t.custos + t.despesas > 0
      ? [
          `Receitas de ${moeda(t.receitas)}, custos de ${moeda(t.custos)} e despesas de ${moeda(t.despesas)}.`,
          `Resultado do período: ${t.resultado >= 0 ? "lucro" : "prejuízo"} de ${moeda(Math.abs(t.resultado))}${t.receitas > 0 ? ` (${percentual(t.resultado / t.receitas)} da receita)` : ""}.`,
        ]
      : ["Sem movimento de receitas, custos ou despesas no período: não há resultado a analisar."];

  const lc = indicadores.find((i) => i.chave === "liquidez_corrente");
  const partesLiquidez =
    lc && lc.valor !== null
      ? [
          `Liquidez corrente de ${lc.valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}: para cada R$ 1,00 de curto prazo há ${moeda(lc.valor)} de recursos curtos.`,
          "Índice isolado não carimba saúde financeira: prazos de recebimento e pagamento decidem o caixa.",
        ]
      : ["Sem abertura de circulante não dá para medir liquidez com segurança."];

  const end = indicadores.find((i) => i.chave === "endividamento_total");
  const partesEndividamento =
    end && end.valor !== null
      ? [
          `${percentual(end.valor)} do ativo é financiado por terceiros.`,
          base.pc + base.pnc > 0 && base.pc / (base.pc + base.pnc) > 0.8
            ? "Quase toda a dívida vence no curto prazo: a pressão sobre o caixa é imediata."
            : "Acompanhe o vencimento das parcelas para não surpreender o caixa.",
        ]
      : ["Sem obrigações identificadas não há endividamento a medir."];

  const partesGiro = base.temCirculante
    ? [
        `Capital de giro (curto prazo menos curto prazo devido): ${moeda(capitalGiro)}.`,
        "Lucro contábil não é caixa: o resultado pode existir enquanto o dinheiro está preso em clientes e estoque.",
      ]
    : ["Sem abertura de circulante não dá para medir capital de giro."];

  const pontos: PontoAtencao[] = [];
  if (!t.balanceado) {
    pontos.push({
      fato: "Débitos e créditos não conferem.",
      impacto: "Totais e indicadores podem estar distorcidos.",
      investigar: "Lançamentos do período e o arquivo de origem.",
      informacao: "Balancete conferido pela contabilidade.",
    });
  }
  if (base.temCirculante && capitalGiro < 0) {
    pontos.push({
      fato: `Passivo circulante supera o ativo circulante em ${moeda(Math.abs(capitalGiro))}.`,
      impacto: "Risco de aperto de caixa no curto prazo.",
      investigar: "Prazos de recebimento, pagamento erenegociações.",
      informacao: "Contas a receber, contas a pagar e extratos.",
    });
  }
  if (t.patrimonioLiquido < 0) {
    pontos.push({
      fato: "Patrimônio líquido negativo.",
      impacto: "Prejuízos acumulados consumiram o capital próprio.",
      investigar: "Histórico de resultados e aportes.",
      informacao: "Balancetes anteriores e composição do PL.",
    });
  }
  if (t.resultado < 0 && (t.receitas > 0 || t.custos + t.despesas > 0)) {
    pontos.push({
      fato: `Prejuízo de ${moeda(Math.abs(t.resultado))} no período.`,
      impacto: "Corrói o patrimônio se repetir.",
      investigar: "Custos e despesas por grupo e margem por receita.",
      informacao: "DRE detalhada e razão das principais contas.",
    });
  }
  if (semClasse.length > 0) {
    pontos.push({
      fato: `${semClasse.length} conta(s) sem classificação automática.`,
      impacto: "Totais por grupo ficam incompletos.",
      investigar: "Plano de contas usado pela contabilidade.",
      informacao: "Plano de contas e razão.",
    });
  }

  const podeConcluir = [
    "Estrutura patrimonial e de resultado a partir das contas classificadas.",
    ...(base.temCirculante ? ["Liquidez e capital de giro de curto prazo."] : []),
    ...(t.receitas > 0 ? ["Margem sobre a receita do período."] : []),
  ];
  const naoPodeConcluir = [
    "Fluxo de caixa: o balancete, isoladamente, não representa o fluxo de caixa.",
    "Capacidade futura de pagamento sem contas a receber, a pagar e extratos.",
    "Situação tributária sem as obrigações e guias.",
    "Causas operacionais do resultado sem DRE, razão e relatórios gerenciais.",
  ];

  const recomendacoes = [
    pontos.length > 0
      ? "Tratar os pontos de atenção acima com a contabilidade antes de decidir com estes números."
      : "Manter a rotina mensal de balancetes para acompanhar a evolução.",
    "Comparar com o mês anterior assim que houver dois períodos (análise horizontal).",
    "Separar o acompanhamento de caixa (recebimentos e pagamentos) do resultado contábil.",
  ].join(" ");

  return {
    contas,
    totais: t,
    indicadores,
    secoes: {
      resumo: partesResumo.join(" "),
      patrimonial: partesPatrimonial.join(" "),
      resultado: partesResultado.join(" "),
      liquidez: partesLiquidez.join(" "),
      endividamento: partesEndividamento.join(" "),
      giro: partesGiro.join(" "),
    },
    pontos,
    podeConcluir,
    naoPodeConcluir,
    recomendacoes,
    documentos: [
      { prioridade: "Essenciais", item: "Balanço Patrimonial e DRE do período" },
      { prioridade: "Essenciais", item: "Balancete do mês anterior (comparação)" },
      { prioridade: "Importantes", item: "Razão das principais contas" },
      { prioridade: "Importantes", item: "Contas a receber e contas a pagar" },
      { prioridade: "Importantes", item: "Extratos bancários e posição de empréstimos" },
      { prioridade: "Complementares", item: "Relatório de estoque e faturamento" },
      { prioridade: "Complementares", item: "Notas explicativas da contabilidade" },
    ],
    avisosValidacao,
  };
}
