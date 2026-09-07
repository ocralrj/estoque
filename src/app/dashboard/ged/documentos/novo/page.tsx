import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { requireSession, STOCK_ROLES } from "@/lib/auth";
import { listarDepartamentos } from "@/app/actions/departamentos";
import FormularioDocumento from "@/components/ged/FormularioDocumento";
import type { GedFolder, GedRetentionRule } from "@/types/modules/ged";

export default async function NovoDocumentoPage() {
  const { supabase } = await requireSession(STOCK_ROLES);
  await exigirPermissao("ged", "documents", "create");

  const [{ data: pastas }, { data: regras }] = await Promise.all([
    supabase
      .from("ged_folders")
      .select("*")
      .eq("ativa", true)
      .order("setor")
      .order("nome")
      .returns<GedFolder[]>(),
    supabase
      .from("ged_retention_rules")
      .select("*")
      .eq("ativa", true)
      .order("setor")
      .order("tipo")
      .returns<GedRetentionRule[]>(),
  ]);

  const dep = await listarDepartamentos(true);
  const departamentos = dep.ok ? dep.data.map((d) => d.nome) : ["Fiscal"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Novo documento</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Cadastre um arquivo eletrônico no acervo.
          </p>
        </div>
        <Link
          href="/dashboard/ged/documentos"
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
        >
          Voltar
        </Link>
      </div>

      <FormularioDocumento
        pastas={pastas ?? []}
        regras={regras ?? []}
        departamentos={departamentos}
      />
    </div>
  );
}
