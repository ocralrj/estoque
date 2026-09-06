"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { generateRecordCode } from "@/lib/codes";
import type { GedSetor, GedStatus } from "@/types/modules/ged";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** Papéis que mantêm o acervo — espelha as políticas de schema_ged.sql. */
const PAPEIS_GED = ["super_admin", "gestor", "almoxarife"];

function podeManter(role?: string | null): boolean {
  return PAPEIS_GED.includes(role ?? "");
}

export interface DocumentoInput {
  cliente: string;
  cnpj?: string | null;
  setor: GedSetor;
  tipo: string;
  nome: string;
  status: GedStatus;
  periodo?: string | null;
  data_documento?: string | null;
  validade?: string | null;
  categoria?: string | null;
  resumo?: string | null;
  tags?: string[];
  folder_id?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  tamanho_original_bytes?: number | null;
  compressao?: "nenhuma" | "imagem" | "gzip";
}

function validar(input: DocumentoInput): string | null {
  if (!input.nome?.trim()) return "Informe o nome do documento.";
  if (input.nome.trim().length < 3) return "O nome deve ter ao menos 3 caracteres.";
  if (!input.cliente?.trim()) return "Informe o cliente.";
  if (!input.tipo?.trim()) return "Informe o tipo do documento.";
  if (!input.setor) return "Escolha o setor.";
  if (input.validade && input.data_documento && input.validade < input.data_documento) {
    return "A validade não pode ser anterior à data do documento.";
  }
  return null;
}

/** Campos aceitos do cliente, já aparados. Nada além disso chega ao banco. */
function montarPayload(input: DocumentoInput) {
  return {
    cliente: input.cliente.trim().slice(0, 160),
    cnpj: input.cnpj?.trim() || null,
    setor: input.setor,
    tipo: input.tipo.trim().slice(0, 80),
    nome: input.nome.trim().slice(0, 200),
    status: input.status,
    periodo: input.periodo?.trim() || null,
    data_documento: input.data_documento || null,
    validade: input.validade || null,
    categoria: input.categoria?.trim().slice(0, 80) || null,
    resumo: input.resumo?.trim().slice(0, 2000) || null,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20),
    folder_id: input.folder_id || null,
  };
}

function revalidarGed(id?: string) {
  revalidatePath("/dashboard/ged");
  revalidatePath("/dashboard/ged/documentos");
  revalidatePath("/dashboard/ged/busca");
  if (id) revalidatePath(`/dashboard/ged/documentos/${id}`);
}

export async function criarDocumento(
  input: DocumentoInput
): Promise<ActionResult<{ id: string; codigo: string }>> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const erro = validar(input);
  if (erro) return { ok: false, message: erro };

  const codigo = generateRecordCode("GED");

  const { data, error } = await supabase
    .from("ged_documents")
    .insert({
      ...montarPayload(input),
      codigo,
      responsavel_id: user.id,
      created_by: user.id,
      storage_path: input.storage_path || null,
      mime_type: input.mime_type || null,
      tamanho_bytes: input.tamanho_bytes ?? null,
      tamanho_original_bytes: input.tamanho_original_bytes ?? null,
      compressao: input.compressao ?? "nenhuma",
    })
    .select("id, codigo")
    .single();

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        ok: false,
        message:
          "As tabelas do GED ainda não existem. No Supabase, execute supabase/schema_ged.sql e depois _manual_apply/005_ged_arquivos.sql.",
      };
    }
    if (error.code === "42703") {
      return {
        ok: false,
        message:
          "Faltam colunas de arquivo no GED. Execute supabase/_manual_apply/005_ged_arquivos.sql no SQL Editor.",
      };
    }
    return { ok: false, message: "Não foi possível salvar o documento." };
  }

  revalidarGed();
  return { ok: true, data: data as { id: string; codigo: string } };
}

export async function atualizarDocumento(
  id: string,
  input: DocumentoInput
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const erro = validar(input);
  if (erro) return { ok: false, message: erro };

  const payload: Record<string, unknown> = montarPayload(input);

  // Arquivo só é tocado quando um novo foi enviado — editar metadados não
  // pode apagar o vínculo com o binário que já está no storage.
  if (input.storage_path) {
    payload.storage_path = input.storage_path;
    payload.mime_type = input.mime_type || null;
    payload.tamanho_bytes = input.tamanho_bytes ?? null;
    payload.tamanho_original_bytes = input.tamanho_original_bytes ?? null;
    payload.compressao = input.compressao ?? "nenhuma";
  }

  const { error } = await supabase.from("ged_documents").update(payload).eq("id", id);

  if (error) return { ok: false, message: "Não foi possível atualizar o documento." };

  revalidarGed(id);
  return { ok: true, data: undefined };
}

export async function excluirDocumento(id: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const { data: doc } = await supabase
    .from("ged_documents")
    .select("storage_path, status")
    .eq("id", id)
    .single();

  if (doc?.status === "Assinado" && profile?.role !== "super_admin") {
    return {
      ok: false,
      message: "Documento assinado só pode ser excluído por um super admin.",
    };
  }

  const { error } = await supabase.from("ged_documents").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir o documento." };

  // O binário sai depois do registro: se a remoção do arquivo falhar, sobra um
  // órfão no bucket — bem menos grave que um registro apontando para o vazio.
  if (doc?.storage_path) {
    await supabase.storage.from("ged").remove([doc.storage_path]);
  }

  revalidarGed();
  return { ok: true, data: undefined };
}

/** URL temporária de download. O bucket é privado, então não há link fixo. */
export async function urlDeDownload(
  storagePath: string
): Promise<ActionResult<{ url: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { data, error } = await supabase.storage
    .from("ged")
    .createSignedUrl(storagePath, 120);

  if (error || !data) return { ok: false, message: "Não foi possível gerar o link." };
  return { ok: true, data: { url: data.signedUrl } };
}
