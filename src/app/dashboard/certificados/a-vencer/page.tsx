import Link from "next/link";
import { exigirPermissao } from "@/lib/permissoes";
import {
  listarCertificados,
  listarEmpresas,
  type Certificado,
  type Empresa,
} from "@/app/actions/certificados";
import { formatDate, formatDateTime } from "@/lib/labels";
import BotaoImprimir from "./BotaoImprimir";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

type Linha = Certificado & {
  dias: number;
  situacao: string;
  classe: string;
  telefone: string | null;
  email: string | null;
  situacaoCadastral: string | null;
};

/**
 * Mesma régua da tela de certificados (vencido, vence em até 30 dias, atenção
 * até 90), mas contada a partir do último dia do mês de referência — é o que
 * permite reemitir o relatório de um mês passado ou projetar um futuro.
 */
function situacaoNaBase(
  validadeFim: string,
  base: string
): { dias: number; texto: string; classe: string } {
  const dias = Math.round(
    (new Date(validadeFim + "T00:00:00").getTime() -
      new Date(base + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );
  if (dias < 0)
    return {
      dias,
      texto: `Vencido há ${Math.abs(dias)} dia(s)`,
      classe: "neo-sit neo-sit--erro",
    };
  if (dias <= 30)
    return {
      dias,
      texto: dias === 0 ? "Vence hoje" : `Vence em ${dias} dia(s)`,
      classe: "neo-sit neo-sit--erro",
    };
  return {
    dias,
    texto: `Vence em ${dias} dias`,
    classe: "neo-sit neo-sit--aviso",
  };
}

function montarLinhas(
  certificados: Certificado[],
  empresas: Empresa[],
  base: string
): Linha[] {
  const porId = new Map(empresas.map((e) => [e.id, e]));
  return certificados.map((c) => {
    const s = situacaoNaBase(c.validade_fim, base);
    const emp = porId.get(c.empresa_id);
    return {
      ...c,
      dias: s.dias,
      situacao: s.texto,
      classe: s.classe,
      telefone: emp?.telefone ?? null,
      email: emp?.email ?? null,
      situacaoCadastral: emp?.situacao_cadastral ?? null,
    };
  });
}

function Tabela({
  titulo,
  linhas,
  vazio,
}: {
  titulo: string;
  linhas: Linha[];
  vazio: string;
}) {
  return (
    <section className="neo-card space-y-3 p-5">
      <h2 className="text-lg font-bold text-[var(--text)]">
        {titulo} ({linhas.length})
      </h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{vazio}</p>
      ) : (
        <div className="neo-flat overflow-x-auto rounded-xl">
          <table className="neo-tabela tabela-impressao w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Empresa</th>
                <th className="text-left">Titular</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Validade</th>
                <th className="text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-semibold text-[var(--text)]">
                      {c.empresa?.razao_social ?? "—"}
                    </div>
                    {c.empresa?.cnpj && (
                      <div className="text-xs text-[var(--muted)]">{c.empresa.cnpj}</div>
                    )}
                  </td>
                  <td>
                    <div className="font-semibold text-[var(--text)]">{c.titular}</div>
                    {(c.telefone || c.email) && (
                      <div className="text-xs text-[var(--muted)]">
                        {[c.telefone, c.email].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {c.situacaoCadastral &&
                      c.situacaoCadastral.toUpperCase() !== "ATIVA" && (
                        <div className="text-xs font-bold text-[var(--erro-fg)]">
                          Empresa {c.situacaoCadastral}
                        </div>
                      )}
                  </td>
                  <td>{c.tipo}</td>
                  <td>{formatDate(c.validade_fim)}</td>
                  <td>
                    <span className={c.classe}>{c.situacao}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function CertificadosAVencerPage({
  searchParams,
}: {
  searchParams?: { mes?: string; ano?: string };
}) {
  await exigirPermissao("certificados", "certificates", "read");

  // Mês/ano de referência: o padrão é o mês corrente em São Paulo.
  const hojeSP = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const [anoHoje, mesHoje] = hojeSP.split("-").map(Number);
  const mes = Math.min(
    12,
    Math.max(1, Number(searchParams?.mes) || mesHoje)
  );
  const anoRaw = Number(searchParams?.ano) || anoHoje;
  const ano = Math.min(2100, Math.max(2000, anoRaw));
  // A base é o último dia do mês de referência.
  const base = `${ano}-${String(mes).padStart(2, "0")}-${new Date(ano, mes, 0).getDate()}`;

  const [certificados, empresas] = await Promise.all([
    listarCertificados(),
    listarEmpresas(),
  ]);

  if (!certificados.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">A vencer</h1>
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {certificados.message}
        </p>
      </div>
    );
  }

  // Vencidos até a referência e a vencer em até 90 dias dela; o restante
  // continua só em "Todos".
  const relevantes = montarLinhas(
    certificados.data,
    empresas.ok ? empresas.data : [],
    base
  ).filter((c) => c.dias <= 90);
  const vencidos = relevantes.filter((c) => c.dias < 0);
  const aVencer = relevantes.filter((c) => c.dias >= 0);

  const anos = [anoHoje - 2, anoHoje - 1, anoHoje, anoHoje + 1, anoHoje + 2, anoHoje + 3];

  return (
    <div className="space-y-6">
      <style>{`@media print {
        body * { visibility: hidden; }
        .relatorio-impressao, .relatorio-impressao * { visibility: visible; }
        .relatorio-impressao { position: absolute; left: 0; top: 0; width: 100%; }
        .nao-imprimir { display: none !important; }
        .relatorio-impressao .neo-card { box-shadow: none; border: 1px solid #999; }
        .relatorio-impressao { color: #000; }
        .relatorio-impressao .text-\\[var\\(--text\\)\\] { color: #000; }
        .relatorio-impressao .text-\\[var\\(--muted\\)\\] { color: #444; }
      }`}</style>

      <div className="relatorio-impressao space-y-6">
        {/* Timbre do relatório impresso. */}
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_ocral.png" alt="OCRAL" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">
              Certificados a vencer
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Referência: {MESES[mes - 1]} de {ano} · Emitido em{" "}
              {formatDateTime(new Date().toISOString())}
            </p>
          </div>
        </div>

        <div className="nao-imprimir flex flex-wrap items-center gap-3">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="filtro-mes"
                className="block text-xs font-bold text-[var(--muted)]"
              >
                Mês
              </label>
              <select
                id="filtro-mes"
                name="mes"
                defaultValue={mes}
                className="neo-input rounded-xl px-3 py-2 text-sm"
              >
                {MESES.map((nome, i) => (
                  <option key={nome} value={i + 1}>
                    {nome[0].toUpperCase() + nome.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="filtro-ano"
                className="block text-xs font-bold text-[var(--muted)]"
              >
                Ano
              </label>
              <select
                id="filtro-ano"
                name="ano"
                defaultValue={ano}
                className="neo-input rounded-xl px-3 py-2 text-sm"
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)]"
            >
              Aplicar
            </button>
          </form>
          <BotaoImprimir />
          <Link
            href="/dashboard/certificados"
            className="neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)]"
          >
            Ver todos
          </Link>
        </div>

        <p className="text-sm text-[var(--muted)]">
          {vencidos.length} vencido(s) e {aVencer.length} a vencer em até 90
          dias, entre os certificados que você acompanha.
        </p>

        <Tabela
          titulo="Vencidos"
          linhas={vencidos}
          vazio="Nenhum certificado vencido na referência. Bom sinal."
        />
        <Tabela
          titulo="A vencer em até 90 dias"
          linhas={aVencer}
          vazio="Nada vencendo nos 90 dias a partir da referência."
        />
      </div>
    </div>
  );
}
