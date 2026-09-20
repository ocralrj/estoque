import { exigirPermissao, pode } from "@/lib/permissoes";
import { requireSession } from "@/lib/auth";
import Link from "next/link";
import KanbanTarefas from "./KanbanTarefas";
import type { Tarefa, TarefaComentario } from "@/types/modules/tarefas";

/**
 * Quadro Kanban de tarefas.
 *
 * Pessoa para pessoa: cada um vê onde é solicitante ou executor; o super admin
 * vê todo o quadro. O servidor traz as tarefas com os nomes embutidos (FKs
 * nomeadas — tarefas liga três vezes com profiles) e o histórico/comentários
 * de cada uma, agrupados no cliente para alimentar o card e o accordion.
 */
export default async function TarefasPage() {
  const { supabase, user, profile } = await requireSession();
  await exigirPermissao("tarefas", "tarefas", "read");
  const ehSuperAdmin = profile?.role === "super_admin";
  const podeCriar = await pode("tarefas", "tarefas", "create");

  let query = supabase
    .from("tarefas")
    .select(
      `
      *,
      executor:profiles!tarefas_assigned_to_fkey(id, full_name, email),
      criada_por:profiles!tarefas_created_by_fkey(id, full_name, email),
      concluida_por:profiles!tarefas_concluida_por_fkey(id, full_name, email)
      `
    )
    .order("prazo", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!ehSuperAdmin) {
    // Um único or() — dois encadeados virariam E, e um lado ficaria de fora.
    const corpo = [`created_by.eq.${user.id}`, `assigned_to.eq.${user.id}`]
      .filter(Boolean)
      .join(",");
    query = query.or(corpo);
  }

  const { data: tarefas } = await query.returns<Tarefa[]>();
  const lista = tarefas ?? [];
  const ids = lista.map((t) => t.id);

  // Histórico e comentários das tarefas visíveis, num só passe.
  const { data: comentarios } =
    ids.length > 0
      ? await supabase
          .from("tarefa_comentarios")
          .select(
            `
            *,
            autor:profiles!tarefa_comentarios_autor_id_fkey(id, full_name, email)
            `
          )
          .in("tarefa_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] };

  const porTarefa = new Map<string, TarefaComentario[]>();
  for (const madeira of comentarios ?? []) {
    const grupo = porTarefa.get(madeira.tarefa_id) ?? [];
    grupo.push(madeira);
    porTarefa.set(madeira.tarefa_id, grupo);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Tarefas</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {ehSuperAdmin
              ? "Quadro da equipe: cada card anda por aguardando, em andamento, confirmação, concluída e cancelada."
              : "Suas tarefas: você pediu ou foi nomeado. O executor executa; quem pediu valida."}
          </p>
        </div>
        {podeCriar && (
          <Link
            href="/dashboard/tarefas/nova"
            className="neo-btn neo-btn--primario !min-h-[40px] !px-4 !py-2 text-sm"
          >
            Nova Tarefa
          </Link>
        )}
      </div>

      <KanbanTarefas
        tarefas={lista}
        comentariosPorTarefa={porTarefa}
        meuId={user.id}
        ehSuperAdmin={ehSuperAdmin}
      />
    </div>
  );
}