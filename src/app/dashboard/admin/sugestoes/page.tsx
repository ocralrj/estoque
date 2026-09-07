import { exigirPermissao } from "@/lib/permissoes";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import AdminSuggestionsClient from "./AdminSuggestionsClient";
import type {
  ImprovementSuggestion,
  MensagemDaSugestao,
} from "@/types/modules/suggestions";

export default async function AdminSuggestionsPage() {
  const { supabase } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("sugestoes", "todas", "read");

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

  const { data: mensagens } = await supabase
    .from("suggestion_messages")
    .select("*, autor:profiles(full_name, email, avatar_url)")
    .order("created_at")
    .returns<MensagemDaSugestao[]>();

  const comFio = (suggestions ?? []).map((s) => ({
    ...s,
    mensagens: (mensagens ?? []).filter((m) => m.suggestion_id === s.id),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Sugestões de melhoria
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Pedidos enviados por todos os usuários. Atualize status e prioridade.
        </p>
      </div>

      <AdminSuggestionsClient initial={comFio} />
    </div>
  );
}
