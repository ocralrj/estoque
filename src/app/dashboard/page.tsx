import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

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

  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Olá, {profile?.full_name || profile?.email}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">Total de Produtos</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{totalProducts ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">Estoque Baixo</p>
          <p className="text-3xl font-bold text-red-500 mt-1">{lowStockProducts ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">Categorias</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{totalCategories ?? 0}</p>
        </div>
        {(profile?.role === "super_admin" || profile?.role === "gestor") && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500">Usuários</p>
            <p className="text-3xl font-bold text-purple-600 mt-1">{totalUsers ?? 0}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Movimentações Recentes</h2>
          {recentMovements && recentMovements.length > 0 ? (
            <div className="space-y-3">
              {recentMovements.map((mov: any) => (
                <div key={mov.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{mov.product?.name}</p>
                    <p className="text-xs text-gray-500">
                      {mov.user?.full_name || mov.user?.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${mov.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.type === 'entrada' ? '+' : '-'}{mov.quantity}
                    </p>
                    <p className="text-xs text-gray-500">{mov.type}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhuma movimentação recente</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Seu perfil</h2>
          <p className="text-sm text-gray-600">Email: {profile?.email}</p>
          <p className="text-sm text-gray-600 mt-1">
            Função:{" "}
            <span className="font-medium capitalize">
              {profile?.role?.replace("_", " ")}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
