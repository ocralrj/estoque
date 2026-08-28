import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gedDocuments } from "@/lib/ged/mock-data";

function statusClass(status: string) {
  switch (status) {
    case "Assinado":
      return "bg-[var(--success)] text-[var(--text)]";
    case "Ativo":
      return "bg-[var(--primary-soft)] text-[var(--primary-strong)]";
    case "Arquivado":
      return "bg-[var(--warning)] text-[var(--text)]";
    case "Rascunho":
      return "bg-[var(--surface-strong)] text-[var(--muted-strong)]";
    default:
      return "bg-[var(--danger)] text-[var(--text)]";
  }
}

export default async function GedDocumentosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Documentos GED</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Upload, indexação, histórico, assinatura e retenção documental.
          </p>
        </div>
        <Link
          href="/dashboard/ged"
          className="inline-flex items-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:translate-y-[-1px]"
        >
          Voltar ao painel
        </Link>
      </div>

      <section className="neo-card p-5">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Cliente</label>
            <select className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
              <option>Todos</option>
              <option>Nexus Contabilidade</option>
              <option>Asteria Serviços</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Setor</label>
            <select className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
              <option>Todos</option>
              <option>Fiscal</option>
              <option>DP</option>
              <option>Contábil</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Tipo</label>
            <select className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
              <option>Todos</option>
              <option>NF-e</option>
              <option>Contrato</option>
              <option>DRE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Período</label>
            <input type="month" defaultValue="2026-08" className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]" />
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white shadow-[10px_10px_18px_rgba(122,109,216,0.28)]">
              Filtrar
            </button>
          </div>
        </div>
      </section>

      <section className="neo-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-[var(--surface-strong)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">Documento</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">Cliente</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">Setor</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">Status</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">Período</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">Hash</th>
              </tr>
            </thead>
            <tbody>
              {gedDocuments.map((document) => (
                <tr key={document.id} className="border-t border-[var(--stroke)]">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-[var(--text)]">{document.nome}</p>
                      <p className="text-xs text-[var(--muted)]">{document.tipo} • v{document.versao}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text)]">{document.cliente}</td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">{document.setor}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusClass(document.status)}`}>
                      {document.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">{document.periodo}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">{document.hash.slice(0, 12)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
