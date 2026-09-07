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
  const assigned_group_id = (formData.get("assigned_group_id") as string) || null;

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

  // Atribuir é ação de quem administra o fluxo: sem a permissão, o protocolo
  // nasce na fila geral mesmo que o campo chegue preenchido.
  const podeAtribuir = await exigir("protocolos", "protocolos", "manage");
  if (podeAtribuir.ok) {
    if (assigned_to) payload.assigned_to = assigned_to;
    if (assigned_group_id) payload.assigned_group_id = assigned_group_id;
  }

  const { data, error } = await supabase
    .from("protocolos")
    .insert(payload)
    .select("id, nup")
    .single();

  if (error) {
    throw new Error(error.message || "Erro ao criar protocolo");
  }

  revalidatePath("/dashboard/protocolos");

  // Devolve o id porque o anexo só pode ser ligado depois que o protocolo
  // existe: o arquivo vira documento do GED apontando para ele.
  return { id: data.id as string, nup: data.nup as string };
}

export interface AnexoDeProtocolo {
  protocoloId: string;
  nome: string;
  storagePath: string;
  mimeType: string;
  tamanhoBytes: number;
  tamanhoOriginalBytes: number;
  compressao: string;
  /** Ids de quem mais pode ler o anexo, além dos participantes do protocolo. */
  compartilharCom?: string[];
}

/**
 * Arquiva o anexo do protocolo como documento do GED.
 *
 * O arquivo não fica pendurado no protocolo: vira documento do acervo, e com
 * isso herda o que o GED já sabe fazer — controle de quem lê, trilha de
 * auditoria, prazo de guarda, busca. E fica de quem o anexou, não do
 * protocolo: encerrar a solicitação não faz o documento desaparecer.
 *
 * O envio do binário acontece no navegador, que já compacta antes de subir;
 * aqui só se registra o que foi gravado.
 */
export async function anexarAoProtocolo(
  entrada: AnexoDeProtocolo
): Promise<{ ok: true; documentoId: string } | { ok: false; message: string }> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("ged", "documents", "create");
  if (!permitido.ok) return permitido;

  const { data: protocolo } = await supabase
    .from("protocolos")
    .select("id, nup, title, requester_id, assigned_to")
    .eq("id", entrada.protocoloId)
    .single();

  if (!protocolo) return { ok: false, message: "Protocolo não encontrado." };

  // Só quem participa do protocolo anexa nele. Sem isto, um id de protocolo
  // alheio chegando por aqui penduraria um documento na solicitação de outra
  // pessoa.
  const participa =
    protocolo.requester_id === user.id ||
    protocolo.assigned_to === user.id ||
    isManager(profile?.role);

  if (!participa) {
    return { ok: false, message: "Você não participa deste protocolo." };
  }

  const { data: documento, error } = await supabase
    .from("ged_documents")
    .insert({
      codigo: generateRecordCode("DOC"),
      nome: entrada.nome.slice(0, 200),
      cliente: `Protocolo ${protocolo.nup}`,
      setor: profile?.departamento || "Administrativo",
      tipo: "Anexo de protocolo",
      status: "Ativo",
      resumo: `Anexado ao protocolo ${protocolo.nup} — ${protocolo.title}`,
      storage_path: entrada.storagePath,
      mime_type: entrada.mimeType,
      tamanho_bytes: entrada.tamanhoBytes,
      tamanho_original_bytes: entrada.tamanhoOriginalBytes,
      compressao: entrada.compressao,
      // Restrito: quem anexou, quem participa do protocolo (regra no banco) e
      // quem for compartilhado nominalmente. Um anexo de solicitação não é
      // assunto do departamento inteiro por padrão.
      visibilidade: "restrito",
      protocolo_id: entrada.protocoloId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return {
        ok: false,
        message:
          "Falta a coluna de vínculo com o protocolo. Execute supabase/_manual_apply/021_anexo_do_protocolo.sql.",
      };
    }
    return { ok: false, message: "Não foi possível arquivar o anexo." };
  }

  const convidados = (entrada.compartilharCom ?? []).filter(
    (id) => id && id !== user.id
  );

  if (convidados.length > 0) {
    await supabase.from("ged_document_access").insert(
      convidados.map((userId) => ({
        document_id: documento.id,
        user_id: userId,
        nivel: "leitura",
        granted_by: user.id,
      }))
    );
  }

  revalidatePath("/dashboard/protocolos");
  revalidatePath(`/dashboard/protocolos/${entrada.protocoloId}`);
  revalidatePath("/dashboard/ged/documentos");

  return { ok: true, documentoId: documento.id as string };
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
  const assigned_group_id = (formData.get("assigned_group_id") as string) || null;

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
