import { requireSession } from "@/lib/auth";
import { exigirPermissao, pode } from "@/lib/permissoes";
import { listarLocalizacoesComUso } from "@/app/actions/localizacoes";
import CadastroDeApoio from "@/components/estoque/CadastroDeApoio";

export default async function LocalizacoesPage() {
  await requireSession();
  await exigirPermissao("estoque", "locations", "read");

  const [res, podeCriar, podeEditar, podeExcluir] = await Promise.all([
    listarLocalizacoesComUso(),
    pode("estoque", "locations", "create"),
    pode("estoque", "locations", "update"),
    pode("estoque", "locations", "delete"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Localizações</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Onde os produtos ficam guardados. Só as localizações ativas aparecem no
          cadastro de produto.
        </p>
      </div>

      {res.ok ? (
        <CadastroDeApoio
          tipo="localizacao"
          registros={res.data}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
        />
      ) : (
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {res.message}
        </p>
      )}
    </div>
  );
}
