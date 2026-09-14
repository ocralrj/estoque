import { redirect } from "next/navigation";
import { exigirPermissao, pode } from "@/lib/permissoes";
import { requireSession, canManageStock } from "@/lib/auth";
import DetalheTarefa, { type Nomeacao } from "./DetalheTarefa";
import type { Tarefa } from "@/types/modules/tarefas";

/**
 * Detalhe de uma tarefa.
 *
 * A linha vem do servidor com os nomes embutidos (FKs nomeadas — tarefas tem
 * três ligações com profiles). A pergunta de quem participa também é
 * respondida aqui: é o que decide se os botões de situação aparecem. A guarda
 * de verdade, porém, é o par Server Action + RLS.
 */
export default async function TarefaDetalhePage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, user, profile } = await requireSession();
  await exigirPermissao("tarefas", "tarefas", "read");

  const podeAtribuir = await pode("tarefas", "tarefas", "manage");
  const coordena = canManageStock(profile?.role);

  const { data: tarefa, error } = await supabase
    .from("tarefas")
    .select(
      `
      *,
      assigned_to:profiles!tarefas_assigned_to_fkey(id, full_name, email),
      assigned_group:user_groups!tarefas_assigned_group_id_fkey(id, name),
      criada_por:profiles!tarefas_created_by_fkey(id, full_name, email),
      concluida_por:profiles!tarefas_concluida_por_fkey(id, full_name, email)
      `
    )
    .eq("id", params.id)
    .single();

  if (error || !tarefa) {
    redirect("/dashboard/tarefas");
  }

  const t = tarefa as Tarefa;

  // Participação: abriu, foi nomeado ou é do grupo responsável. Quem coordena
  // sempre participa (vê todas, move todas).
  const participa = coordena
    ? true
    : t.created_by === user.id ||
      t.assigned_to_id === user.id ||
      (t.assigned_group_id != null && t.assigned_group_id === profile?.group_id);

  const [{ data: pessoas }, { data: grupos }] = podeAtribuir
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("active", true)
          .order("full_name", { nullsFirst: false }),
        supabase.from("user_groups").select("id, name, nivel").order("nivel"),
      ])
    : [{ data: [] }, { data: [] }];

  const nomeacoes: (p: { id: string; full_name?: string | null; email?: string }) => Nomeacao = (
    p
  ) => ({
    id: p.id as string,
    nome: (p.full_name as string | null) || (p.email as string),
  });

  return (
    <DetalheTarefa
      tarefa={t}
      podeAtribuir={podeAtribuir}
      coordena={coordena}
      participa={participa}
      pessoas={(pessoas ?? []).map(nomeacoes)}
      grupos={(grupos ?? []).map((g) => ({
        id: g.id as string,
        nome: g.name as string,
      }))}
    />
  );
}