"use server";

import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
import { SENHA_INICIAL } from "@/lib/senha";
import type { UserRole } from "@/types/database";

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

export async function setUserActive(
  userId: string,
  active: boolean
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  if (userId === user.id) {
    return { ok: false, message: "Você não pode desativar a própria conta." };
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
      message: "Um super admin não pode ser desativado por outra pessoa.",
    };
  }

  if (!grantable.includes(target?.role as UserRole)) {
    return { ok: false, message: "Você não pode alterar esse usuário." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", userId);

  if (error) return { ok: false, message: "Não foi possível atualizar o usuário." };

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
export async function convidarUsuario(
  email: string,
  departamento?: string | null
): Promise<{ ok: true; senha: string } | { ok: false; message: string }> {
  const { user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const limpo = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)) {
    return { ok: false, message: "E-mail inválido." };
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
    await admin
      .from("profiles")
      .update({
        departamento: departamento?.trim() || null,
        must_change_password: true,
      })
      .eq("id", novoId);
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
