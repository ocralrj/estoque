import Link from "next/link";
import { exigirPermissao } from "@/lib/permissoes";
import { listarCertificados, type Certificado } from "@/app/actions/certificados";
import { situacaoDaValidade } from "@/lib/certificados/leitura";
import { formatDate } from "@/lib/labels";

type Linha = Certificado & { dias: number; situacao: string; classe: string };

function montarLinhas(certificados: Certificado[]): Linha[] {
  return certificados.map((c) => {
    const s = situacaoDaValidade(c.validade_fim);
    return { ...c, dias: s.dias, situacao: s.texto, classe: s.classe };
  });
}

function Tabela({ titulo, linhas, vazio }: { titulo: string; linhas: Linha[]; vazio: string }) {
  return (
    <section className="neo-card space-y-3 p-5">
      <h2 className="text-lg font-bold text-[var(--text)]">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{vazio}</p>
      ) : (
        <div className="neo-flat overflow-x-auto rounded-xl">
          <table className="neo-tabela w-full text-sm">
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
                  <td>{c.titular}</td>
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

export default async function CertificadosAVencerPage() {
  await exigirPermissao("certificados", "certificates", "read");

  const resultado = await listarCertificados();

  if (!resultado.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">A vencer</h1>
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {resultado.message}
        </p>
      </div>
    );
  }

  // Vencidos e a vencer em até 90 dias; o restante continua só em "Todos".
  const relevantes = montarLinhas(resultado.data).filter((c) => c.dias <= 90);
  const vencidos = relevantes.filter((c) => c.dias < 0);
  const aVencer = relevantes.filter((c) => c.dias >= 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">A vencer</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {vencidos.length} vencido(s) e {aVencer.length} a vencer em até 90
            dias, entre os certificados que você acompanha.
          </p>
        </div>
        <Link
          href="/dashboard/certificados"
          className="neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)]"
        >
          Ver todos
        </Link>
      </div>

      <Tabela
        titulo="Vencidos"
        linhas={vencidos}
        vazio="Nenhum certificado vencido. Bom sinal."
      />
      <Tabela
        titulo="A vencer em até 90 dias"
        linhas={aVencer}
        vazio="Nada vencendo nos próximos 90 dias."
      />
    </div>
  );
}
