import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  SUGGESTION_PRIORITY_LABELS,
  SUGGESTION_STATUS_COLORS,
  SUGGESTION_STATUS_LABELS,
  type ImprovementSuggestion,
} from "@/types/modules/suggestions";

export default async function MySuggestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: suggestions } = await supabase
    .from("improvement_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<ImprovementSuggestion[]>();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus pedidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Acompanhe as melhorias que você sugeriu.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-primary-600 hover:underline"
        >
          Voltar ao início
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {!suggestions || suggestions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-600 mb-2">Nenhum pedido enviado ainda.</p>
            <p className="text-sm text-gray-500">
              Use o botão amarelo &quot;Sugerir uma melhoria&quot; no topo da
              tela.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {suggestions.map((s) => (
              <div key={s.id} className="p-5 hover:bg-gray-50">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-gray-500">{s.code}</p>
                    <h2 className="text-base font-semibold text-gray-900">
                      {s.title}
                    </h2>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${SUGGESTION_STATUS_COLORS[s.status]}`}
                  >
                    {SUGGESTION_STATUS_LABELS[s.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">{s.summary}</p>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                  <span>
                    {new Date(s.created_at).toLocaleString("pt-BR")}
                  </span>
                  <span>
                    Prioridade: {SUGGESTION_PRIORITY_LABELS[s.priority]}
                  </span>
                  {s.module_hint && <span>Módulo: {s.module_hint}</span>}
                </div>
                {s.admin_notes && (
                  <div className="mt-3 text-sm bg-yellow-50 border border-yellow-100 text-yellow-900 rounded-lg px-3 py-2">
                    <span className="font-medium">Resposta da equipe: </span>
                    {s.admin_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
