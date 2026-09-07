import { exigirPermissao, pode } from "@/lib/permissoes";
import { getSession } from "@/lib/auth";
import { listarCargos } from "@/app/actions/cargos";
import CargosClient from "./CargosClient";

export default async function CargosPage() {
  await exigirPermissao("admin", "cargos", "read");

  const [res, podeCriar, podeEditar, podeExcluir] = await Promise.all([
    listarCargos(),
    pode("admin", "cargos", "create"),
    pode("admin", "cargos", "update"),
    pode("admin", "cargos", "delete"),
  ]);

  // Quantas pessoas ocupam cada cargo, para a tela poder avisar antes de uma
  // exclusão — e para mostrar o cargo vazio, que é o que se pode apagar sem dó.
  const { supabase } = await getSession();
  const { data: pessoas } = await supabase
    .from("profiles")
    .select("cargo_id")
    .eq("active", true);

  const ocupantes: Record<string, number> = {};
  for (const p of pessoas ?? []) {
    const id = p.cargo_id as string | null;
    if (id) ocupantes[id] = (ocupantes[id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Cargos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          O que cada pessoa faz na empresa. O que ela pode fazer no sistema continua
          vindo do grupo — são coisas separadas.
        </p>
      </div>

      {res.ok ? (
        <CargosClient
          inicial={res.data}
          ocupantes={ocupantes}
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
