import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
import {
  daysUntil,
  gedStatusClass,
  type GedCertificate,
  type GedDocument,
  type GedRetentionRule,
} from "@/types/modules/ged";

/** Alerta de certificado a partir deste prazo. */
const ALERT_WINDOW_DAYS = 60;

export default async function GedPage() {
  const { supabase } = await requireSession();
  await exigirPermissao("ged", "documents", "read");

  const [
    { count: totalDocs },
    { count: assinados },
    { data: recentes },
    { data: certificados },
    { data: regras },
  ] = await Promise.all([
    supabase.from("ged_documents").select("*", { count: "exact", head: true }),
    supabase
      .from("ged_documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "Assinado"),
    supabase
      .from("ged_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(4)
      .returns<GedDocument[]>(),
    supabase
      .from("ged_certificates")
      .select("*")
      .order("validade")
      .returns<GedCertificate[]>(),
    supabase
      .from("ged_retention_rules")
      .select("*")
      .eq("ativa", true)
      .order("setor")
      .returns<GedRetentionRule[]>(),
  ]);

  const vencendo = (certificados ?? []).filter(
    (item) => daysUntil(item.validade) <= ALERT_WINDOW_DAYS
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">GED</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Gestão Eletrônica de Documentos, temporalidade e rastreabilidade documental.
          </p>
        </div>
        <Link
          href="/dashboard/ged/documentos"
          className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] shadow-[10px_10px_18px_rgba(122,109,216,0.28)] hover:brightness-105 transition-all"
        >
          Acessar documentos
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Documentos</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{totalDocs ?? 0}</p>
        </div>
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Assinados</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{assinados ?? 0}</p>
        </div>
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Certificados vencendo</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">{vencendo.length}</p>
        </div>
        <div className="neo-card p-5">
          <p className="text-sm text-[var(--muted)]">Regras de retenção</p>
          <p className="mt-3 text-3xl font-black text-[var(--text)]">
            {regras?.length ?? 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="neo-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--text)]">Documentos recentes</h2>
            <Link
              href="/dashboard/ged/documentos"
              className="text-sm font-semibold text-[var(--primary-strong)]"
            >
              Ver tudo
            </Link>
          </div>

          <div className="space-y-3">
            {recentes && recentes.length > 0 ? (
              recentes.map((document) => (
                <div
                  key={document.id}
                  className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text)] truncate">
                        {document.nome}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {document.cliente} • {document.setor}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${gedStatusClass(document.status)}`}
                    >
                      {document.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyHint text="Nenhum documento cadastrado ainda." />
            )}
          </div>
        </section>

        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">
            Alertas de certificados
          </h2>
          <div className="space-y-3">
            {vencendo.length > 0 ? (
              vencendo.map((item) => {
                const dias = daysUntil(item.validade);
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text)] truncate">
                          {item.cliente}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{item.certificado}</p>
                      </div>
                      <span className="rounded-full bg-[var(--warning)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text)]">
                        {dias < 0 ? "Vencido" : `${dias} dia(s)`}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Validade em {formatDate(item.validade)}
                    </p>
                  </div>
                );
              })
            ) : (
              <EmptyHint text="Nenhum certificado próximo do vencimento." />
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">
            Temporalidade e descarte
          </h2>
          <p className="-mt-2 mb-4 text-sm text-[var(--muted)]">
            Por quanto tempo cada tipo de documento precisa ser guardado, e o que
            fazer quando o prazo vence.
          </p>
          <div className="space-y-3">
            {regras && regras.length > 0 ? (
              regras.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
                >
                  <p className="font-semibold text-[var(--text)]">
                    {rule.setor} • {rule.tipo}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">Prazo: {rule.prazo}</p>
                  <p className="text-sm text-[var(--muted)]">Destino: {rule.destino}</p>
                  {rule.base_legal && (
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Base legal: {rule.base_legal}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <EmptyHint text="Nenhuma regra de temporalidade cadastrada." />
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
      {text}
    </div>
  );
}
