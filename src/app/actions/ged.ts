"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { generateRecordCode } from "@/lib/codes";
import { extrairDadosDoArquivo, type DadosExtraidos } from "@/lib/ai/extrair-documento";
import { checkRateLimit } from "@/lib/ai/rate-limit";
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
  visibilidade?: "todos" | "departamento" | "restrito";
  /** Regra de temporalidade; o banco calcula data_descarte a partir dela. */
  retention_rule_id?: string | null;
  /** Concessões por usuário quando a visibilidade é restrita. */
  acessos?: { user_id: string; nivel: "leitura" | "edicao" }[];
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
    visibilidade: input.visibilidade ?? "departamento",
    retention_rule_id: input.retention_rule_id || null,
  };
}

/**
 * Regrava as concessões do documento. Substitui o conjunto inteiro: a tela
 * envia sempre a lista completa, então o que sumiu foi removido de propósito.
 */
async function sincronizarAcessos(
  supabase: Awaited<ReturnType<typeof getSession>>["supabase"],
  documentId: string,
  concedidoPor: string,
  acessos: { user_id: string; nivel: "leitura" | "edicao" }[] | undefined
): Promise<string | null> {
  if (!acessos) return null;

  const validos = acessos
    .filter((a) => a.user_id && (a.nivel === "leitura" || a.nivel === "edicao"))
    .slice(0, 100);

  // Apaga só o que saiu da lista, em vez de zerar tudo e reinserir.
  //
  // A versão anterior fazia delete de todos e insert dos novos, sem olhar o
  // erro de nenhum dos dois. Se o insert falhasse depois de o delete ter
  // passado, o documento perdia TODO o compartilhamento — em silêncio, com a
  // tela dizendo que salvou. Trabalhando pela diferença, uma falha deixa o
  // que já existia de pé.
  const mantidos = validos.map((a) => a.user_id);

  const remocao = supabase
    .from("ged_document_access")
    .delete()
    .eq("document_id", documentId);

  const { error: erroRemocao } = await (mantidos.length > 0
    ? remocao.not("user_id", "in", `(${mantidos.join(",")})`)
    : remocao);

  if (erroRemocao) {
    console.error("Falha ao remover acessos do documento:", erroRemocao);
    return "Não foi possível atualizar quem tem acesso ao documento.";
  }

  if (validos.length === 0) return null;

  const { error: erroInsercao } = await supabase
    .from("ged_document_access")
    .upsert(
      validos.map((a) => ({
        document_id: documentId,
        user_id: a.user_id,
        nivel: a.nivel,
        granted_by: concedidoPor,
      })),
      { onConflict: "document_id,user_id" }
    );

  if (erroInsercao) {
    console.error("Falha ao conceder acessos do documento:", erroInsercao);
    return "O documento foi salvo, mas o compartilhamento não. Reabra e tente de novo.";
  }

  return null;
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
  const permitido = await exigir("ged", "documents", "create");
  if (!permitido.ok) return permitido;
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

  const criado = data as { id: string; codigo: string };

  // O documento já existe: um problema no compartilhamento não pode fazer o
  // cadastro parecer que falhou. Mas também não pode passar calado — quem
  // escolheu com quem compartilhar precisa saber que isso não valeu.
  const avisoAcesso = await sincronizarAcessos(
    supabase,
    criado.id,
    user.id,
    input.acessos
  );

  revalidarGed();
  if (avisoAcesso) return { ok: false, message: avisoAcesso };
  return { ok: true, data: criado };
}

export async function atualizarDocumento(
  id: string,
  input: DocumentoInput
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "documents", "update");
  if (!permitido.ok) return permitido;
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

  const avisoAcesso = await sincronizarAcessos(supabase, id, user.id, input.acessos);

  revalidarGed(id);
  if (avisoAcesso) return { ok: false, message: avisoAcesso };
  return { ok: true, data: undefined };
}

export async function excluirDocumento(id: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "documents", "delete");
  if (!permitido.ok) return permitido;
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  // Exclusão é a única operação sem volta do módulo: leva o registro, a trilha
  // de auditoria e o binário. Fica restrita ao super admin, e o RLS repete a
  // regra no banco (_manual_apply/006_ged_permissoes.sql).
  if (profile?.role !== "super_admin") {
    return {
      ok: false,
      message: "Apenas o administrador pode excluir documentos.",
    };
  }

  const { data: doc } = await supabase
    .from("ged_documents")
    .select("storage_path")
    .eq("id", id)
    .single();

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
  const permitido = await exigir("ged", "documents", "download");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase.storage
    .from("ged")
    .createSignedUrl(storagePath, 120);

  if (error || !data) return { ok: false, message: "Não foi possível gerar o link." };
  return { ok: true, data: { url: data.signedUrl } };
}

/**
 * Lê o arquivo enviado e devolve um rascunho dos campos do cadastro.
 *
 * O binário chega em base64 porque Server Action não recebe Blob. O limite de
 * corpo (~4.5 MB) é o mesmo teto que a extração já aplica, então arquivo grande
 * é recusado antes de chegar aqui.
 *
 * Nada é gravado: o retorno preenche o formulário e quem cadastra revisa.
 */
export async function lerDocumentoComIa(
  base64: string,
  mimeType: string,
  tamanhoBytes: number
): Promise<
  | { ok: true; dados: DadosExtraidos }
  | { ok: false; message: string }
> {
  const { user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "documents", "create");
  if (!permitido.ok) return permitido;
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const rl = checkRateLimit(`ged-extrair:${user.id}`, 30);
  if (!rl.allowed) {
    return {
      ok: false,
      message: "Muitas leituras seguidas. Aguarde um pouco e preencha à mão por ora.",
    };
  }

  const resultado = await extrairDadosDoArquivo(base64, mimeType, tamanhoBytes);
  if (!resultado.ok) return { ok: false, message: resultado.message };
  return { ok: true, dados: resultado.dados };
}

/** Usuários ativos, para escolher quem lê e quem edita o documento. */
export async function listarUsuariosParaAcesso(): Promise<
  ActionResult<{ id: string; nome: string; email: string }[]>
> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "documents", "manage");
  if (!permitido.ok) return permitido;
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("active", true)
    .order("full_name");

  if (error) return { ok: false, message: "Não foi possível carregar os usuários." };

  return {
    ok: true,
    data: (data ?? []).map((p) => ({
      id: p.id as string,
      nome: (p.full_name as string) || (p.email as string),
      email: p.email as string,
    })),
  };
}

/** Concessões já gravadas, para a tela de edição. */
export async function listarAcessosDoDocumento(
  documentId: string
): Promise<ActionResult<{ user_id: string; nivel: "leitura" | "edicao" }[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "audit", "read");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase
    .from("ged_document_access")
    .select("user_id, nivel")
    .eq("document_id", documentId);

  if (error) return { ok: false, message: "Não foi possível carregar as permissões." };
  return {
    ok: true,
    data: (data ?? []) as { user_id: string; nivel: "leitura" | "edicao" }[],
  };
}
