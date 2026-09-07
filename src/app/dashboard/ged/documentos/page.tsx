import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
import { gedStatusClass, type GedDocument } from "@/types/modules/ged";
import { listarDepartamentos } from "@/app/actions/departamentos";

interface SearchParams {
  q?: string;
  cliente?: string;
  setor?: string;
  tipo?: string;
  periodo?: string;
}

export default async function GedDocumentosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase } = await requireSession();
  await exigirPermissao("ged", "documents", "read");

  // Os filtros vêm da própria URL: o formulário é um GET, então a seleção
  // sobrevive ao recarregamento e pode ser compartilhada por link.
  let query = supabase
    .from("ged_documents")
    .select("*, responsavel:profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (searchParams.cliente) query = query.eq("cliente", searchParams.cliente);
  if (searchParams.setor) query = query.eq("setor", searchParams.setor);
  if (searchParams.tipo) query = query.eq("tipo", searchParams.tipo);
  if (searchParams.periodo) query = query.eq("periodo", searchParams.periodo);

  // Busca textual: combina com os filtros acima em vez de substituí-los.
  const termo = searchParams.q?.trim();
  if (termo) {
    // `,` separa alternativas no or() do PostgREST — escapamos para que um
    // termo digitado não quebre a expressão.
    const seguro = termo.replace(/[,()]/g, " ").trim();
    query = query.or(
      [
        `nome.ilike.%${seguro}%`,
        `cliente.ilike.%${seguro}%`,
        `resumo.ilike.%${seguro}%`,
        `tipo.ilike.%${seguro}%`,
        `codigo.ilike.%${seguro}%`,
      ].join(",")
    );
  }

  const { data: documents } = await query.returns<GedDocument[]>();

  // Opções dos filtros a partir do próprio acervo, sem lista fixa no código.
  const { data: facets } = await supabase
    .from("ged_documents")
    .select("cliente, tipo")
    .limit(1000);

  const dep = await listarDepartamentos(true);
  const departamentos = dep.ok ? dep.data.map((d) => d.nome) : [];

  const clientes = Array.from(new Set((facets ?? []).map((f) => f.cliente))).sort();
  const tipos = Array.from(new Set((facets ?? []).map((f) => f.tipo))).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Documentos GED</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Busca, indexação, histórico, assinatura e retenção documental.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/dashboard/ged"
            className="inline-flex items-center justify-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:translate-y-[-1px]"
          >
            Voltar ao painel
          </Link>
          <Link
            href="/dashboard/ged/documentos/novo"
            className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] shadow-[10px_10px_18px_rgba(122,109,216,0.28)] hover:brightness-105"
          >
            Novo documento
          </Link>
        </div>
      </div>

      <section className="neo-card p-5">
        <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-5">
            <label
              htmlFor="q"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
            >
              Buscar
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder="Nome, cliente, tipo, código ou texto da descrição"
              className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
            />
          </div>

          <FilterSelect
            name="cliente"
            label="Cliente"
            value={searchParams.cliente}
            options={clientes}
          />
          <FilterSelect
            name="setor"
            label="Departamento"
            value={searchParams.setor}
            options={departamentos}
          />
          <FilterSelect
            name="tipo"
            label="Tipo"
            value={searchParams.tipo}
            options={tipos}
          />
          <div>
            <label
              htmlFor="periodo"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
            >
              Período
            </label>
            <input
              id="periodo"
              type="month"
              name="periodo"
              defaultValue={searchParams.periodo ?? ""}
              className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-[var(--on-accent)] shadow-[10px_10px_18px_rgba(122,109,216,0.28)]"
            >
              Buscar
            </button>
            <Link
              href="/dashboard/ged/documentos"
              className="rounded-full border border-[var(--stroke)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)]"
            >
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className="neo-card overflow-hidden">
        <div className="neo-flat overflow-x-auto">
          <table className="min-w-full text-left tabela-mobile">
            <thead className="bg-[var(--surface-strong)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Documento
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Cliente
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Setor
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Período
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Validade
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Descarte
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {documents && documents.length > 0 ? (
                documents.map((document) => (
                  <tr key={document.id} className="border-t border-[var(--stroke)]">
                    <td data-rotulo="Documento" className="px-4 py-3">
                      <p className="font-semibold text-[var(--text)]">{document.nome}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {document.tipo} • v{document.versao}
                      </p>
                    </td>
                    <td data-rotulo="Cliente" className="px-4 py-3 text-sm text-[var(--text)]">
                      {document.cliente}
                    </td>
                    <td data-rotulo="Setor" className="px-4 py-3 text-sm text-[var(--muted)]">
                      {document.setor}
                    </td>
                    <td data-rotulo="Status" className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${gedStatusClass(document.status)}`}
                      >
                        {document.status}
                      </span>
                    </td>
                    <td data-rotulo="Período" className="px-4 py-3 text-sm text-[var(--muted)]">
                      {document.periodo ?? "—"}
                    </td>
                    <td data-rotulo="Validade" className="px-4 py-3 text-sm text-[var(--muted)]">
                      {document.validade ? formatDate(document.validade) : "—"}
                    </td>
                    <td data-rotulo="Descarte" className="px-4 py-3 text-sm text-[var(--muted)]">
                      {document.data_descarte
                        ? formatDate(document.data_descarte)
                        : "permanente"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href={`/dashboard/ged/documentos/${document.id}`}
                        className="font-semibold text-[var(--primary-strong)] hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                  >
                    Nenhum documento encontrado para a busca e os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly string[];
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
