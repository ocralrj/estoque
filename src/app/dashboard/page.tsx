import { isManager, requireSession } from "@/lib/auth";
import { roleLabel } from "@/lib/labels";

export default async function DashboardPage() {
  const { supabase, profile } = await requireSession();
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
    </div>
  );
}
