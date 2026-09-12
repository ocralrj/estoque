import { requireSession } from "@/lib/auth";
import { exigirPermissao, pode } from "@/lib/permissoes";
import { listarCategoriasComUso } from "@/app/actions/categorias";
import CadastroDeApoio from "@/components/estoque/CadastroDeApoio";

export default async function CategoriasPage() {
  await requireSession();
  await exigirPermissao("estoque", "categories", "read");

  const [res, podeCriar, podeEditar, podeExcluir] = await Promise.all([
    listarCategoriasComUso(),
    pode("estoque", "categories", "create"),
    pode("estoque", "categories", "update"),
    pode("estoque", "categories", "delete"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Categorias</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Como os produtos do almoxarifado são agrupados. Só as categorias ativas
          aparecem no cadastro de produto.
        </p>
      </div>

      {res.ok ? (
        <CadastroDeApoio
          tipo="categoria"
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
