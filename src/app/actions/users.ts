"use server";

import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
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
 * Convida alguém por e-mail, em vez de deixar o cadastro aberto ao público.
 *
 * Usa a chave de serviço, que ignora o RLS — por isso a checagem de papel é
 * feita ANTES, com a sessão do solicitante, e nunca com essa chave. Ela existe
 * só no servidor e jamais é enviada ao navegador.
 */
export async function convidarUsuario(
  email: string
): Promise<{ ok: true } | { ok: false; message: string }> {
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
        "Convite indisponível: falta SUPABASE_SERVICE_ROLE_KEY nas variáveis de produção.",
    };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const destino = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { error } = await admin.auth.admin.inviteUserByEmail(limpo, {
    redirectTo: destino ? `${destino}/auth/callback?next=/auth/reset-password` : undefined,
  });

  if (error) {
    // A mensagem do provedor vem em inglês e às vezes expõe detalhe interno.
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { ok: false, message: "Este e-mail já tem conta no sistema." };
    }
    if (msg.includes("rate")) {
      return { ok: false, message: "Muitos convites seguidos. Aguarde alguns minutos." };
    }
    return { ok: false, message: "Não foi possível enviar o convite." };
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}
