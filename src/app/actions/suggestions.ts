"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
import { generateRecordCode } from "@/lib/codes";
import type {
  CreateSuggestionInput,
  ImprovementSuggestion,
  SuggestionPriority,
  SuggestionStatus,
} from "@/types/modules/suggestions";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export async function createSuggestion(
  input: CreateSuggestionInput
): Promise<ActionResult<ImprovementSuggestion>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("sugestoes", "minhas", "create");
  if (!permitido.ok) return permitido;

  const title = input.title?.trim();
  const raw_idea = input.raw_idea?.trim();
  const summary = input.summary?.trim();

  if (!title || title.length < 5) {
    return { ok: false, message: "Título deve ter ao menos 5 caracteres." };
  }
  if (!raw_idea || raw_idea.length < 10) {
    return { ok: false, message: "Descreva a ideia com mais detalhes." };
  }
  if (!summary || summary.length < 10) {
    return { ok: false, message: "Gere o resumo antes de enviar." };
  }

  const code = generateRecordCode("SUG");

  const { data, error } = await supabase
    .from("improvement_suggestions")
    .insert({
      code,
      user_id: user.id,
      title: title.slice(0, 120),
      raw_idea: raw_idea.slice(0, 4000),
      summary: summary.slice(0, 4000),
      what_wanted: input.what_wanted?.slice(0, 1000) || null,
      why_wanted: input.why_wanted?.slice(0, 1000) || null,
      conversation: input.conversation || [],
      status: "enviada",
      priority: input.priority || "media",
      module_hint: input.module_hint || null,
    })
    .select()
    .single();

  if (error) {
    const msg = error.message || "Erro ao salvar sugestão";
    if (
      /improvement_suggestions/i.test(msg) ||
      /schema cache/i.test(msg) ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      return {
        ok: false,
        message:
          "Tabela de sugestões ainda não existe no banco. No Supabase, abra SQL Editor e execute o arquivo supabase/schema_sugestoes.sql, depois tente de novo.",
      };
    }
    return { ok: false, message: msg };
  }

  revalidatePath("/dashboard/sugestoes");
  revalidatePath("/dashboard/admin/sugestoes");
  return { ok: true, data: data as ImprovementSuggestion };
}

export async function listMySuggestions(): Promise<
  ActionResult<ImprovementSuggestion[]>
> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { data, error } = await supabase
    .from("improvement_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data || []) as ImprovementSuggestion[] };
}

export async function listAllSuggestions(): Promise<
  ActionResult<ImprovementSuggestion[]>
> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("sugestoes", "todas", "read");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) {
    return { ok: false, message: "Sem permissão" };
  }

  const { data, error } = await supabase
    .from("improvement_suggestions")
    .select(
      `
      *,
      user:profiles!improvement_suggestions_user_id_fkey(full_name, email)
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data || []) as ImprovementSuggestion[] };
}

export async function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  admin_notes?: string,
  priority?: SuggestionPriority
): Promise<ActionResult<ImprovementSuggestion>> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("sugestoes", "todas", "manage");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) {
    return { ok: false, message: "Sem permissão" };
  }

  const payload: Record<string, unknown> = {
    status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };
  if (admin_notes !== undefined) payload.admin_notes = admin_notes || null;
  if (priority) payload.priority = priority;

  const { data, error } = await supabase
    .from("improvement_suggestions")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/admin/sugestoes");
  revalidatePath("/dashboard/sugestoes");
  return { ok: true, data: data as ImprovementSuggestion };
}

export async function cancelMySuggestion(
  id: string
): Promise<ActionResult<void>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { error } = await supabase
    .from("improvement_suggestions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["rascunho", "enviada"]);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/sugestoes");
  return { ok: true, data: undefined };
}


/**
 * Responde na sugestão — serve aos dois lados.
 *
 * Quem responde e o que isso faz com o status é decidido no banco, na função
 * `responder_sugestao`: a gestão respondendo devolve a bola ao autor e conta a
 * volta; o autor respondendo traz de volta para análise. Deixar essa regra num
 * lugar só evita que as duas telas divirjam sobre o que é "responder".
 */
export async function responderSugestao(
  sugestaoId: string,
  texto: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { error } = await supabase.rpc("responder_sugestao", {
    p_sugestao: sugestaoId,
    p_texto: texto,
  });

  if (error) {
    if (error.message?.includes("PGRST202")) {
      return {
        ok: false,
        message:
          "O diálogo ainda não está no banco. Execute supabase/_manual_apply/025_dialogo_da_sugestao.sql.",
      };
    }
    return { ok: false, message: error.message || "Não foi possível enviar." };
  }

  revalidatePath("/dashboard/sugestoes");
  revalidatePath("/dashboard/admin/sugestoes");
  return { ok: true };
}

/** Encerra a sugestão. Só o autor — dar por resolvido o pedido de outra pessoa é decidir por ela. */
export async function marcarSugestaoAtendida(
  sugestaoId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { error } = await supabase.rpc("marcar_sugestao_atendida", {
    p_sugestao: sugestaoId,
  });

  if (error) {
    return { ok: false, message: error.message || "Não foi possível encerrar." };
  }

  revalidatePath("/dashboard/sugestoes");
  revalidatePath("/dashboard/admin/sugestoes");
  return { ok: true };
}
