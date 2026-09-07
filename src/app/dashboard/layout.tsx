import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";

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

  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}
