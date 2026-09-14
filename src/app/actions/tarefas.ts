"use server";

import { revalidatePath } from "next/cache";
import { getSession, canManageStock } from "@/lib/auth";
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
  assigned_group_id: string | null;
}

/** Máscara para nunca devolver a linha inteira em erro. */
async function lerTarefa(id: string): Promise<CabecalhoDaTarefa | null> {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("tarefas")
    .select("id, codigo, status, created_by, assigned_to, assigned_group_id")
    .eq("id", id)
    .single();
  return (data as CabecalhoDaTarefa | null) ?? null;
}

/** Quem é desta tarefa: abriu, foi nomeado ou pertence ao grupo responsável. */
function participa(
  tarefa: CabecalhoDaTarefa,
  userId: string,
  groupId?: string | null
): boolean {
  if (tarefa.created_by === userId) return true;
  if (tarefa.assigned_to === userId) return true;
  if (tarefa.assigned_group_id && tarefa.assigned_group_id === groupId) return true;
  return false;
}

/** Transições que um participante simples pode fazer, dentro do próprio trabalho. */
const TRANSICOES_DO_PARTICIPANTE: Record<string, string[]> = {
  aberta: ["em_andamento", "cancelada"],
  em_andamento: ["aberta", "concluida", "cancelada"],
};

/**
 * Cria uma tarefa.
 *
 * A atribuição é ação de quem administra o fluxo: sem a permissão, a tarefa
 * nasce sem responsável mesmo que o campo chegue preenchido — quem não pode
 * atribuir cria para si.
 */
export async function criarTarefa(formData: FormData): Promise<
  Resultado<{ id: string; codigo: string }>
> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "create");
  if (!permitido.ok) return permitido;

  const titulo = (formData.get("titulo") as string)?.trim();
  const descricao = (formData.get("descricao") as string)?.trim();
  const prioridade = (formData.get("prioridade") as TarefaPrioridade) || "media";
  const prazo = (formData.get("prazo") as string)?.trim() || null;
  const assigned_to = (formData.get("assigned_to") as string) || null;
  const assigned_group_id = (formData.get("assigned_group_id") as string) || null;

  if (!titulo) {
    return { ok: false, message: "Dê um título para a tarefa." };
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
    status: "aberta",
  };

  const podeAtribuir = await exigir("tarefas", "tarefas", "manage");
  if (podeAtribuir.ok) {
    if (assigned_to) payload.assigned_to = assigned_to;
    if (assigned_group_id) payload.assigned_group_id = assigned_group_id;
  }

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
    console.error("Falha ao criar tarefa:", error);
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
 * Edita os campos de uma tarefa.
 *
 * A situação não entra aqui de propósito: ela caminha por ações próprias
 * (iniciar, concluir, cancelar, reabrir), cada uma com a sua regra. O formulário
 * genérico não pode pular estados.
 */
export async function atualizarTarefa(
  tarefaId: string,
  formData: FormData
): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "update");
  if (!permitido.ok) return permitido;

  const tarefa = await lerTarefa(tarefaId);
  const coordena = canManageStock(profile?.role);
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada." };
  if (!coordena && !participa(tarefa, user.id, profile?.group_id)) {
    return { ok: false, message: "Você não participa desta tarefa." };
  }

  const titulo = (formData.get("titulo") as string)?.trim();
  const descricao = (formData.get("descricao") as string)?.trim();
  const prioridade = (formData.get("prioridade") as TarefaPrioridade) || "media";
  const prazo = (formData.get("prazo") as string)?.trim() || null;
  const assigned_to = (formData.get("assigned_to") as string) || null;
  const assigned_group_id = (formData.get("assigned_group_id") as string) || null;

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

  // A atribuição é de coordenação. Sem a permissão, usamos filters que nunca
  // casam para garantir que nenhum campo de destino venha junto: o banco
  // continuaria o dono da regra, mas a intenção precisa ser explícita aqui.
  const podeAtribuir = await exigir("tarefas", "tarefas", "manage");
  if (podeAtribuir.ok) {
    payload.assigned_to = assigned_to || null;
    payload.assigned_group_id = assigned_group_id || null;
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
 * Movimenta a situação da tarefa.
 *
 * Quem participa move o próprio trabalho: inicia o que foi receber, conclui o
 * que estava fazendo, desfaz um engano. Cancelar e reabrir ficam com quem
 * coordena, salvo o criador desistindo de uma tarefa ainda parada.
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
  const coordena = canManageStock(profile?.role);
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada." };

  if (!coordena) {
    if (!participa(tarefa, user.id, profile?.group_id)) {
      return { ok: false, message: "Você não participa desta tarefa." };
    }
    const permitidas = TRANSICOES_DO_PARTICIPANTE[tarefa.status] ?? [];
    if (!permitidas.includes(proximo)) {
      return {
        ok: false,
        message:
          "Esta mudança de situação só pode ser feita por quem coordena as tarefas.",
      };
    }
    // Cancelar é do criador, não de qualquer participante do grupo.
    if (proximo === "cancelada" && tarefa.created_by !== user.id) {
      return {
        ok: false,
        message: "Só quem abriu a tarefa pode cancelá-la antes de ela sair de aberta.",
      };
    }
  }

  const { error } = await supabase
    .from("tarefas")
    .update({ status: proximo })
    .eq("id", tarefaId);

  // O gatilho de transição já barra pulos inválidos no banco; se ele falhar,
  // a mensagem crua não ajuda, mas a regra foi preservada.
  if (error) {
    console.error("Falha ao mover situação da tarefa:", error);
    return { ok: false, message: "Não foi possível mudar a situação da tarefa." };
  }

  revalidatePath("/dashboard/tarefas");
  revalidatePath(`/dashboard/tarefas/${tarefaId}`);
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}

/** Exclui uma tarefa do mundo. Restrito a quem administra as tarefas. */
export async function excluirTarefa(tarefaId: string): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("tarefas", "tarefas", "delete");
  if (!permitido.ok) return permitido;

  const coordena = canManageStock(profile?.role);
  if (!coordena) {
    return { ok: false, message: "Você não pode excluir tarefas." };
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