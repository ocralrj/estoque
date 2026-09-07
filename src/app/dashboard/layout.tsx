import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
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

  // As permissões descem prontas do servidor: o navegador desenha o que já foi
  // decidido, e nunca decide por conta própria.
  const permissoes = await permissoesParaCliente();

  return (
    <ProvedorDePermissoes permissoes={permissoes}>
      <DashboardShell profile={profile}>{children}</DashboardShell>
    </ProvedorDePermissoes>
  );
}
