import Link from "next/link";
import { isManager, requireSession } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import { formatDate, roleLabel } from "@/lib/labels";
import {
  tarefaAtrasada,
  tarefaStatusClass,
  tarefaStatusLabel,
  tarefaVenceHoje,
  type Tarefa,
} from "@/types/modules/tarefas";

function CartaoResumo({
  href,
  rotulo,
  valor,
  cor,
  detalhe,
}: {
  href: string;
  rotulo: string;
  valor: number;
  cor: string;
  detalhe: string;
}) {
  return (
    <Link
      href={href}
      className="neo-card p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--relevo-2)]"
    >
      <p className="text-sm font-medium text-[var(--text-muted)]">{rotulo}</p>
      <p className={`mt-2 text-3xl font-bold ${cor}`}>{valor}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{detalhe}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const { supabase, profile, user } = await requireSession();
  const showUserCount = isManager(profile?.role);

  // Cada consulta só sai se a sessão pode abrir a tela que a alimenta. O número
  // na tela nunca é maior do que a pessoa consegue conferir.
  const [veTarefas, veProdutos, veAlertas, vePedidos, veMovimes] = await Promise.all([
    pode("tarefas", "tarefas", "read"),
    pode("estoque", "products", "read"),
    pode("estoque", "alerts", "read"),
    pode("estoque", "requisicoes", "read"),
    pode("estoque", "movements", "read"),
  ]);
  const podeCriarTarefa = await pode("tarefas", "tarefas", "create");

  // Quem coordena vê todas; os demais veem as que abriram e as que ficaram
  // com elas. O mesmo filtro vale para a contagem e a lista.
  const soMinhas = !isManager(profile?.role);
  const filtroTarefas = <
    Q extends { or: (corpo: string) => Q }
  >(
    q: Q
  ) => {
    let query = q;
    if (soMinhas) {
      const corpo = [`created_by.eq.${user.id}`, `assigned_to.eq.${user.id}`].join(
        ","
      );
      query = query.or(corpo);
    }
    return query;
  };

  const { data: minhasAbiertas } = veTarefas
    ? await filtroTarefas(
        supabase
          .from("tarefas")
          .select(
            `
            *,
            executor:profiles!tarefas_assigned_to_fkey(id, full_name, email)
            `
          )
          .in("status", ["aguardando", "em_andamento"])
          .order("prazo", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(5)
      ).returns<Tarefa[]>()
    : { data: null };

  // O selo mostra a contagem total, não só as 5 da lista.
  const { count: tarefasCountRaw } = veTarefas
    ? await filtroTarefas(
        supabase
          .from("tarefas")
          .select("*", { count: "exact", head: true })
          .in("status", ["aguardando", "em_andamento"])
      )
    : { count: null };
  const tarefasCount = tarefasCountRaw ?? null;

  const { count: produtosCount } = veProdutos
    ? await supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true)
    : { count: null };

  const { count: baixoCount } = veAlertas
    ? await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("is_low_stock", true)
        .eq("active", true)
    : { count: null };

  const { count: pedidosCount } = vePedidos
    ? await supabase
        .from("pedidos_material")
        .select("*", { count: "exact", head: true })
        .eq("status", "aberto")
    : { count: null };

  const { count: usuariosCount } = showUserCount
    ? await supabase.from("profiles").select("*", { count: "exact", head: true })
    : { count: null };

  const minhasTarefas = minhasAbiertas ?? [];
  const tarefasAbertas = tarefasCount ?? minhasTarefas.length;
  const tarefasAtrasadas = minhasTarefas.filter((t) => tarefaAtrasada(t)).length;

  const movimentacoes = veMovimes
    ? await supabase
        .from("movements")
        .select(
          `
          *,
          product:products(name),
          user:profiles(full_name, email)
        `
        )
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: null };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Olá, {profile?.full_name?.trim() || "seja bem-vindo"}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Aqui você encontra o que precisa de atenção hoje.
        </p>
      </div>

      {veTarefas && (
        <section className="neo-card p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-[var(--text)]">Minhas tarefas</h2>
                <span
                  className={`neo-sit ${
                    tarefasAtrasadas > 0
                      ? "neo-sit--erro"
                      : tarefasAbertas > 0
                        ? "neo-sit--aviso"
                        : "neo-sit--ok"
                  }`}
                >
                  {tarefasAbertas} aberta{tarefasAbertas > 1 ? "s" : ""}
                  {tarefasAtrasadas > 0 && ` · ${tarefasAtrasadas} atrasada${tarefasAtrasadas > 1 ? "s" : ""}`}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Suas tarefas em aberto e as da sua área.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {podeCriarTarefa && (
                <Link
                  href="/dashboard/tarefas/nova"
                  className="neo-btn neo-btn--primario !min-h-[40px] !px-4 !py-2 text-sm"
                >
                  Nova tarefa
                </Link>
              )}
              <Link
                href="/dashboard/tarefas"
                className="neo-btn !min-h-[40px] !px-4 !py-2 text-sm"
              >
                Ver todas
              </Link>
            </div>
          </div>

          {tarefasAbertas > 0 ? (
            <div className="neo-flat">
              <ul className="neo-lista">
                {minhasTarefas.map((tarefa) => {
                  const atrasada = tarefaAtrasada(tarefa);
                  const venceHoje = tarefaVenceHoje(tarefa);
                  return (
                    <li key={tarefa.id}>
                      <Link
                        href={`/dashboard/tarefas/${tarefa.id}`}
                        className="block px-4 py-3 transition hover:bg-[var(--neo-flat-alt)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--text)]">
                              {tarefa.titulo}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                              {tarefa.codigo}
                              {tarefa.executor?.full_name &&
                                ` · ${tarefa.executor.full_name}`}
                              {tarefa.prazo && (
                                <span
                                  className={
                                    atrasada
                                      ? " font-bold text-[var(--erro-fg)]"
                                      : venceHoje
                                        ? " font-bold text-[var(--aviso-fg)]"
                                        : ""
                                  }
                                >
                                  {" "}
                                  · prazo {formatDate(tarefa.prazo)}
                                  {atrasada && " (atrasada)"}
                                  {venceHoje && " (hoje)"}
                                </span>
                              )}
                            </p>
                          </div>
                          <span
                            className={`neo-sit ${tarefaStatusClass(tarefa.status)}`}
                          >
                            {tarefaStatusLabel(tarefa.status)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="neo-flat">
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  Nenhuma tarefa em aberto para você.
                </p>
                {podeCriarTarefa && (
                  <Link
                    href="/dashboard/tarefas/nova"
                    className="mt-3 inline-block text-sm font-semibold text-[var(--primary)] hover:underline"
                  >
                    Criar uma tarefa
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {(veProdutos || veAlertas || vePedidos || showUserCount) && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-[var(--text)]">Resumo</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {veProdutos && (
              <CartaoResumo
                href="/dashboard/estoque/produtos"
                rotulo="Produtos ativos"
                valor={produtosCount ?? 0}
                cor="text-[var(--primary)]"
                detalhe="O que está cadastrado no almoxarifado"
              />
            )}
            {veAlertas && (
              <CartaoResumo
                href="/dashboard/estoque/alertas"
                rotulo="Estoque baixo"
                valor={baixoCount ?? 0}
                cor={baixoCount ? "text-[var(--erro-solid)]" : "text-[var(--ok-solid)]"}
                detalhe={
                  baixoCount ? "Abaixo do mínimo — precisa repor" : "Tudo dentro do mínimo"
                }
              />
            )}
            {vePedidos && (
              <CartaoResumo
                href="/dashboard/estoque/pedidos"
                rotulo="Pedidos em aberto"
                valor={pedidosCount ?? 0}
                cor={pedidosCount ? "text-[var(--aviso-solid)]" : "text-[var(--ok-solid)]"}
                detalhe="Aguardando atendimento do almoxarifado"
              />
            )}
            {showUserCount && (
              <CartaoResumo
                href="/dashboard/admin/usuarios"
                rotulo="Usuários ativos"
                valor={usuariosCount ?? 0}
                cor="text-[var(--primary)]"
                detalhe="Contas liberadas no sistema"
              />
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="neo-card p-5">
          <h2 className="mb-4 text-lg font-bold text-[var(--text)]">
            Movimentações recentes
          </h2>
          {movimentacoes.data && movimentacoes.data.length > 0 ? (
            <div className="neo-flat">
              <ul className="neo-lista">
                {movimentacoes.data.map((mov) => (
                  <li key={mov.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {mov.product?.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                        {mov.user?.full_name || mov.user?.email} · {formatDate(mov.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`neo-sit ${mov.type === "entrada" ? "neo-sit--ok" : "neo-sit--info"}`}>
                        {mov.type === "entrada" ? "Entrada" : "Saída"}
                      </span>
                      <span
                        className={`w-16 text-right text-sm font-bold ${
                          mov.type === "entrada" ? "text-[var(--ok-fg)]" : "text-[var(--erro-fg)]"
                        }`}
                      >
                        {mov.type === "entrada" ? "+" : "-"}
                        {mov.quantity}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="neo-flat">
              <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                Nenhuma movimentação recente.
              </p>
            </div>
          )}
        </section>

        <section className="neo-card p-5">
          <h2 className="mb-4 text-lg font-bold text-[var(--text)]">Seu perfil</h2>
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Email:</span> {profile?.email}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Função:</span>{" "}
              {roleLabel(profile?.role)}
            </p>
            <Link
              href="/dashboard/profile"
              className="mt-3 inline-block text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              Editar meu perfil
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}