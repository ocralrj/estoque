import { redirect } from "next/navigation";
import Link from "next/link";
import { deleteProtocol, updateProtocol } from "@/app/actions/protocols";
import { Button, ConfirmSubmitButton } from "@/components/ui";
import { isManager, requireSession } from "@/lib/auth";
import { formatDate, priorityLabel, protocolStatusLabel } from "@/lib/labels";

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
  const { supabase, user, profile } = await requireSession();
  const canManage = isManager(profile?.role);

  const { data: protocol, error } = await supabase
    .from("protocolos")
    .select(`
      *,
      requester:profiles!protocolos_requester_id_fkey(id, full_name, email),
      assigned_to:profiles!protocolos_assigned_to_fkey(id, full_name, email)
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
          <p className="text-sm text-[var(--text-muted)]">Protocolo</p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{protocol.nup}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{protocol.title}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/protocolos"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--neo-flat-alt)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:brightness-95 transition-colors"
          >
            Voltar
          </Link>
          {canEdit && (
            <form action={deleteProtocol.bind(null, params.id)}>
              <ConfirmSubmitButton
                message="Tem certeza que deseja excluir este protocolo?"
                className="rounded-lg bg-[var(--erro-solid)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] hover:brightness-110 transition-colors"
              >
                Excluir
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <span className="text-sm text-[var(--text-muted)]">Solicitante</span>
              <p className="text-base font-medium text-[var(--text)]">{protocol.requester?.full_name || protocol.requester?.email}</p>
            </div>
            <div>
              <span className="text-sm text-[var(--text-muted)]">Responsável</span>
              <p className="text-base font-medium text-[var(--text)]">{protocol.assigned_to?.full_name || protocol.assigned_to?.email || "Não atribuído"}</p>
            </div>
            <div>
              <span className="text-sm text-[var(--text-muted)]">Criado em</span>
              <p className="text-base font-medium text-[var(--text)]">{formatDate(protocol.created_at)}</p>
            </div>
            <div>
              <span className="text-sm text-[var(--text-muted)]">Última atualização</span>
              <p className="text-base font-medium text-[var(--text)]">{formatDate(protocol.updated_at)}</p>
            </div>
          </div>
        </section>

        <section className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <span className="text-sm text-[var(--text-muted)]">Status</span>
              <p className="text-base font-medium text-[var(--text)]">{protocolStatusLabel(protocol.status)}</p>
            </div>
            <div>
              <span className="text-sm text-[var(--text-muted)]">Prioridade</span>
              <p className="text-base font-medium text-[var(--text)]">{priorityLabel(protocol.priority)}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Editar protocolo</h2>
        <form action={updateProtocol.bind(null, params.id)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Título</label>
            <input
              name="title"
              defaultValue={protocol.title}
              required
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Descrição</label>
            <textarea
              name="description"
              defaultValue={protocol.description || ""}
              rows={5}
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">Prioridade</label>
              <select
                name="priority"
                defaultValue={protocol.priority}
                className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">Status</label>
              <select
                name="status"
                defaultValue={protocol.status}
                disabled={!canManage}
                className="w-full rounded-lg border border-[var(--neo-line)] bg-[var(--neo-bg)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-[var(--neo-flat-alt)]"
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
              <label className="block text-sm font-medium text-[var(--text)] mb-2">Atribuir responsável</label>
              <select
                name="assigned_to"
                defaultValue={protocol.assigned_to?.id || ""}
                className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">Nenhum</option>
                {users?.map((user) => (
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
              className="inline-flex items-center justify-center rounded-lg bg-[var(--neo-flat-alt)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:brightness-95 transition-colors"
            >
              Voltar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
