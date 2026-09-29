import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirPermissao } from "@/lib/permissoes";
import { listarEvolucaoEmpresa, obterAnalise, type PontoEvolucao } from "@/app/actions/contabilidade";
import Tooltip from "@/components/ui/Tooltip";
import { formatDate, formatDateTime } from "@/lib/labels";
import BotaoImprimir from "./BotaoImprimir";

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function num2(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function pct1(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Rosca de composição: só fatias com valor real. */
function Rosca({ fatias }: { fatias: { rotulo: string; valor: number; cor: string }[] }) {
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  if (total <= 0) return null;
  const R = 54;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label="Composição">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="20" stroke="var(--neo-flat)" />
        {fatias.map((f) => {
          const fracao = f.valor / total;
          const el = (
            <circle
              key={f.rotulo}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              strokeWidth="20"
              stroke={f.cor}
              strokeDasharray={`${fracao * C} ${C}`}
              strokeDashoffset={-acumulado * C}
              transform="rotate(-90 70 70)"
            >
              <title>{`${f.rotulo}: ${brl(f.valor)}`}</title>
            </circle>
          );
          acumulado += fracao;
          return el;
        })}
      </svg>
      <ul className="space-y-1 text-sm">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2 text-[var(--text)]">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: f.cor }}
              aria-hidden
            />
            {f.rotulo} — <strong>{brl(f.valor)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra horizontal proporcional a uma referência. */
function Barra({
  rotulo,
  valor,
  referencia,
  cor,
  detalhe,
}: {
  rotulo: string;
  valor: number;
  referencia: number;
  cor: string;
  detalhe?: string;
}) {
  const largura = referencia > 0 ? Math.min(100, (valor / referencia) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-[var(--text-muted)]">{rotulo}</span>
        <strong className="text-[var(--text)]">
          {brl(valor)}
          {detalhe ? <span className="font-normal text-[var(--text-muted)]"> {detalhe}</span> : null}
        </strong>
      </div>
      <div
        className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--neo-flat)]"
        role="img"
        aria-label={`${rotulo}: ${brl(valor)}`}
      >
        <div className="h-full rounded-full" style={{ width: `${largura}%`, background: cor }} />
      </div>
    </div>
  );
}
function rotuloPeriodo(dataISO: string): string {
  return `${dataISO.slice(5, 7)}/${dataISO.slice(2, 4)}`;
}

function compacto(v: number): string {
  return v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
}

/**
 * Receitas × resultado por período (barras agrupadas, SVG próprio).
 * Só números determinísticos: a IA nunca alimenta gráfico.
 */
function BarrasEvolucao({ pontos }: { pontos: PontoEvolucao[] }) {
  const lista = pontos.slice(-8);
  const W = 640;
  const H = 240;
  const base = 200;
  const teto = 16;
  const maxAbs = Math.max(1, ...lista.flatMap((p) => [Math.abs(p.receitas), Math.abs(p.resultado)]));
  const escala = (base - teto) / maxAbs;
  const passo = W / lista.length;
  const larg = Math.min(34, passo / 3);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Receitas e resultado por período">
        <line x1="0" y1={base} x2={W} y2={base} stroke="var(--neo-line)" strokeWidth="1" />
        {lista.map((p, i) => {
          const cx = passo * i + passo / 2;
          const hRec = Math.max(1, Math.abs(p.receitas) * escala);
          const hRes = Math.max(1, Math.abs(p.resultado) * escala);
          return (
            <g key={p.id}>
              <rect x={cx - larg - 2} y={p.receitas >= 0 ? base - hRec : base} width={larg} height={hRec} fill="var(--primary)" rx="3">
                <title>{`Receita ${rotuloPeriodo(p.periodo_fim)}: ${brl(p.receitas)}`}</title>
              </rect>
              <rect
                x={cx + 2}
                y={p.resultado >= 0 ? base - hRes : base}
                width={larg}
                height={hRes}
                fill={p.resultado >= 0 ? "var(--ok-solid)" : "var(--erro-solid)"}
                rx="3"
              >
                <title>{`Resultado ${rotuloPeriodo(p.periodo_fim)}: ${brl(p.resultado)}`}</title>
              </rect>
              <text x={cx} y={H - 2} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
                {rotuloPeriodo(p.periodo_fim)}
              </text>
            </g>
          );
        })}
        <text x="2" y={teto} fontSize="11" fill="var(--text-muted)">{compacto(maxAbs)}</text>
        <text x="2" y={base - 4} fontSize="11" fill="var(--text-muted)">0</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--primary)" }} aria-hidden /> Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--ok-solid)" }} aria-hidden /> Resultado (verde = lucro, vermelho = prejuízo)
        </span>
      </div>
    </div>
  );
}

/** Liquidez corrente por período, com linha de referência em 1,00. */
function LinhaLiquidez({ pontos }: { pontos: PontoEvolucao[] }) {
  const comIndice = pontos.slice(-8).filter((p) => p.liquidez_corrente !== null);
  if (comIndice.length < 2) return null;
  const W = 640;
  const H = 200;
  const margem = { topo: 16, base: 28, lat: 44 };
  const vals = [...comIndice.map((p) => p.liquidez_corrente as number), 1];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const folga = Math.max(0.1, (max - min) * 0.2);
  const lo = min - folga;
  const hi = max + folga;
  const x = (i: number) =>
    comIndice.length === 1
      ? W / 2
      : margem.lat + (i * (W - margem.lat * 2)) / (comIndice.length - 1);
  const y = (v: number) =>
    margem.topo + (1 - (v - lo) / (hi - lo)) * (H - margem.topo - margem.base);
  const trilha = comIndice.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.liquidez_corrente as number)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Liquidez corrente por período">
        <line x1={margem.lat} y1={y(1)} x2={W - margem.lat} y2={y(1)} stroke="var(--erro-solid)" strokeWidth="1" strokeDasharray="5 4" />
        <text x={W - margem.lat + 4} y={y(1) + 4} fontSize="11" fill="var(--erro-solid)">1,00</text>
        <path d={trilha} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        {comIndice.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.liquidez_corrente as number)} r="4" fill="var(--primary)">
              <title>{`Liquidez ${rotuloPeriodo(p.periodo_fim)}: ${num2(p.liquidez_corrente as number)}`}</title>
            </circle>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
              {rotuloPeriodo(p.periodo_fim)}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Linha tracejada em 1,00: abaixo dela, as obrigações de curto prazo superam os recursos curtos.
      </p>
    </div>
  );
}

/** Composição do financiamento em barra 100%: curto, longo e próprio. */
function BarraFinanciamento({ pc, pnc, pl }: { pc: number; pnc: number; pl: number }) {
  const total = pc + pnc + Math.max(0, pl);
  if (total <= 0) return null;
  const fatias = [
    { rotulo: "Curto prazo", valor: pc, cor: "var(--primary)" },
    { rotulo: "Longo prazo", valor: pnc, cor: "var(--text-muted)" },
    { rotulo: "Patrimônio líquido", valor: Math.max(0, pl), cor: "var(--ok-solid)" },
  ];
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--neo-flat)]" role="img" aria-label="Composição do financiamento">
        {fatias.map((f) => (
          <div key={f.rotulo} style={{ width: `${(f.valor / total) * 100}%`, background: f.cor }} title={`${f.rotulo}: ${brl(f.valor)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
        {fatias.map((f) => (
          <span key={f.rotulo} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: f.cor }} aria-hidden />
            {f.rotulo} — <strong className="text-[var(--text)]">{pct1(total > 0 ? f.valor / total : 0)}</strong>
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        De onde vem cada R$ 100,00 que financia a empresa: dívida curta, dívida longa e capital próprio.
      </p>
    </div>
  );
}

function CartaoIndicador({
  titulo,
  valor,
  subtitulo,
  dica,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  dica?: string;
}) {
  const corpo = (
    <div className="neo-card p-5">
      <p className="text-sm text-[var(--text-muted)]">{titulo}</p>
      <p className="mt-2 text-2xl font-black text-[var(--text)]">{valor}</p>
      {subtitulo && <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitulo}</p>}
    </div>
  );
  return dica ? (
    <Tooltip lado="cima" texto={dica} className="block">
      {corpo}
    </Tooltip>
  ) : (
    corpo
  );
}

export default async function ResultadoBalancetePage({
  params,
}: {
  params: { id: string };
}) {
  await exigirPermissao("contabilidade", "balancetes", "read");
  const res = await obterAnalise(params.id);
  if (!res.ok) redirect("/dashboard/contabilidade/balancetes");
  const a = res.data;
  if (a.status !== "processado" || !a.resultado) {
    redirect("/dashboard/contabilidade/balancetes");
  }
  const r = a.resultado;
  const t = a.totais;
  const ativo = n(t.ativo);
  const receitas = n(t.receitas);
  const custos = n(t.custos);
  const despesas = n(t.despesas);
  const resultado = n(t.resultado);
  const ac = n(t.ac);
  const anc = n(t.anc);
  const pc = n(t.pc);
  const pnc = n(t.pnc);
  const pl = n(t.patrimonioLiquido);
  const passivo = pc + pnc;
  const temMovimento = receitas > 0 || custos + despesas > 0;

  const ind = (chave: string) => a.indicadores.find((i) => i.chave === chave);
  const lc = ind("liquidez_corrente");
  const margem = ind("margem_liquida");
  const end = ind("endividamento_total");

  const emprestimos = a.contas
    .filter(
      (c) =>
        c.classificacao === "passivo" &&
        /emprestimo|financiamento/.test(
          c.descricao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        ) &&
        Math.abs(c.saldo) > 0
    )
    .sort((x, y) => Math.abs(y.saldo) - Math.abs(x.saldo))
    .slice(0, 5);

  const principais = [...a.contas]
    .sort((x, y) => Math.abs(y.saldo) - Math.abs(x.saldo))
    .slice(0, 12);
  const baseGrupo = (cl: string) =>
    cl === "ativo" ? ativo : cl === "receita" ? receitas : passivo + pl;

  const evolucao = await listarEvolucaoEmpresa(a.empresa_id);
  const pontos = evolucao.ok ? evolucao.data : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Análise Contábil</p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{a.empresa_nome}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {a.empresa_cnpj ? `${a.empresa_cnpj} · ` : ""}Período{" "}
            {formatDate(a.periodo_inicio)} a {formatDate(a.periodo_fim)} · Analisado em{" "}
            {formatDateTime(a.created_at)} ·{" "}
            <span className="neo-sit neo-sit--ok">Processado</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/contabilidade/balancetes"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--neo-flat-alt)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:brightness-95"
          >
            Voltar para Balancetes
          </Link>
          <BotaoImprimir />
          <Link
            href="/dashboard/contabilidade/balancetes/nova"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] hover:brightness-110"
          >
            Nova Análise
          </Link>
        </div>
      </div>

      <section className="neo-card border-l-4 border-l-[var(--primary)] p-6">
        <h2 className="text-lg font-bold text-[var(--text)]">Resumo Executivo</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{r.resumo}</p>
      </section>

      {r.interpretacaoIa && (
        <section className="neo-card border-l-4 border-l-[var(--ok-solid)] p-6">
          <h2 className="text-lg font-bold text-[var(--text)]">Interpretação por IA</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Gerada por {r.interpretacaoIa.modelo} — texto revisável na origem, vale o que está gravado aqui.
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
            {r.interpretacaoIa.texto}
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {receitas > 0 && (
          <CartaoIndicador titulo="Receita" valor={brl(receitas)} dica="Soma das contas de receita no período." />
        )}
        {temMovimento && (
          <CartaoIndicador
            titulo="Resultado"
            valor={brl(resultado)}
            subtitulo={resultado >= 0 ? "Lucro" : "Prejuízo"}
            dica="Receitas menos custos e despesas do período."
          />
        )}
        <CartaoIndicador titulo="Ativo Total" valor={brl(ativo)} dica="Soma das contas de ativo." />
        <CartaoIndicador
          titulo="Passivo Total"
          valor={brl(passivo)}
          subtitulo="Curto + longo prazo"
          dica="Soma das obrigações de curto e longo prazo."
        />
        <CartaoIndicador
          titulo="Patrimônio Líquido"
          valor={brl(pl)}
          dica="Capital próprio: o que sobra aos sócios."
        />
        {end && end.valor !== null ? (
          <CartaoIndicador
            titulo="Endividamento"
            valor={pct1(end.valor)}
            subtitulo="Capital de terceiros / Ativo"
            dica={`${end.formula ?? ""} Resultado: ${pct1(end.valor)}`}
          />
        ) : (
          <CartaoIndicador titulo="Endividamento" valor="Não disponível" subtitulo="Dados insuficientes" />
        )}
        {lc && lc.valor !== null ? (
          <CartaoIndicador
            titulo="Liquidez Corrente"
            valor={num2(lc.valor)}
            dica={`${lc.formula ?? ""} Resultado: ${num2(lc.valor)}`}
          />
        ) : (
          <CartaoIndicador titulo="Liquidez Corrente" valor="Não disponível" subtitulo="Dados insuficientes" />
        )}
        {margem && margem.valor !== null ? (
          <CartaoIndicador
            titulo="Margem de Resultado"
            valor={pct1(margem.valor)}
            dica={`${margem.formula ?? ""} Resultado: ${pct1(margem.valor)}`}
          />
        ) : (
          <CartaoIndicador titulo="Margem de Resultado" valor="Não disponível" subtitulo="Dados insuficientes" />
        )}
      </div>

      {pontos.length >= 2 && (
        <section className="neo-card space-y-6 p-6">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">Evolução entre períodos</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Análise horizontal: a direção dos últimos períodos vale mais que o número isolado deste mês.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold text-[var(--text)]">Receitas × resultado</h3>
            <BarrasEvolucao pontos={pontos} />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Barra final verde é lucro; vermelha é prejuízo. Compare a altura das receitas com a do resultado.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold text-[var(--text)]">Liquidez corrente</h3>
            <LinhaLiquidez pontos={pontos} />
          </div>
        </section>
      )}

      {(ac + anc > 0 || passivo + pl > 0) && (
        <section className="neo-card p-6">
          <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Estrutura Patrimonial</h2>
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Como o dinheiro está dividido. O ideal varia por setor — o que manda é a mudança entre períodos, na evolução acima.
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {ac + anc > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--text)]">Ativo: {brl(ativo)}</h3>
                <Rosca
                  fatias={[
                    { rotulo: "Circulante", valor: ac, cor: "var(--primary)" },
                    { rotulo: "Não circulante", valor: anc, cor: "var(--text-muted)" },
                  ]}
                />
              </div>
            )}
            {passivo + pl > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--text)]">
                  Obrigações e patrimônio: {brl(passivo + pl)}
                </h3>
                <Rosca
                  fatias={[
                    { rotulo: "Curto prazo", valor: pc, cor: "var(--primary)" },
                    { rotulo: "Longo prazo", valor: pnc, cor: "var(--text-muted)" },
                    { rotulo: "Patrimônio líquido", valor: pl, cor: "var(--ok-solid)" },
                  ]}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {temMovimento && (
        <section className="neo-card space-y-3 p-6">
          <h2 className="text-lg font-bold text-[var(--text)]">Resultado</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Da receita saem custos e despesas. Barra final verde é lucro; vermelha, prejuízo — que corrói o patrimônio se repetir.
          </p>
          <Barra rotulo="Receita" valor={receitas} referencia={receitas} cor="var(--primary)" />
          <Barra rotulo="(−) Custos" valor={custos} referencia={receitas} cor="var(--text-muted)" />
          <Barra rotulo="(−) Despesas" valor={despesas} referencia={receitas} cor="var(--text-muted)" />
          <Barra
            rotulo="Resultado"
            valor={Math.abs(resultado)}
            referencia={receitas}
            cor={resultado >= 0 ? "var(--ok-solid)" : "var(--erro-solid)"}
            detalhe={resultado >= 0 ? "(lucro)" : "(prejuízo)"}
          />
        </section>
      )}

      <section className="neo-card space-y-4 p-6">
        <h2 className="text-lg font-bold text-[var(--text)]">Indicadores de Liquidez</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Quanto a empresa tem para cada R$ 1,00 de obrigação. Índice isolado não carimba saúde: prazos de recebimento e pagamento decidem o caixa.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["liquidez_corrente", "liquidez_seca", "liquidez_geral"] as const).map((chave) => {
            const item = ind(chave);
            if (!item) return null;
            return (
              <div key={chave} className="neo-flat rounded-2xl p-4">
                <p className="text-sm font-bold text-[var(--text)]">{item.rotulo}</p>
                <p className="mt-1 text-2xl font-black text-[var(--text)]">
                  {item.valor !== null ? num2(item.valor) : "Não disponível"}
                </p>
                {item.valor !== null ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{item.interpretacao}</p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Não disponível — dados insuficientes. {item.limitacao}
                  </p>
                )}
                {item.formula && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Fórmula: {item.formula}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="neo-card space-y-3 p-6">
        <h2 className="text-lg font-bold text-[var(--text)]">Estrutura de Endividamento</h2>
        <BarraFinanciamento pc={pc} pnc={pnc} pl={pl} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="neo-flat rounded-2xl p-4">
            <p className="text-sm text-[var(--text-muted)]">Curto prazo</p>
            <p className="mt-1 text-xl font-black text-[var(--text)]">{brl(pc)}</p>
          </div>
          <div className="neo-flat rounded-2xl p-4">
            <p className="text-sm text-[var(--text-muted)]">Longo prazo</p>
            <p className="mt-1 text-xl font-black text-[var(--text)]">{brl(pnc)}</p>
          </div>
          <div className="neo-flat rounded-2xl p-4">
            <p className="text-sm text-[var(--text-muted)]">Patrimônio líquido</p>
            <p className="mt-1 text-xl font-black text-[var(--text)]">{brl(pl)}</p>
          </div>
        </div>
        {emprestimos.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-bold text-[var(--text)]">
              Empréstimos e financiamentos identificados
            </h3>
            <ul className="space-y-1 text-sm text-[var(--text)]">
              {emprestimos.map((c, ei) => (<li key={c.id ?? ei} className="flex justify-between gap-3">
                  <span className="truncate">
                    {c.codigo ? `${c.codigo} — ` : ""}
                    {c.descricao}
                  </span>
                  <strong>{brl(Math.abs(c.saldo))}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {r.pontos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[var(--text)]">Pontos de Atenção</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {r.pontos.map((p, i) => (
              <div key={i} className="neo-card border-l-4 border-l-[var(--aviso-fg)] p-5">
                <p className="font-bold text-[var(--text)]">{p.fato}</p>
                <p className="mt-1 text-sm text-[var(--text)]">
                  <strong>Impacto:</strong> {p.impacto}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  <strong>Investigar:</strong> {p.investigar} · <strong>Fonte:</strong>{" "}
                  {p.informacao}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.naoPode.length > 0 && (
        <section className="rounded-2xl border border-dashed border-[var(--neo-line)] p-6">
          <h2 className="text-lg font-bold text-[var(--text)]">Limitações da Análise</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            {r.naoPode.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="neo-card p-6">
        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Análise Detalhada</h2>
        <div className="space-y-2">
          {(
            [
              ["Balanço Patrimonial", r.patrimonial],
              ["Resultado", r.resultado],
              ["Liquidez", r.liquidez],
              ["Endividamento", r.endividamento],
              ["Capital de Giro", r.giro],
              ["Recomendações", r.recomendacoes],
            ] as const
          ).map(([titulo, texto]) => (
            <details
              key={titulo}
              className="rounded-2xl border border-[var(--neo-line)] px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-bold text-[var(--text)]">
                {titulo}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{texto}</p>
            </details>
          ))}
          <details className="rounded-2xl border border-[var(--neo-line)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold text-[var(--text)]">
              Principais Contas
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                    <th className="py-2 pr-4">Conta</th>
                    <th className="py-2 pr-4">Grupo</th>
                    <th className="py-2 pr-4 text-right">Saldo</th>
                    <th className="py-2 text-right">Participação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--neo-line)]">
                  {principais.map((c, pi) => {
                    const base = baseGrupo(c.classificacao);
                    return (
                      <tr key={c.id ?? pi}>
                        <td className="py-2 pr-4 text-[var(--text)]">
                          {c.codigo ? `${c.codigo} — ` : ""}
                          {c.descricao}
                        </td>
                        <td className="py-2 pr-4 text-[var(--text-muted)]">{c.grupo}</td>
                        <td className="py-2 pr-4 text-right text-[var(--text)]">
                          {brl(Math.abs(c.saldo))}
                        </td>
                        <td className="py-2 text-right text-[var(--text-muted)]">
                          {base > 0 ? pct1(Math.abs(c.saldo) / base) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          {r.pode.length > 0 && (
            <details className="rounded-2xl border border-[var(--neo-line)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-bold text-[var(--text)]">
                O que dá para concluir
              </summary>
              <ul className="mt-2 list-inside list-disc text-sm text-[var(--text)]">
                {r.pode.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
