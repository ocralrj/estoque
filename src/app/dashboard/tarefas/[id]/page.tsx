import { redirect } from "next/navigation";
import { exigirPermissao, pode } from "@/lib/permissoes";
import { requireSession } from "@/lib/auth";
import DetalheTarefa, { type Nomeacao } from "./DetalheTarefa";
import type { Tarefa, TarefaComentario } from "@/types/modules/tarefas";

/**
 * Detalhe de uma tarefa.
 *
 * A linha vem do servidor com os nomes embutidos (FKs nomeadas — tarefas liga
 * três vezes com profiles). A pergunta de quem participa também é respondida
 * aqui: é o que decide se os botões de situação aparecem. A guarda de verdade,
 * porém, é o par Server Action + RLS.
 */
export default async function TarefaDetalhePage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, user, profile } = await requireSession();
  await exigirPermissao("tarefas", "tarefas", "read");

  const podeAtribuir = await pode("tarefas", "tarefas", "manage");

  const { data: tarefa, error } = await supabase
    .from("tarefas")
    .select(
      `
      *,
      executor:profiles!tarefas_assigned_to_fkey(id, full_name, email),
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

  // Participação: abriu ou foi nomeada. O super admin vê tudo.
  const participa =
    profile?.role === "super_admin" ||
    t.created_by === user.id ||
    t.assigned_to === user.id;

  const [{ data: pessoas }, { data: comentarios }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("active", true)
      .order("full_name", { nullsFirst: false }),
    supabase
      .from("tarefa_comentarios")
      .select(
        `
        *,
        autor:profiles!tarefa_comentarios_autor_id_fkey(id, full_name, email)
        `
      )
      .eq("tarefa_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const nomeacoes: (p: {
    id: string;
    full_name?: string | null;
    email?: string;
  }) => Nomeacao = (p) => ({
    id: p.id as string,
    nome: (p.full_name as string | null) || (p.email as string),
  });

  return (
    <DetalheTarefa
      tarefa={t}
      podeAtribuir={podeAtribuir}
      participa={participa}
      ehSuperAdmin={profile?.role === "super_admin"}
      meuId={user.id}
      pessoas={(pessoas ?? []).map(nomeacoes)}
      comentarios={(comentarios ?? []) as TarefaComentario[]}
    />
  );
}