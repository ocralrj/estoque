import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import {
  SUGGESTION_PRIORITY_LABELS,
  SUGGESTION_STATUS_COLORS,
  SUGGESTION_STATUS_LABELS,
  type ImprovementSuggestion,
  type MensagemDaSugestao,
} from "@/types/modules/suggestions";
import DialogoSugestao from "@/components/suggestions/DialogoSugestao";

export default async function MySuggestionsPage() {
  const { supabase, user } = await requireSession();
  await exigirPermissao("sugestoes", "minhas", "read");

  const { data: suggestions } = await supabase
    .from("improvement_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<ImprovementSuggestion[]>();

  // O fio de conversa vem em uma consulta só, e não uma por sugestão. Se a
  // tabela ainda não existir, a tela continua funcionando sem o diálogo em vez
  // de quebrar inteira.
  const { data: mensagens } = await supabase
    .from("suggestion_messages")
    .select("*, autor:profiles(full_name, email, avatar_url)")
    .in("suggestion_id", (suggestions ?? []).map((s) => s.id))
    .order("created_at")
    .returns<MensagemDaSugestao[]>();

  const fioPorSugestao = new Map<string, MensagemDaSugestao[]>();
  for (const m of mensagens ?? []) {
    const lista = fioPorSugestao.get(m.suggestion_id) ?? [];
    lista.push(m);
    fioPorSugestao.set(m.suggestion_id, lista);
  }

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
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${SUGGESTION_STATUS_COLORS[s.status]}`}
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
                {/* A última resposta continua em destaque para quem só quer
                    bater o olho; o fio inteiro fica logo abaixo. */}
                {s.admin_notes && (fioPorSugestao.get(s.id)?.length ?? 0) === 0 && (
                  <div className="mt-3 rounded-lg border border-[var(--neo-line)] bg-[var(--aviso-bg)] px-3 py-2 text-sm text-[var(--aviso-fg)]">
                    <span className="font-medium">Resposta da equipe: </span>
                    {s.admin_notes}
                  </div>
                )}

                <DialogoSugestao
                  sugestaoId={s.id}
                  mensagens={fioPorSugestao.get(s.id) ?? []}
                  souOAutor
                  encerrada={s.status === "atendida"}
                  atendidaEm={s.atendida_em}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
