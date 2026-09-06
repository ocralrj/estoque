import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, STOCK_ROLES } from "@/lib/auth";
import { listarDepartamentos } from "@/app/actions/departamentos";
import { formatDate, formatDateTime } from "@/lib/labels";
import FormularioDocumento from "@/components/ged/FormularioDocumento";
import AcoesDocumento from "@/components/ged/AcoesDocumento";
import {
  gedStatusClass,
  type GedAuditEntry,
  type GedDocument,
  type GedFolder,
  type GedRetentionRule,
} from "@/types/modules/ged";

export default async function DocumentoPage({ params }: { params: { id: string } }) {
  const { supabase, profile } = await requireSession(STOCK_ROLES);

  const { data: documento } = await supabase
    .from("ged_documents")
    .select("*")
    .eq("id", params.id)
    .single<GedDocument>();

  if (!documento) redirect("/dashboard/ged/documentos");

  const [{ data: pastas }, { data: regras }, { data: historico }] = await Promise.all([
    supabase
      .from("ged_folders")
      .select("*")
      .eq("ativa", true)
      .order("setor")
      .returns<GedFolder[]>(),
    supabase
      .from("ged_retention_rules")
      .select("*")
      .eq("ativa", true)
      .order("setor")
      .order("tipo")
      .returns<GedRetentionRule[]>(),
    supabase
      .from("ged_audit")
      .select("*, user:profiles(full_name, email)")
      .eq("document_id", params.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<GedAuditEntry[]>(),
  ]);

  const dep = await listarDepartamentos(true);
  const departamentos = dep.ok ? dep.data.map((d) => d.nome) : ["Fiscal"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-[var(--muted)]">{documento.codigo}</p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{documento.nome}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${gedStatusClass(documento.status)}`}
            >
              {documento.status}
            </span>
            <span className="text-xs text-[var(--muted)]">
              {documento.cliente} • {documento.setor} • v{documento.versao}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/dashboard/ged/documentos"
            className="inline-flex items-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            Voltar
          </Link>
          <AcoesDocumento
            id={documento.id}
            nome={documento.nome}
            storagePath={documento.storage_path}
            compressao={documento.compressao}
            mimeType={documento.mime_type}
            podeExcluir={documento.status !== "Assinado" || profile?.role === "super_admin"}
          />
        </div>
      </div>

      <FormularioDocumento
        documento={documento}
        pastas={pastas ?? []}
        regras={regras ?? []}
        departamentos={departamentos}
      />

      <section className="neo-card p-5">
        <h2 className="mb-4 text-lg font-bold text-[var(--text)]">Histórico do documento</h2>
        <div className="space-y-3">
          {historico && historico.length > 0 ? (
            historico.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
              >
                <p className="font-semibold text-[var(--text)]">{item.acao}</p>
                {item.detalhe && (
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.detalhe}</p>
                )}
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {item.user?.full_name || item.user?.email || "Sistema"} •{" "}
                  {formatDateTime(item.created_at)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">Nenhum evento registrado ainda.</p>
          )}
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Documento criado em {formatDate(documento.created_at)}.
        </p>
      </section>
    </div>
  );
}
