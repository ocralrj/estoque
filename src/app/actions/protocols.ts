"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
import { generateRecordCode } from "@/lib/codes";
import type { ProtocolPriority, ProtocolStatus } from "@/types/database";

export async function createProtocol(formData: FormData) {
  const { supabase, user, profile } = await getSession();
  if (!user) throw new Error("Não autenticado");
  const permitido = await exigir("protocolos", "protocolos", "create");
  if (!permitido.ok) throw new Error(permitido.message);

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const priority = (formData.get("priority") as ProtocolPriority) || "media";
  const assigned_to = (formData.get("assigned_to") as string) || null;

  if (!title) {
    throw new Error("Título é obrigatório");
  }

  const nup = generateRecordCode("NUP");

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
  const { supabase, user, profile } = await getSession();
  if (!user) throw new Error("Não autenticado");
  const permitido = await exigir("protocolos", "protocolos", "update");
  if (!permitido.ok) throw new Error(permitido.message);

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
  const { supabase, user, profile } = await getSession();
  if (!user) throw new Error("Não autenticado");
  const permitido = await exigir("protocolos", "protocolos", "delete");
  if (!permitido.ok) throw new Error(permitido.message);

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
