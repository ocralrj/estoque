"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ProtocolStatus =
  | "aberto"
  | "em_andamento"
  | "concluido"
  | "cancelado";

export type ProtocolPriority = "baixa" | "media" | "alta";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile };
}

function isManager(role?: string | null) {
  return role === "super_admin" || role === "gestor";
}

export async function createProtocol(formData: FormData) {
  const { supabase, user, profile } = await requireUser();
  if (!user) throw new Error("Não autenticado");

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = (formData.get("priority") as ProtocolPriority) || "media";
  const assigned_to = (formData.get("assigned_to") as string) || null;

  if (!title) {
    throw new Error("Título é obrigatório");
  }

  const now = new Date();
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const nup = `NUP-${ymd}-${String(Date.now()).slice(-4)}`;

  const payload: Record<string, unknown> = {
    nup,
    title: title.slice(0, 180),
    description: description || null,
    priority,
    requester_id: user.id,
    status: "aberto",
  };

  if (isManager(profile?.role) && assigned_to) {
    payload.assigned_to = assigned_to;
  }

  const { error } = await supabase.from("protocolos").insert(payload);
  if (error) {
    throw new Error(error.message || "Erro ao criar protocolo");
  }

  revalidatePath("/dashboard/protocolos");
}

export async function updateProtocol(protocolId: string, formData: FormData) {
  const { supabase, user, profile } = await requireUser();
  if (!user) throw new Error("Não autenticado");

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = (formData.get("priority") as ProtocolPriority) || "media";
  const status = (formData.get("status") as ProtocolStatus) || "aberto";
  const assigned_to = (formData.get("assigned_to") as string) || null;

  if (!title) {
    throw new Error("Título é obrigatório");
  }

  const payload: Record<string, unknown> = {
    title: title.slice(0, 180),
    description: description || null,
    priority,
  };

  if (isManager(profile?.role)) {
    payload.status = status;
    payload.assigned_to = assigned_to;
  }

  const query = supabase.from("protocolos").update(payload).eq("id", protocolId);
  if (!isManager(profile?.role)) {
    query.eq("requester_id", user.id);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message || "Erro ao atualizar protocolo");
  }

  revalidatePath("/dashboard/protocolos");
  revalidatePath(`/dashboard/protocolos/${protocolId}`);
}

export async function deleteProtocol(protocolId: string) {
  const { supabase, user, profile } = await requireUser();
  if (!user) throw new Error("Não autenticado");

  const query = supabase.from("protocolos").delete().eq("id", protocolId);
  if (!isManager(profile?.role)) {
    query.eq("requester_id", user.id);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message || "Erro ao excluir protocolo");
  }

  revalidatePath("/dashboard/protocolos");
}
