import { redirect } from "next/navigation";
import { emFeriasBloqueadas, requireSession } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";
import { permissoesParaCliente } from "@/lib/permissoes";
import { ProvedorDePermissoes } from "@/components/auth/Permissoes";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireSession();

  if (!profile || !profile.active) redirect("/auth/login");

  // Senha provisória: enquanto não for trocada, ela é conhecida por quem
  // cadastrou o acesso — e por quem tiver lido o e-mail.
  if (profile.must_change_password) redirect("/auth/trocar-senha");

  // Férias: o bloqueio real está no banco, em get_user_role(). Aqui a tela só
  // diz o motivo — sem isto a pessoa veria um painel vazio e acharia que
  // quebrou.
  if (emFeriasBloqueadas(profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--neo-flat)] px-4">
        <div className="neo-card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-bold text-[var(--text)]">
            Você está de férias
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            O acesso ao sistema volta na véspera do seu retorno, previsto para{" "}
            <strong className="text-[var(--text)]">
              {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
                new Date(profile.retorno_previsto + "T12:00:00")
              )}
            </strong>
            .
          </p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Se precisar entrar antes disso, fale com quem cuida do seu
            departamento — só a gestão altera a situação de acesso.
          </p>
          <form action="/auth/sair" method="post" className="mt-6">
            <a
              href="/auth/login"
              className="inline-block rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              Voltar ao início
            </a>
          </form>
        </div>
      </div>
    );
  }

  // As permissões descem prontas do servidor: o navegador desenha o que já foi
  // decidido, e nunca decide por conta própria.
  const permissoes = await permissoesParaCliente();

  return (
    <ProvedorDePermissoes permissoes={permissoes}>
      <DashboardShell profile={profile}>{children}</DashboardShell>
    </ProvedorDePermissoes>
  );
}
