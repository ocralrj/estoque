import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import DashboardHeader from "@/components/layout/DashboardHeader";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) redirect("/auth/login");

  return (
    <div className="flex min-h-screen bg-[var(--neo-bg)]">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-y-auto p-4 sm:p-7 lg:p-9 bg-[var(--neo-bg)]">
        <DashboardHeader />
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
