import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const canManage = profile?.role && ["super_admin", "gestor", "almoxarife"].includes(profile.role);
  if (!canManage) redirect("/dashboard");

  const { data: lowStockProducts } = await supabase
    .from("products")
    .select(`
      *,
      category:categories(name)
    `)
    .eq("is_low_stock", true)
    .eq("active", true)
    .order("quantity_current");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Alertas de Estoque</h1>

      {lowStockProducts && lowStockProducts.length > 0 ? (
        <div className="space-y-4">
          {lowStockProducts.map((product: any) => (
            <div key={product.id} className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                      Estoque Baixo
                    </span>
                    <span className="text-sm text-gray-500">{product.category?.name}</span>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {product.name}
                  </h3>

                  <p className="text-sm text-gray-600 mb-3">
                    Código: <span className="font-medium">{product.code}</span>
                  </p>

                  {product.description && (
                    <p className="text-sm text-gray-600 mb-3">{product.description}</p>
                  )}

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-500">Quantidade Atual</p>
                      <p className="text-lg font-bold text-red-600">
                        {product.quantity_current} {product.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Quantidade Mínima</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {product.quantity_minimum} {product.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Diferença</p>
                      <p className="text-lg font-semibold text-orange-600">
                        -{product.quantity_minimum - product.quantity_current} {product.unit}
                      </p>
                    </div>
                  </div>

                  {product.location && (
                    <p className="text-sm text-gray-500 mt-3">
                      Localização: <span className="font-medium">{product.location}</span>
                    </p>
                  )}
                </div>

                <div className="ml-4">
                  <Link
                    href={`/dashboard/estoque/movimentacoes/new?product=${product.id}&type=entrada`}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Registrar Entrada
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Nenhum alerta de estoque
          </h3>
          <p className="text-gray-600">
            Todos os produtos estão com estoque acima do nível mínimo.
          </p>
        </div>
      )}
    </div>
  );
}
