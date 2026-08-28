import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { folderTree } from "@/lib/ged/mock-data";

export default async function GedPastasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Pastas do GED</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Estrutura documental por setor, tipo e retenção.
          </p>
        </div>
        <Link
          href="/dashboard/ged"
          className="inline-flex items-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:translate-y-[-1px]"
        >
          Voltar ao painel
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {folderTree.map((sector) => (
          <div key={sector.setor} className="neo-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--text)]">{sector.setor}</h2>
              <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
                {sector.items.length} pastas
              </span>
            </div>
            <div className="space-y-3">
              {sector.items.map((item) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary-strong)] font-bold text-sm">{item.charAt(0)}</span>
                    <span className="font-medium text-[var(--text)]">{item}</span>
                  </div>
                  <span className="text-xs text-[var(--muted)]">Ativa</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
