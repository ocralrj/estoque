import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";

/** Papéis com poder de gestão (aprovar, atribuir, administrar). */
export const MANAGER_ROLES: UserRole[] = ["super_admin", "gestor"];

/** Papéis que operam o estoque (além dos gestores). */
export const STOCK_ROLES: UserRole[] = ["super_admin", "gestor", "almoxarife"];

export function isManager(role?: string | null): boolean {
  return MANAGER_ROLES.includes(role as UserRole);
}

export function canManageStock(role?: string | null): boolean {
  return STOCK_ROLES.includes(role as UserRole);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Data de hoje no fuso da empresa, no formato que o banco usa para `date`. */
function hojeNoBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Amanhã: a data de retorno até aqui já libera o acesso, pela regra da véspera. */
function vesperaLimite(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

/**
 * A pessoa está de férias e ainda não pode entrar?
 *
 * O bloqueio de verdade está em get_user_role(), no banco, onde nenhuma tela
 * consegue contorná-lo. Isto aqui existe só para a tela poder dizer o motivo:
 * bloqueio sem explicação parece defeito, e a pessoa liga para o suporte.
 */
export function emFeriasBloqueadas(profile: Profile | null): boolean {
  if (!profile || profile.status !== "ferias" || !profile.retorno_previsto) {
    return false;
  }
  return profile.retorno_previsto > vesperaLimite();
}

/**
 * Encerra as férias quando a data de retorno já chegou.
 *
 * É feito no acesso, e não por rotina agendada, porque é o acesso que prova a
 * volta: a pessoa entrou, logo está de volta. Como efeito, o registro de férias
 * some do banco — a data prevista é apagada junto com o status, e a conta volta
 * a Ativo sem depender de alguém lembrar de reativá-la.
 *
 * Só a própria pessoa faz esta transição, e o banco só a aceita depois da data
 * prevista (gatilho `profiles_protege_acesso`, migração 013).
 */
async function encerrarFeriasVencidas(
  supabase: SupabaseServerClient,
  profile: Profile
): Promise<Profile> {
  if (profile.status !== "ferias") return profile;
  if (!profile.retorno_previsto) return profile;

  // A véspera já conta: é quando o acesso volta, e entrar é o que encerra as
  // férias. Antes disso a pessoa nem chega aqui — get_user_role() a barra.
  if (profile.retorno_previsto > vesperaLimite()) return profile;

  // A transição acontece por uma função no banco, e não por um UPDATE comum.
  //
  // O UPDATE dependia da política de `profiles`, do gatilho que protege os
  // campos de acesso e da ordem em que os gatilhos disparam — e quando algo
  // ali recusava, o erro era descartado: a pessoa entrava, continuava marcada
  // como de férias e não havia nada no log. A função decide sozinha, olha
  // apenas quem chamou e só faz esta transição.
  const { data: encerrou, error } = await supabase.rpc("encerrar_minhas_ferias");

  if (error) {
    // Silenciar aqui foi o que escondeu o problema por dias.
    console.error(
      "Falha ao encerrar férias vencidas:",
      error.code,
      error.message
    );

    // Banco sem a migração 026: tenta o caminho antigo para não travar a volta.
    if (error.message?.includes("schema cache") || error.code === "PGRST202") {
      const { error: erroDireto } = await supabase
        .from("profiles")
        .update({ status: "ativo", retorno_previsto: null })
        .eq("id", profile.id);

      if (erroDireto) {
        console.error("Caminho antigo também falhou:", erroDireto.message);
        return profile;
      }
      return { ...profile, status: "ativo", retorno_previsto: null, active: true };
    }

    return profile;
  }

  if (!encerrou) return profile;

  return { ...profile, status: "ativo", retorno_previsto: null, active: true };
}

interface Session {
  supabase: SupabaseServerClient;
  user: { id: string; email?: string };
  profile: Profile | null;
}

/**
 * Sessão para Server Actions e Route Handlers: não redireciona,
 * devolve `user: null` para o chamador tratar o erro.
 */
export async function getSession(): Promise<
  Omit<Session, "user"> & { user: Session["user"] | null }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return { supabase, user, profile: null };

  return {
    supabase,
    user,
    profile: await encerrarFeriasVencidas(supabase, profile as Profile),
  };
}

/**
 * Sessão para Server Components: redireciona para o login quando não há
 * usuário e, opcionalmente, para o dashboard quando o papel não é permitido.
 */
export async function requireSession(allowedRoles?: UserRole[]): Promise<Session> {
  const { supabase, user, profile } = await getSession();

  if (!user) redirect("/auth/login");

  if (allowedRoles && !allowedRoles.includes(profile?.role as UserRole)) {
    redirect("/dashboard");
  }

  return { supabase, user, profile };
}
