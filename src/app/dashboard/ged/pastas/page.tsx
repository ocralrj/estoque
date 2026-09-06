import Link from "next/link";
import { requireSession, STOCK_ROLES } from "@/lib/auth";
import { listarDepartamentos } from "@/app/actions/departamentos";
import PastasClient from "./PastasClient";
import type { GedFolder } from "@/types/modules/ged";

export default async function GedPastasPage() {
  const { supabase, profile } = await requireSession(STOCK_ROLES);

  const [{ data: pastas }, dep] = await Promise.all([
    supabase
      .from("ged_folders")
      .select("*")
      .order("setor")
      .order("caminho")
      .returns<GedFolder[]>(),
    listarDepartamentos(true),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Pastas do GED</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Estrutura documental por departamento, tipo e retenção.
          </p>
        </div>
        <Link
          href="/dashboard/ged"
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:translate-y-[-1px]"
        >
          Voltar ao painel
        </Link>
      </div>

      <PastasClient
        pastas={pastas ?? []}
        departamentos={dep.ok ? dep.data.map((d) => d.nome) : []}
        ehAdmin={profile?.role === "super_admin"}
      />
    </div>
  );
}
