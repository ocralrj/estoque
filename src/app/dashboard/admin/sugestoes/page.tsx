import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminSuggestionsClient from "./AdminSuggestionsClient";
import type { ImprovementSuggestion } from "@/types/modules/suggestions";

export default async function AdminSuggestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "gestor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const { data: suggestions } = await supabase
    .from("improvement_suggestions")
    .select(
      `
      *,
      user:profiles!improvement_suggestions_user_id_fkey(full_name, email)
    `
    )
    .order("created_at", { ascending: false })
    .returns<ImprovementSuggestion[]>();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Sugestões de melhoria
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Pedidos enviados por todos os usuários. Atualize status e prioridade.
        </p>
      </div>

      <AdminSuggestionsClient initial={suggestions || []} />
    </div>
  );
}
