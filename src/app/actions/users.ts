"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
import { SENHA_INICIAL } from "@/lib/senha";
import { MAX_SAIDA_BYTES } from "@/lib/imagens/avatar";
import type { StatusUsuario, UserRole } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Papéis que cada perfil pode conceder. Antes essa regra existia apenas na
 * lista do <select>, e o update ia direto do navegador para o banco — um
 * gestor conseguia se promover a super_admin pelo console.
 */
const GRANTABLE_ROLES: Record<string, UserRole[]> = {
  super_admin: ["super_admin", "gestor", "almoxarife", "requisitante"],
  gestor: ["almoxarife", "requisitante"],
};

export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "update");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  if (userId === user.id) {
    return { ok: false, message: "Você não pode alterar seu próprio papel." };
  }

  const grantable = GRANTABLE_ROLES[profile?.role ?? ""] ?? [];
  if (!grantable.includes(role)) {
    return { ok: false, message: "Você não pode conceder esse papel." };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  // Um super admin não rebaixa outro. Sem isso, dois administradores poderiam
  // se destituir mutuamente, e um sistema sem administrador não tem conserto
  // pela própria interface.
  if (target?.role === "super_admin") {
    return {
      ok: false,
      message: "Um super admin só pode alterar o próprio papel.",
    };
  }

  // Um gestor não mexe em quem está acima dele.
  if (!grantable.includes(target?.role as UserRole)) {
    return { ok: false, message: "Você não pode alterar esse usuário." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return { ok: false, message: "Não foi possível atualizar o papel." };

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/**
 * Define a situação da conta: Ativo, Férias ou Inativo.
 *
 * Substitui o par ativar/desativar. Férias não bloqueia o acesso de propósito:
 * é entrando que a pessoa dispara o próprio retorno, quando a data prevista já
 * passou (ver `encerrarFeriasVencidas`). A data de volta é exigida aqui e
 * também no banco, por restrição — férias sem prazo nunca acabariam sozinhas.
 */
export async function definirStatus(
  userId: string,
  status: StatusUsuario,
  retornoPrevisto?: string | null
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  if (userId === user.id) {
    return { ok: false, message: "Você não pode alterar o status da própria conta." };
  }

  if (!["ativo", "ferias", "inativo"].includes(status)) {
    return { ok: false, message: "Status inválido." };
  }

  let retorno: string | null = null;
  if (status === "ferias") {
    const data = (retornoPrevisto ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, message: "Informe a data prevista de retorno." };
    }
    // Uma volta no passado encerraria as férias no acesso seguinte, o que na
    // prática é registrar férias que não existem.
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (data <= hoje) {
      return { ok: false, message: "A data de retorno precisa ser futura." };
    }
    retorno = data;
  }

  const grantable = GRANTABLE_ROLES[profile?.role ?? ""] ?? [];

  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  // Super admin não é desativado por ninguém — nem por outro super admin.
  // Só ele próprio muda o próprio status.
  if (target?.role === "super_admin") {
    return {
      ok: false,
      message: "Um super admin não pode ter o status alterado por outra pessoa.",
    };
  }

  if (!grantable.includes(target?.role as UserRole)) {
    return { ok: false, message: "Você não pode alterar esse usuário." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ status, retorno_previsto: retorno })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return {
        ok: false,
        message:
          "Faltam as colunas de status. Execute supabase/_manual_apply/013_status_usuario.sql.",
      };
    }
    return { ok: false, message: "Não foi possível atualizar o usuário." };
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/**
 * Eleva alguém a super admin.
 *
 * Fica fora de `updateUserRole` de propósito: conceder o papel máximo do
 * sistema não deve acontecer por um clique distraído num seletor ao lado dos
 * demais papéis. Aqui é ação própria, com confirmação na tela.
 */
export async function promoverASuperAdmin(userId: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "update");
  if (!permitido.ok) return permitido;

  if (profile?.role !== "super_admin") {
    return { ok: false, message: "Apenas um super admin pode conceder esse papel." };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .single();

  if (!target) return { ok: false, message: "Usuário não encontrado." };
  if (target.role === "super_admin") {
    return { ok: false, message: "Este usuário já é super admin." };
  }
  if (!target.active) {
    return { ok: false, message: "Ative o usuário antes de promovê-lo." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", userId);

  if (error) return { ok: false, message: "Não foi possível promover o usuário." };

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/** Atualiza o próprio nome de exibição. */
export async function atualizarMeuNome(nome: string): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const limpo = nome.trim();
  if (limpo.length < 3) return { ok: false, message: "Informe ao menos 3 caracteres." };
  if (limpo.length > 120) return { ok: false, message: "O nome está longo demais." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: limpo })
    .eq("id", user.id);

  if (error) return { ok: false, message: "Não foi possível salvar o nome." };

  // O nome também vive nos metadados do Auth, de onde o trigger de cadastro o
  // copia. Manter os dois iguais evita o valor antigo reaparecer.
  await supabase.auth.updateUser({ data: { full_name: limpo } });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Pré-cadastra alguém com senha conhecida e departamento definido.
 *
 * Usa a chave de serviço, que ignora o RLS — por isso a checagem de papel é
 * feita ANTES, com a sessão de quem convida, e nunca com essa chave. Ela existe
 * só no servidor e jamais chega ao navegador.
 *
 * A conta nasce com `must_change_password`, então a senha inicial só serve para
 * entrar uma vez: enquanto não for trocada, a pessoa não alcança o sistema.
 */
export interface NovoUsuario {
  email: string;
  nome?: string | null;
  papel?: UserRole;
  departamento?: string | null;
  status?: StatusUsuario;
  retornoPrevisto?: string | null;
  /** Foto já tratada pela tela, como data URL. Opcional. */
  fotoBase64?: string | null;
}

const TIPOS_DE_FOTO: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Converte a foto que veio da tela, recusando o que não for imagem conhecida.
 *
 * A tela já entrega um quadrado de 256 pixels, mas uma Server Action é um
 * endpoint como outro qualquer: o conteúdo é validado aqui de novo, sem
 * confiar em quem chamou.
 */
function lerFoto(
  dataUrl: string
): { bytes: Uint8Array; mimeType: string; extensao: string } | null {
  const casamento = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!casamento) return null;

  const mimeType = casamento[1].toLowerCase();
  const extensao = TIPOS_DE_FOTO[mimeType];
  if (!extensao) return null;

  try {
    const bytes = Uint8Array.from(Buffer.from(casamento[2], "base64"));
    if (bytes.length === 0 || bytes.length > MAX_SAIDA_BYTES) return null;
    return { bytes, mimeType, extensao };
  } catch {
    return null;
  }
}

export async function convidarUsuario(
  entrada: NovoUsuario
): Promise<{ ok: true; senha: string } | { ok: false; message: string }> {
  const { user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "create");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const limpo = entrada.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)) {
    return { ok: false, message: "E-mail inválido." };
  }

  // O papel obedece ao mesmo limite de quem cria: sem isto, o gestor criaria
  // pela porta dos fundos alguém com mais poder do que ele próprio pode
  // conceder na lista.
  const papel = entrada.papel ?? "requisitante";
  const podeConceder = GRANTABLE_ROLES[profile?.role ?? ""] ?? [];
  if (!podeConceder.includes(papel) || papel === "super_admin") {
    return { ok: false, message: "Você não pode conceder esse papel." };
  }

  const status: StatusUsuario = entrada.status ?? "ativo";
  if (!["ativo", "ferias", "inativo"].includes(status)) {
    return { ok: false, message: "Status inválido." };
  }

  let retorno: string | null = null;
  if (status === "ferias") {
    const data = (entrada.retornoPrevisto ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, message: "Informe a data prevista de retorno." };
    }
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (data <= hoje) {
      return { ok: false, message: "A data de retorno precisa ser futura." };
    }
    retorno = data;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return {
      ok: false,
      message:
        "Pré-cadastro indisponível: falta SUPABASE_SERVICE_ROLE_KEY nas variáveis de produção.",
    };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // email_confirm: a pessoa não precisa confirmar nada — quem cadastrou já
  // sabe que o endereço existe, e ela entra direto com a senha inicial.
  const { data, error } = await admin.auth.admin.createUser({
    email: limpo,
    password: SENHA_INICIAL,
    email_confirm: true,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { ok: false, message: "Este e-mail já tem conta no sistema." };
    }
    return { ok: false, message: "Não foi possível criar o acesso." };
  }

  const novoId = data.user?.id;
  if (novoId) {
    // O gatilho já criou o perfil como requisitante; completamos com o
    // departamento e a marca de troca obrigatória.
    const base = {
      full_name: entrada.nome?.trim().slice(0, 120) || null,
      role: papel,
      departamento: entrada.departamento?.trim() || null,
      must_change_password: true,
    };

    const { error: erroPerfil } = await admin
      .from("profiles")
      .update({ ...base, status, retorno_previsto: retorno })
      .eq("id", novoId);

    // Sem a migração 013 as colunas de status ainda não existem, e a conta
    // ficaria sem nome nem papel por causa delas. O resto do cadastro é salvo
    // do mesmo jeito; só a situação fica pendente.
    if (erroPerfil?.code === "PGRST204" || erroPerfil?.code === "42703") {
      await admin.from("profiles").update(base).eq("id", novoId);
    }

    // A foto é opcional e não pode derrubar o cadastro: se falhar, a conta já
    // existe e a pessoa (ou quem a cadastrou) sobe a imagem depois pelo perfil.
    const foto = entrada.fotoBase64 ? lerFoto(entrada.fotoBase64) : null;
    if (foto) {
      const caminho = `${novoId}-${Date.now()}.${foto.extensao}`;
      const { data: enviada } = await admin.storage
        .from("avatars")
        .upload(caminho, foto.bytes, {
          cacheControl: "3600",
          upsert: true,
          contentType: foto.mimeType,
        });

      if (enviada?.path) {
        const { data: publica } = admin.storage
          .from("avatars")
          .getPublicUrl(enviada.path);
        await admin
          .from("profiles")
          .update({ avatar_url: publica.publicUrl })
          .eq("id", novoId);
      }
    }
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true, senha: SENHA_INICIAL };
}

/**
 * Define o departamento da pessoa.
 *
 * É o que decide quais documentos ela enxerga no modo "departamento" do GED —
 * sem isso preenchido, ela só vê o que for marcado como "todos" e o que ela
 * mesma arquivou.
 */
export async function definirDepartamento(
  userId: string,
  departamento: string | null
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const { error } = await supabase
    .from("profiles")
    .update({ departamento: departamento?.trim() || null })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703") {
      return {
        ok: false,
        message:
          "Falta a coluna de departamento. Execute supabase/_manual_apply/011_acesso_por_departamento.sql.",
      };
    }
    return { ok: false, message: "Não foi possível salvar o departamento." };
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/** Registra que a senha inicial foi trocada, liberando o acesso ao sistema. */
export async function concluirTrocaDeSenha(): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { error } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (error) return { ok: false, message: "Não foi possível concluir a troca." };

  revalidatePath("/dashboard");
  return { ok: true };
}
