import { exigirPermissao } from "@/lib/permissoes";
import { listarEmpresasClientes } from "@/app/actions/contabilidade";
import FormularioAnalise from "./FormularioAnalise";

export default async function NovaAnalisePage() {
  await exigirPermissao("contabilidade", "balancetes", "create");
  const empresas = await listarEmpresasClientes();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--text-muted)]">Contabilidade → Balancetes</p>
        <h1 className="text-2xl font-bold text-[var(--text)]">Nova Análise</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          O arquivo é processado no seu navegador e descartado em seguida — só
          os dados extraídos e o resultado são guardados.
        </p>
      </div>

      {!empresas.ok ? (
        <p className="neo-card p-8 text-center text-sm text-[var(--erro-fg)]">
          {empresas.message}
        </p>
      ) : (
        <FormularioAnalise empresas={empresas.data} />
      )}
    </div>
  );
}
