import Link from "next/link";
import { isManager, requireSession } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { formatDate, roleLabel } from "@/lib/labels";
import {
  tarefaAtrasada,
  tarefaStatusClass,
  tarefaStatusLabel,
  type Tarefa,
} from "@/types/modules/tarefas";

export default async function DashboardPage() {
  const { supabase, profile, user } = await requireSession();
  const showUserCount = isManager(profile?.role);

  const { count: totalProducts } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("active", true);

  const { count: lowStockProducts } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_low_stock", true)
    .eq("active", true);

  const { count: totalCategories } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });

  // A contagem só aparece para gestao: nao consultamos quando nao sera exibida.
  const { count: totalUsers } = showUserCount
    ? await supabase.from("profiles").select("*", { count: "exact", head: true })
    : { count: null };

  const { data: recentMovements } = await supabase
    .from("movements")
    .select(`
      *,
      product:products(name),
      user:profiles(full_name, email)
    `)
    .order("created_at", { ascending: false })
    .limit(5);

  // Minhas tarefas: quem coordena vê todas; os demais veem o que abriram ou o
  // que ficou com elas. A consulta é defensiva — se o schema ainda não foi
  // aplicado, o painel não pode cair junto com o módulo que acabou de chegar.
  const veTarefas = await pode("tarefas", "tarefas", "read");
  let minhasTarefas: Tarefa[] = [];
  if (veTarefas) {
    let query = supabase
      .from("tarefas")
      .select(
        `
        *,
        assigned_to:profiles!tarefas_assigned_to_fkey(id, full_name, email),
        assigned_group:user_groups!tarefas_assigned_group_id_fkey(id, name)
        `
      )
      .in("status", ["aberta", "em_andamento"])
      .order("prazo", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5);

    if (!isManager(profile?.role)) {
      query = query
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .or(`assigned_group_id.eq.${profile?.group_id}`);
    }

    const { data, error } = await query.returns<Tarefa[]>();
    if (!error && data) minhasTarefas = data;
  }

  const emAberto = minhasTarefas.length;
  const atrasadas = minhasTarefas.filter((t) => tarefaAtrasada(t)).length;

  const mostrarTarefas = veTarefas && emAberto > 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">
        Olá, {profile?.full_name?.trim() || "seja bem-vindo"}
      </h1>

      <div className="grid grid-cols-1 gap-4 mb-8 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <p className="text-sm text-[var(--text-muted)]">Total de Produtos</p>
          <p className="text-3xl font-bold text-[var(--primary)] mt-1">{totalProducts ?? 0}</p>
        </div>
        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <p className="text-sm text-[var(--text-muted)]">Estoque Baixo</p>
          <p className="text-3xl font-bold text-[var(--erro-solid)] mt-1">{lowStockProducts ?? 0}</p>
        </div>
        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <p className="text-sm text-[var(--text-muted)]">Categorias</p>
          <p className="text-3xl font-bold text-[var(--ok-solid)] mt-1">{totalCategories ?? 0}</p>
        </div>
        {showUserCount && (
          <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
            <p className="text-sm text-[var(--text-muted)]">Usuários</p>
            <p className="text-3xl font-bold text-[var(--primary)] mt-1">{totalUsers ?? 0}</p>
          </div>
        )}
        {veTarefas && (
          <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
            <p className="text-sm text-[var(--text-muted)]">
              Tarefas em aberto{atrasadas > 0 && ` · ${atrasadas} atrasada(s)`}
            </p>
            <p className={`text-3xl font-bold mt-1 ${atrasadas > 0 ? "text-[var(--erro-solid)]" : "text-[var(--primary)]"}`}>
              {emAberto}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Movimentações Recentes</h2>
          {recentMovements && recentMovements.length > 0 ? (
            <div className="space-y-3">
              {recentMovements.map((mov) => (
                <div key={mov.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{mov.product?.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {mov.user?.full_name || mov.user?.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${mov.type === 'entrada' ? 'text-[var(--ok-solid)]' : 'text-[var(--erro-solid)]'}`}>
                      {mov.type === 'entrada' ? '+' : '-'}{mov.quantity}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{mov.type}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Nenhuma movimentação recente</p>
          )}
        </div>

        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Seu perfil</h2>
          <p className="text-sm text-[var(--text-muted)]">Email: {profile?.email}</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Função:{" "}
            <span className="font-medium">{roleLabel(profile?.role)}</span>
          </p>
        </div>
      </div>

      {mostrarTarefas && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Minhas tarefas</h2>
              <p className="text-sm text-[var(--text-muted)]">
                As {emAberto} tarefa(s) em aberto de que você participa
              </p>
            </div>
            <Link
              href="/dashboard/tarefas"
              className="text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              Ver todas
            </Link>
          </div>

          <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
            <div className="neo-flat overflow-x-auto">
              <ul className="divide-y divide-[var(--neo-line)]">
                {minhasTarefas.map((tarefa) => (
                  <li key={tarefa.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-[var(--neo-flat)]">
                    <Link
                      href={`/dashboard/tarefas/${tarefa.id}`}
                      className="min-w-0 group flex-1"
                    >
                      <p className="truncate text-sm font-medium text-[var(--text)] group-hover:text-[var(--primary)]">
                        {tarefa.titulo}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {tarefa.codigo}
                        {tarefa.assigned_to?.full_name &&
                          ` · ${tarefa.assigned_to.full_name}`}
                        {tarefa.assigned_group?.name &&
                          ` · ${tarefa.assigned_group.name}`}
                        {tarefa.prazo && ` · prazo ${formatDate(tarefa.prazo)}`}
                      </p>
                    </Link>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tarefaStatusClass(tarefa.status)}`}>
                      {tarefaStatusLabel(tarefa.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
