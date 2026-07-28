import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { deleteProtocol, updateProtocol } from "@/app/actions/protocols";
import { Button } from "@/components/ui";
import type { Protocol } from "@/types/database";

const statusOptions = [
  { value: "aberto", label: "Aberto" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

const priorityOptions = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

export default async function ProtocolosDetalhesPage({ params }: { params: { id: string } }) {
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

  const canManage = profile?.role && ["super_admin", "gestor"].includes(profile.role);

  const { data: protocol, error } = await supabase
    .from("protocolos")
    .select(`
      *,
      requester:profiles(id, full_name, email),
      assigned_to:profiles(id, full_name, email)
    `)
    .eq("id", params.id)
    .single();

  if (error || !protocol) {
    redirect("/dashboard/protocolos");
  }

  const canEdit = canManage || protocol.requester_id === user.id;

  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("active", true)
    .order("email");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Protocolo</p>
          <h1 className="text-2xl font-bold text-gray-900">{protocol.nup}</h1>
          <p className="text-sm text-gray-600 mt-1">{protocol.title}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/protocolos"
            className="inline-flex items-center justify-center rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300 transition-colors"
          >
            Voltar
          </Link>
          {canEdit && (
            <form action={deleteProtocol.bind(null, params.id)}>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Excluir
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-white rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <span className="text-sm text-gray-500">Solicitante</span>
              <p className="text-base font-medium text-gray-900">{protocol.requester?.full_name || protocol.requester?.email}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Responsável</span>
              <p className="text-base font-medium text-gray-900">{protocol.assigned_to?.full_name || protocol.assigned_to?.email || "Não atribuído"}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Criado em</span>
              <p className="text-base font-medium text-gray-900">{new Date(protocol.created_at).toLocaleDateString("pt-BR")}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Última atualização</span>
              <p className="text-base font-medium text-gray-900">{new Date(protocol.updated_at).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <span className="text-sm text-gray-500">Status</span>
              <p className="text-base font-medium text-gray-900 capitalize">{protocol.status.replace("_", " ")}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Prioridade</span>
              <p className="text-base font-medium text-gray-900 capitalize">{protocol.priority}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Editar protocolo</h2>
        <form action={updateProtocol.bind(null, params.id)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
            <input
              name="title"
              defaultValue={protocol.title}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
            <textarea
              name="description"
              defaultValue={protocol.description || ""}
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prioridade</label>
              <select
                name="priority"
                defaultValue={protocol.priority}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                name="status"
                defaultValue={protocol.status}
                disabled={!canManage}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {canManage && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Atribuir responsável</label>
              <select
                name="assigned_to"
                defaultValue={protocol.assigned_to?.id || ""}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">Nenhum</option>
                {users?.map((user: any) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit">Salvar alterações</Button>
            <Link
              href="/dashboard/protocolos"
              className="inline-flex items-center justify-center rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300 transition-colors"
            >
              Voltar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
