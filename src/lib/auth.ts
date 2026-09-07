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
  if (profile.retorno_previsto > hojeNoBrasil()) return profile;

  const { error } = await supabase
    .from("profiles")
    .update({ status: "ativo", retorno_previsto: null })
    .eq("id", profile.id);

  // Falhar aqui não pode barrar o acesso: quem voltou de férias continua ativo
  // para todos os efeitos, e a próxima requisição tenta de novo.
  if (error) return profile;

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
