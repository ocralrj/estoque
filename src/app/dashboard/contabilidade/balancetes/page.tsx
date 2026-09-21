import Link from "next/link";
import { exigirPermissao, pode } from "@/lib/permissoes";
import { listarAnalises, excluirAnalise } from "@/app/actions/contabilidade";
import { ConfirmSubmitButton } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/labels";

const STATUS_CLASSES: Record<string, string> = {
  processando: "neo-sit neo-sit--aviso",
  processado: "neo-sit neo-sit--ok",
  erro: "neo-sit neo-sit--erro",
};

const STATUS_ROTULOS: Record<string, string> = {
  processando: "Processando",
  processado: "Processado",
  erro: "Erro",
};

function periodo(inicio: string, fim: string) {
  return `${formatDate(inicio)} a ${formatDate(fim)}`;
}

export default async function BalancetesPage() {
  await exigirPermissao("contabilidade", "balancetes", "read");
  const [analises, podeCriar, podeExcluir] = await Promise.all([
    listarAnalises(),
    pode("contabilidade", "balancetes", "create"),
    pode("contabilidade", "balancetes", "delete"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Contabilidade</p>
          <h1 className="text-2xl font-bold text-[var(--text)]">Balancetes</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Análises processadas por empresa e período. O arquivo original não é
            guardado — só os dados extraídos e o resultado.
          </p>
        </div>
        {podeCriar && (
          <Link
            href="/dashboard/contabilidade/balancetes/nova"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] hover:brightness-110"
          >
            + Nova Análise
          </Link>
        )}
      </div>

      {!analises.ok ? (
        <p className="neo-card p-8 text-center text-sm text-[var(--erro-fg)]">
          {analises.message}
        </p>
      ) : analises.data.length === 0 ? (
        <p className="neo-card p-8 text-center text-sm text-[var(--text-muted)]">
          Nenhuma análise ainda. Comece pela Nova Análise.
        </p>
      ) : (
        <div className="neo-card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--neo-line)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-6 py-3">Empresa</th>
                <th className="px-6 py-3">CNPJ</th>
                <th className="px-6 py-3">Período</th>
                <th className="px-6 py-3">Data da análise</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Resultado</th>
                {podeExcluir && <th className="px-6 py-3">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--neo-line)]">
              {analises.data.map((a) => (
                <tr key={a.id} className="hover:bg-[var(--neo-flat)]">
                  <td className="px-6 py-4 text-sm font-semibold text-[var(--text)]">
                    {a.empresa_nome}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-muted)]">
                    {a.empresa_cnpj ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text)]">
                    {periodo(a.periodo_inicio, a.periodo_fim)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-muted)]">
                    {formatDateTime(a.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={STATUS_CLASSES[a.status] ?? "neo-sit neo-sit--info"}>
                      {STATUS_ROTULOS[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    {a.status === "processado" ? (
                      <Link
                        href={`/dashboard/contabilidade/balancetes/${a.id}`}
                        className="font-semibold text-[var(--primary)] hover:underline"
                      >
                        Ver Resultado
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  {podeExcluir && (
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <form action={excluirAnalise.bind(null, a.id)}>
                        <ConfirmSubmitButton
                          message={`Excluir a análise de ${a.empresa_nome} (${periodo(a.periodo_inicio, a.periodo_fim)})? Os dados e o resultado saem juntos.`}
                          confirmLabel="Excluir"
                          className="font-semibold text-[var(--erro-fg)] hover:underline"
                        >
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
