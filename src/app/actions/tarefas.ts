"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import { generateRecordCode } from "@/lib/codes";
import type { Tarefa, TarefaPrioridade, TarefaStatus } from "@/types/modules/tarefas";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

interface CabecalhoDaTarefa {
  id: string;
  codigo: string;
  status: TarefaStatus;
  created_by: string;
  assigned_to: string | null;
}

/** Máscara para nunca devolver a linha inteira em erro. */
async function lerTarefa(id: string): Promise<CabecalhoDaTarefa | null> {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("tarefas")
    .select("id, codigo, status, created_by, assigned_to")
    .eq("id", id)
    .single();
  return (data as CabecalhoDaTarefa | null) ?? null;
}

/** Pessoa para pessoa: participa quem pediu ou quem foi nomeado. */
function participa(
  tarefa: CabecalhoDaTarefa,
  userId: string
): boolean {
  return tarefa.created_by === userId || tarefa.assigned_to === userId;
}

/**
 * Transições que fazem sentido em cada estado. O RLS e o gatilho do banco
 * são a barreira de verdade; aqui é a conveniência de avisar cedo.
 */
const TRANSICOES_VALIDAS: Record<TarefaStatus, TarefaStatus[]> = {
  aguardando: ["em_andamento", "cancelada"],
  em_andamento: ["aguardando", "confirmacao", "cancelada"],
  confirmacao: ["em_andamento", "concluida", "cancelada"],
  concluida: [],
  cancelada: [],
};

/**
 * Cria uma tarefa. Pessoa para pessoa: criador é o solicitante (o próprio
 * usuário) e o executor é obrigatório — não existe mais "ninguém" nem grupo.
 */
export async function criarTarefa(formData: FormData): Promise<
  Resultado<{ id: string; codigo: string }>
> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "create");
  if (!permitido.ok) return permitido;

  const titulo = (formData.get("titulo") as string)?.trim();
  const descricao = (formData.get("descricao") as string)?.trim();
  const prioridade = (formData.get("prioridade") as TarefaPrioridade) || "media";
  const prazo = (formData.get("prazo") as string)?.trim() || null;
  const assigned_to = (formData.get("assigned_to") as string) || null;

  if (!titulo) {
    return { ok: false, message: "Dê um título para a tarefa." };
  }
  if (!assigned_to) {
    return { ok: false, message: "Escolha quem vai executar a tarefa." };
  }
  if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) {
    return { ok: false, message: "Prazo inválido." };
  }

  const codigo = generateRecordCode("TAR");

  const payload: Record<string, unknown> = {
    codigo,
    titulo: titulo.slice(0, 120),
    descricao: descricao?.slice(0, 4000) || null,
    prioridade: prioridade.slice(0, 10).toLowerCase(),
    prazo,
    created_by: user.id,
    assigned_to,
    status: "aguardando",
  };

  const { data, error } = await supabase
    .from("tarefas")
    .insert(payload)
    .select("id, codigo")
    .single();

  if (error) {
    // Banco sem a tabela: o schema ainda não foi aplicado. Dizer o que fazer
    // é melhor do que mostrar o erro cru do Postgres.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return {
        ok: false,
        message:
          "O módulo de tarefas ainda não está configurado. Avise a administração.",
      };
    }
    console.error("Falha ao criar tarefa:", (error as { message?: string })?.message ?? error);
    return { ok: false, message: "Não foi possível criar a tarefa." };
  }

  revalidatePath("/dashboard/tarefas");
  revalidatePath("/dashboard/tarefas/nova");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: { id: (data.id as string) ?? "", codigo: (data.codigo as string) ?? codigo },
  };
}

/**
 * Edita os campos de uma tarefa (título, descrição, prioridade, prazo e — para
 * quem pediu — o executor). A situação não entra aqui de propósito: ela caminha
 * por ações próprias (iniciar, marcar como feita, validar, devolver, cancelar),
 * cada uma com a sua regra.
 */
export async function atualizarTarefa(
  tarefaId: string,
  formData: FormData
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "update");
  if (!permitido.ok) return permitido;

  const tarefa = await lerTarefa(tarefaId);
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada." };
  if (!participa(tarefa, user.id)) {
    return { ok: false, message: "Você não participa desta tarefa." };
  }

  const titulo = (formData.get("titulo") as string)?.trim();
  const descricao = (formData.get("descricao") as string)?.trim();
  const prioridade = (formData.get("prioridade") as TarefaPrioridade) || "media";
  const prazo = (formData.get("prazo") as string)?.trim() || null;
  const assigned_to = (formData.get("assigned_to") as string) || null;

  if (!titulo) {
    return { ok: false, message: "Dê um título para a tarefa." };
  }
  if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) {
    return { ok: false, message: "Prazo inválido." };
  }

  const payload: Record<string, unknown> = {
    titulo: titulo.slice(0, 120),
    descricao: descricao?.slice(0, 4000) || null,
    prioridade: prioridade.slice(0, 10).toLowerCase(),
    prazo,
  };

  // Só quem pediu troca o executor — o nomeado não repassa a própria tarefa.
  if (tarefa.created_by === user.id) {
    if (!assigned_to) {
      return { ok: false, message: "A tarefa precisa de um executor." };
    }
    payload.assigned_to = assigned_to;
  }

  const { error } = await supabase
    .from("tarefas")
    .update(payload)
    .eq("id", tarefaId);

  if (error) {
    console.error("Falha ao atualizar tarefa:", error);
    return { ok: false, message: "Não foi possível salvar as alterações." };
  }

  revalidatePath("/dashboard/tarefas");
  revalidatePath(`/dashboard/tarefas/${tarefaId}`);
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}

/**
 * Movimenta a situação da tarefa. As regras de transição e de papel vivem no
 * gatilho do banco; aqui repetimos a mesma grade para dar a mensagem certa
 * antes, mas o que vale é o par RLS + gatilho.
 */
export async function mudarStatusTarefa(
  tarefaId: string,
  proximo: TarefaStatus
): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "update");
  if (!permitido.ok) return permitido;

  const tarefa = await lerTarefa(tarefaId);
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada." };

  const ehAdmin = profile?.role === "super_admin";
  const papel = ehAdmin
    ? "admin"
    : tarefa.created_by === user.id
      ? "solicitante"
      : tarefa.assigned_to === user.id
        ? "executor"
        : "fora";

  if (papel === "fora") {
    return { ok: false, message: "Você não participa desta tarefa." };
  }

  if (!TRANSICOES_VALIDAS[tarefa.status]?.includes(proximo)) {
    return { ok: false, message: "Esta mudança de situação não é permitida." };
  }

  // Validação final: exclusiva de quem pediu — nem o super admin valida.
  if (proximo === "concluida" && papel !== "solicitante") {
    return {
      ok: false,
      message: "Apenas quem solicitou a tarefa pode confirmar a conclusão.",
    };
  }
  // Marcar como feita só o executor.
  if (proximo === "confirmacao" && papel !== "executor" && papel !== "admin") {
    return {
      ok: false,
      message: "Apenas o executor pode marcar a tarefa como feita.",
    };
  }
  // Iniciar só o executor.
  if (
    tarefa.status === "aguardando" &&
    proximo === "em_andamento" &&
    papel !== "executor" &&
    papel !== "admin"
  ) {
    return {
      ok: false,
      message: "Apenas quem vai executar (ou a gestão) pode iniciar a tarefa.",
    };
  }
  // Cancelar é de quem pediu ou do executor (recusa no encaminhamento).
  if (proximo === "cancelada" && papel === "fora") {
    return { ok: false, message: "Você não pode cancelar esta tarefa." };
  }

  const { error } = await supabase
    .from("tarefas")
    .update({ status: proximo })
    .eq("id", tarefaId);

  if (error) {
    console.error("Falha ao mover situação da tarefa:", error);
    return { ok: false, message: "Não foi possível mudar a situação da tarefa." };
  }

  revalidatePath("/dashboard/tarefas");
  revalidatePath(`/dashboard/tarefas/${tarefaId}`);
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}

/**
 * Comenta uma tarefa. Vai para o histórico e avisa a outra parte envolvida
 * (o gatilho do banco se encarrega da notificação).
 */
export async function comentarTarefa(
  tarefaId: string,
  texto: string
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "update");
  if (!permitido.ok) return permitido;

  const textoLimpo = texto?.trim();
  if (!textoLimpo) {
    return { ok: false, message: "Escreva o comentário antes de enviar." };
  }

  const tarefa = await lerTarefa(tarefaId);
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada." };
  if (!participa(tarefa, user.id)) {
    return { ok: false, message: "Você não participa desta tarefa." };
  }

  const { error } = await supabase.from("tarefa_comentarios").insert({
    tarefa_id: tarefaId,
    autor_id: user.id,
    tipo: "comentario",
    texto: textoLimpo.slice(0, 1000),
  });

  if (error) {
    console.error("Falha ao comentar tarefa:", error);
    return { ok: false, message: "Não foi possível enviar o comentário." };
  }

  revalidatePath("/dashboard/tarefas");
  revalidatePath(`/dashboard/tarefas/${tarefaId}`);
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}

/** Exclui uma tarefa do mundo (o histórico vai junto). Só quem pediu ou o super admin. */
export async function excluirTarefa(tarefaId: string): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "delete");
  if (!permitido.ok) return permitido;

  const tarefa = await lerTarefa(tarefaId);
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada." };

  if (tarefa.created_by !== user.id && profile?.role !== "super_admin") {
    return { ok: false, message: "Apenas quem pediu ou o administrador remove tarefas." };
  }

  const { error } = await supabase.from("tarefas").delete().eq("id", tarefaId);

  if (error) {
    console.error("Falha ao excluir tarefa:", error);
    return { ok: false, message: "Não foi possível excluir a tarefa." };
  }

  revalidatePath("/dashboard/tarefas");
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}