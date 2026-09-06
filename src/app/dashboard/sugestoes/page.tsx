import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import {
  SUGGESTION_PRIORITY_LABELS,
  SUGGESTION_STATUS_COLORS,
  SUGGESTION_STATUS_LABELS,
  type ImprovementSuggestion,
} from "@/types/modules/suggestions";

export default async function MySuggestionsPage() {
  const { supabase, user } = await requireSession();

  const { data: suggestions } = await supabase
    .from("improvement_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<ImprovementSuggestion[]>();

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Minhas Sugestões</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Acompanhe as melhorias que você sugeriu.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-[var(--primary)] hover:underline"
        >
          Voltar ao início
        </Link>
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        {!suggestions || suggestions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[var(--text-muted)] mb-2">Nenhum pedido enviado ainda.</p>
            <p className="text-sm text-[var(--text-muted)]">
              Use o botão amarelo &quot;Sugerir uma melhoria&quot; no topo da
              tela.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--neo-line)]">
            {suggestions.map((s) => (
              <div key={s.id} className="p-5 hover:bg-[var(--neo-flat)]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-[var(--text-muted)]">{s.code}</p>
                    <h2 className="text-base font-semibold text-[var(--text)]">
                      {s.title}
                    </h2>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${SUGGESTION_STATUS_COLORS[s.status]}`}
                  >
                    {SUGGESTION_STATUS_LABELS[s.status]}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-2">{s.summary}</p>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-[var(--text-muted)]">
                  <span>
                    {formatDateTime(s.created_at)}
                  </span>
                  <span>
                    Prioridade: {SUGGESTION_PRIORITY_LABELS[s.priority]}
                  </span>
                  {s.module_hint && <span>Módulo: {s.module_hint}</span>}
                </div>
                {s.admin_notes && (
                  <div className="mt-3 text-sm bg-[var(--aviso-bg)] border border-[var(--neo-line)] text-[var(--aviso-fg)] rounded-lg px-3 py-2">
                    <span className="font-medium">Resposta da equipe: </span>
                    {s.admin_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
