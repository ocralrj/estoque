import { exigirPermissao, pode } from "@/lib/permissoes";
import { requireSession, canManageStock } from "@/lib/auth";
import Link from "next/link";
import { formatDate } from "@/lib/labels";
import {
  tarefaAtrasada,
  tarefaPrioridadeClass,
  tarefaPrioridadeLabel,
  tarefaStatusClass,
  tarefaStatusLabel,
  tarefaVenceHoje,
  type Tarefa,
} from "@/types/modules/tarefas";

export default async function TarefasPage() {
  const { supabase, user, profile } = await requireSession();
  await exigirPermissao("tarefas", "tarefas", "read");
  const coordena = canManageStock(profile?.role);
  const podeCriar = await pode("tarefas", "tarefas", "create");

  let query = supabase
    .from("tarefas")
    .select(
      `
      *,
      assigned_to:profiles!tarefas_assigned_to_fkey(id, full_name, email),
      assigned_group:user_groups!tarefas_assigned_group_id_fkey(id, name),
      criada_por:profiles!tarefas_created_by_fkey(id, full_name, email)
      `
    )
    .order("created_at", { ascending: false });

  if (!coordena) {
    // Um único or() — dois encadeados virariam E, e quem só tem tarefa do grupo
    // as perderia todas.
    const corpo = [
      `created_by.eq.${user.id}`,
      `assigned_to.eq.${user.id}`,
      profile?.group_id ? `assigned_group_id.eq.${profile.group_id}` : null,
    ]
      .filter(Boolean)
      .join(",");
    query = query.or(corpo);
  }

  const { data: tarefas } = await query.returns<Tarefa[]>();

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Tarefas</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {coordena
              ? "Todas as tarefas da equipe, com prazo, responsável e situação."
              : "Suas tarefas: as que você abriu e as que ficaram com você."}
          </p>
        </div>
        {podeCriar && (
          <Link
            href="/dashboard/tarefas/nova"
            className="px-4 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors"
          >
            Nova Tarefa
          </Link>
        )}
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        <div className="neo-flat overflow-x-auto">
          <table className="w-full sm:min-w-[900px] tabela-mobile">
            <thead className="bg-[var(--neo-flat)] border-b border-[var(--neo-line)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Título
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Situação
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Prioridade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Responsável
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Prazo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-[var(--neo-bg)] divide-y divide-[var(--neo-line)]">
              {tarefas && tarefas.length > 0 ? (
                tarefas.map((tarefa) => {
                  const atrasada = tarefaAtrasada(tarefa);
                  const venceHoje = tarefaVenceHoje(tarefa);
                  return (
                    <tr key={tarefa.id} className="hover:bg-[var(--neo-flat)]">
                      <td data-rotulo="Código" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                        {tarefa.codigo}
                      </td>
                      <td data-rotulo="Título" className="px-6 py-4 text-sm text-[var(--text)]">
                        {tarefa.titulo}
                      </td>
                      <td data-rotulo="Situação" className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tarefaStatusClass(tarefa.status)}`}>
                          {tarefaStatusLabel(tarefa.status)}
                        </span>
                      </td>
                      <td data-rotulo="Prioridade" className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tarefaPrioridadeClass(tarefa.prioridade)}`}>
                          {tarefaPrioridadeLabel(tarefa.prioridade)}
                        </span>
                      </td>
                      <td data-rotulo="Responsável" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                        {tarefa.assigned_to?.full_name || tarefa.assigned_to?.email || tarefa.assigned_group?.name || "—"}
                      </td>
                      <td data-rotulo="Prazo" className="px-6 py-4 whitespace-nowrap text-sm">
                        {tarefa.prazo ? (
                          <span
                            className={
                              atrasada
                                ? "font-semibold text-[var(--erro-fg)]"
                                : venceHoje
                                  ? "font-semibold text-[var(--aviso-fg)]"
                                  : "text-[var(--text-muted)]"
                            }
                          >
                            {formatDate(tarefa.prazo)}
                            {atrasada && " · atrasada"}
                            {venceHoje && " · hoje"}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/dashboard/tarefas/${tarefa.id}`}
                          className="text-[var(--primary)] hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-[var(--text-muted)]">
                    Nenhuma tarefa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}