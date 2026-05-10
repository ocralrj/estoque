import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupsClient from "./GroupsClient";

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["super_admin", "gestor"].includes(profile?.role ?? "")) {
    redirect("/dashboard");
  }

  const { data: groups } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .order("created_at", { ascending: false });

  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("active", true)
    .order("full_name");

  const { data: certificates } = await supabase
    .from("certificates")
    .select("id, title")
    .order("title");

  return (
    <GroupsClient
      groups={groups ?? []}
      users={users ?? []}
      certificates={certificates ?? []}
    />
  );
}
