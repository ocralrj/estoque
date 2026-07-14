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
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-gray-950">
        <DashboardHeader />
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
