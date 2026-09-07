"use client";

import DialogoSugestao from "@/components/suggestions/DialogoSugestao";
import { useMemo, useState } from "react";
import { updateSuggestionStatus } from "@/app/actions/suggestions";
import type {
  ImprovementSuggestion,
  SuggestionPriority,
  SuggestionStatus,
} from "@/types/modules/suggestions";
import {
  SUGGESTION_PRIORITY_LABELS,
  SUGGESTION_STATUS_COLORS,
  SUGGESTION_STATUS_LABELS,
} from "@/types/modules/suggestions";
import { clsx } from "clsx";

const STATUSES: SuggestionStatus[] = [
  "enviada",
  "em_analise",
  "planejada",
  "em_andamento",
  "concluida",
  "recusada",
];

export default function AdminSuggestionsClient({
  initial,
}: {
  initial: ImprovementSuggestion[];
}) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<string>("todos");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "todos") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  async function handleUpdate(
    id: string,
    status: SuggestionStatus,
    priority?: SuggestionPriority
  ) {
    setSavingId(id);
    setError(null);
    const res = await updateSuggestionStatus(
      id,
      status,
      notesDraft[id],
      priority
    );
    setSavingId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...res.data } : i)));
  }

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm text-[var(--text-muted)]">Status:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm"
        >
          <option value="todos">Todos</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUGGESTION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="text-sm text-[var(--text-muted)] ml-auto">
          {filtered.length} pedido(s)
        </span>
      </div>

      {error && (
        <div className="bg-[var(--erro-bg)] text-[var(--erro-fg)] text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-12 text-center text-[var(--text-muted)]">
          Nenhuma sugestão encontrada.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="bg-[var(--neo-bg)] rounded-xl shadow-sm border border-[var(--neo-line)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-[var(--text-muted)]">{s.code}</p>
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    {s.title}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {s.user?.full_name || s.user?.email || "Usuário"} ·{" "}
                    {new Date(s.created_at).toLocaleString("pt-BR")}
                    {s.module_hint ? ` · ${s.module_hint}` : ""}
                  </p>
                </div>
                {/* O número de voltas fica ao lado do status: uma sugestão no
                    quinto vaivém é assunto que não fecha por escrito, e isso
                    precisa saltar da lista sem abrir cada uma. */}
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={clsx(
                      "px-2 py-1 text-xs font-semibold rounded-full",
                      SUGGESTION_STATUS_COLORS[s.status]
                    )}
                  >
                    {SUGGESTION_STATUS_LABELS[s.status]}
                  </span>
                  {(s.idas_e_vindas ?? 0) > 0 && (
                    <span
                      title={`A equipe escreveu de volta ${s.idas_e_vindas} vez(es)`}
                      className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs font-bold text-[var(--muted)]"
                    >
                      {s.idas_e_vindas}ª volta
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm">
                <p>
                  <span className="font-medium text-[var(--text)]">O que: </span>
                  <span className="text-[var(--text-muted)]">
                    {s.what_wanted || s.summary}
                  </span>
                </p>
                {s.why_wanted && (
                  <p>
                    <span className="font-medium text-[var(--text)]">Por quê: </span>
                    <span className="text-[var(--text-muted)]">{s.why_wanted}</span>
                  </p>
                )}
                <p className="text-[var(--text-muted)] bg-[var(--neo-flat)] rounded-lg p-3">
                  {s.summary}
                </p>
              </div>

              <div className="mt-4 grid md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Status
                  </label>
                  <select
                    defaultValue={s.status}
                    onChange={(e) =>
                      handleUpdate(s.id, e.target.value as SuggestionStatus)
                    }
                    disabled={savingId === s.id}
                    className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {SUGGESTION_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Prioridade
                  </label>
                  <select
                    defaultValue={s.priority}
                    onChange={(e) =>
                      handleUpdate(
                        s.id,
                        s.status,
                        e.target.value as SuggestionPriority
                      )
                    }
                    disabled={savingId === s.id}
                    className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm"
                  >
                    {(
                      Object.keys(SUGGESTION_PRIORITY_LABELS) as SuggestionPriority[]
                    ).map((p) => (
                      <option key={p} value={p}>
                        {SUGGESTION_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Nota para o autor
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={notesDraft[s.id] ?? s.admin_notes ?? ""}
                      onChange={(e) =>
                        setNotesDraft((d) => ({ ...d, [s.id]: e.target.value }))
                      }
                      placeholder="Feedback opcional"
                      className="flex-1 px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      disabled={savingId === s.id}
                      onClick={() => handleUpdate(s.id, s.status)}
                      className="px-3 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg text-sm hover:brightness-110 disabled:opacity-60"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>

              {/* O fio inteiro, para a gestão ver o que já foi dito antes de
                  responder de novo — era isso que o campo único de nota
                  apagava a cada resposta. */}
              <DialogoSugestao
                sugestaoId={s.id}
                mensagens={s.mensagens ?? []}
                souOAutor={false}
                encerrada={s.status === "atendida"}
                atendidaEm={s.atendida_em}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
