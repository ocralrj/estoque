import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditTrail, certificateAlerts, gedDocuments, retentionRules } from "@/lib/ged/mock-data";

export default async function GedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const totalDocs = gedDocuments.length;
  const assinados = gedDocuments.filter((doc) => doc.status === "Assinado").length;
  const alertasCertificados = certificateAlerts.length;
  const regrasAtivas = retentionRules.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">GED</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Gestão Eletrônica de Documentos, temporalidade e trazibilidade documental.
          </p>
        </div>
        <Link
          href="/dashboard/ged/documentos"
          className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white shadow-[10px_10px_18px_rgba(122,109,216,0.28)] hover:brightness-105 transition-all"
        >
          Acessar documentos
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Documentos</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{totalDocs}</p>
        </div>
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Assinados</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{assinados}</p>
        </div>
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Certificados vencendo</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{alertasCertificados}</p>
        </div>
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Regras de retenção</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{regrasAtivas}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="neo-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--text)]">Documentos recentes</h2>
            <Link href="/dashboard/ged/documentos" className="text-sm font-semibold text-[var(--primary-strong)]">
              Ver tudo
            </Link>
          </div>

          <div className="space-y-3">
            {gedDocuments.slice(0, 4).map((document) => (
              <div key={document.id} className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text)]">{document.nome}</p>
                    <p className="text-xs text-[var(--muted)]">{document.cliente} • {document.setor}</p>
                  </div>
                  <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
                    {document.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">Alertas de certificados</h2>
          <div className="space-y-3">
            {certificateAlerts.map((item) => (
              <div key={`${item.cliente}-${item.certificado}`} className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text)]">{item.cliente}</p>
                    <p className="text-xs text-[var(--muted)]">{item.certificado}</p>
                  </div>
                  <span className="rounded-full bg-[var(--warning)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text)]">
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">Validade em {item.validade}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">Temporalidade e descarte</h2>
          <div className="space-y-3">
            {retentionRules.map((rule) => (
              <div key={`${rule.setor}-${rule.tipo}`} className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
                <p className="font-semibold text-[var(--text)]">{rule.setor} • {rule.tipo}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Prazo: {rule.prazo}</p>
                <p className="text-sm text-[var(--muted)]">Destino: {rule.destino}</p>
                <p className="text-xs text-[var(--muted)] mt-1">Base legal: {rule.baseLegal}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">Trilha de auditoria</h2>
          <div className="space-y-3">
            {auditTrail.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[var(--text)]">{item.acao}</p>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">{item.id}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{item.documento}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.usuario} • {item.data}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
