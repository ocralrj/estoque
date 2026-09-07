"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const PAPEIS_GED = ["super_admin", "gestor", "almoxarife"];

function podeManter(role?: string | null): boolean {
  return PAPEIS_GED.includes(role ?? "");
}

function revalidar() {
  revalidatePath("/dashboard/ged/pastas");
  revalidatePath("/dashboard/ged/documentos");
}

interface PastaInput {
  setor: string;
  nome: string;
  caminho: string;
  ativa: boolean;
}

function validar(input: PastaInput): string | null {
  if (!input.nome?.trim()) return "Informe o nome da pasta.";
  if (input.nome.trim().length < 2) return "O nome deve ter ao menos 2 caracteres.";
  if (!input.setor?.trim()) return "Escolha o departamento.";
  if (!input.caminho?.trim()) return "Informe o caminho da pasta.";
  // Barra no início ou fim produz caminhos como "Fiscal//NF-e/" na exibição.
  if (/^\/|\/$/.test(input.caminho.trim())) {
    return "O caminho não deve começar nem terminar com barra.";
  }
  return null;
}

export async function criarPasta(input: PastaInput): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "folders", "create");
  if (!permitido.ok) return permitido;
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const erro = validar(input);
  if (erro) return { ok: false, message: erro };

  const { error } = await supabase.from("ged_folders").insert({
    setor: input.setor,
    nome: input.nome.trim().slice(0, 120),
    caminho: input.caminho.trim().slice(0, 300),
    ativa: input.ativa,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma pasta com esse caminho neste departamento." };
    }
    return { ok: false, message: "Não foi possível criar a pasta." };
  }

  revalidar();
  return { ok: true, data: undefined };
}

export async function atualizarPasta(
  id: string,
  input: PastaInput
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "folders", "update");
  if (!permitido.ok) return permitido;
  if (!podeManter(profile?.role)) return { ok: false, message: "Sem permissão" };

  const erro = validar(input);
  if (erro) return { ok: false, message: erro };

  const { error } = await supabase
    .from("ged_folders")
    .update({
      setor: input.setor,
      nome: input.nome.trim().slice(0, 120),
      caminho: input.caminho.trim().slice(0, 300),
      ativa: input.ativa,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma pasta com esse caminho neste departamento." };
    }
    return { ok: false, message: "Não foi possível atualizar a pasta." };
  }

  revalidar();
  return { ok: true, data: undefined };
}

export async function excluirPasta(id: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("ged", "folders", "delete");
  if (!permitido.ok) return permitido;

  if (profile?.role !== "super_admin") {
    return { ok: false, message: "Apenas o administrador pode excluir pastas." };
  }

  // A FK de ged_documents.folder_id é ON DELETE SET NULL: apagar a pasta não
  // apagaria documentos, mas os deixaria soltos. Avisar é melhor que descobrir
  // depois que um acervo inteiro perdeu a organização.
  const { count } = await supabase
    .from("ged_documents")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", id);

  if (count && count > 0) {
    return {
      ok: false,
      message: `Esta pasta tem ${count} documento(s). Mova-os ou desative a pasta em vez de excluí-la.`,
    };
  }

  const { error } = await supabase.from("ged_folders").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir a pasta." };

  revalidar();
  return { ok: true, data: undefined };
}
