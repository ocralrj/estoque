import Link from "next/link";
import { requireSession, STOCK_ROLES } from "@/lib/auth";
import FormularioDocumento from "@/components/ged/FormularioDocumento";
import type { GedFolder } from "@/types/modules/ged";

export default async function NovoDocumentoPage() {
  const { supabase } = await requireSession(STOCK_ROLES);

  const { data: pastas } = await supabase
    .from("ged_folders")
    .select("*")
    .eq("ativa", true)
    .order("setor")
    .order("nome")
    .returns<GedFolder[]>();

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

      <FormularioDocumento pastas={pastas ?? []} />
    </div>
  );
}
