import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { requireSession, STOCK_ROLES } from "@/lib/auth";
import type { Product } from "@/types/database";

export default async function AlertsPage() {
  const { supabase } = await requireSession(STOCK_ROLES);
  await exigirPermissao("estoque", "alerts", "read");

  const [{ data: lowStockProductsData }, { data: locaisData }] = await Promise.all([
    supabase
      .from("products")
      .select(`
        *,
        category:categories(name)
      `)
      .eq("is_low_stock", true)
      .eq("active", true)
      .order("quantity_current"),
    supabase
      .from("locations")
      .select("id, name")
      .order("name"),
  ]);

  const locaisMap = new Map<string, string>();
  for (const l of ((locaisData as { id: string; name: string }[] | null) ?? [])) {
    locaisMap.set(l.id, l.name);
  }

  const lowStockProducts = lowStockProductsData as Product[] | null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Alertas de Estoque</h1>

      {lowStockProducts && lowStockProducts.length > 0 ? (
        <div className="space-y-4">
          {lowStockProducts.map((product) => (
            <div key={product.id} className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 border-l-4 border-[var(--erro-solid)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="neo-sit neo-sit--erro">Estoque baixo</span>
                    <span className="text-sm text-[var(--text-muted)]">{product.category?.name}</span>
                  </div>

                  <h3 className="text-lg font-semibold text-[var(--text)] mb-1">
                    {product.name}
                  </h3>

                  <p className="text-sm text-[var(--text-muted)] mb-3">
                    Código: <span className="font-medium">{product.code}</span>
                  </p>

                  {product.description && (
                    <p className="text-sm text-[var(--text-muted)] mb-3">{product.description}</p>
                  )}

                  <div className="grid grid-cols-1 gap-4 mt-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Quantidade Atual</p>
                      <p className="text-lg font-bold text-[var(--erro-solid)]">
                        {product.quantity_current} {product.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Quantidade Mínima</p>
                      <p className="text-lg font-semibold text-[var(--text)]">
                        {product.quantity_minimum} {product.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Diferença</p>
                      <p className="text-lg font-semibold text-[var(--aviso-solid)]">
                        -{product.quantity_minimum - product.quantity_current} {product.unit}
                      </p>
                    </div>
                  </div>

                  {product.location && (
                    <p className="text-sm text-[var(--text-muted)] mt-3">
                      Localização:{" "}
                      <span className="font-medium">
                        {locaisMap.get(product.location) || product.location}
                      </span>
                    </p>
                  )}
                </div>

                <div className="shrink-0 sm:ml-4">
                  <Link
                    href={`/dashboard/estoque/movimentacoes/new?product=${product.id}&type=entrada`}
                    className="px-4 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors text-sm"
                  >
                    Registrar Entrada
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--ok-bg)] mb-4">
            <svg className="w-8 h-8 text-[var(--ok-solid)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
            Nenhum alerta de estoque
          </h3>
          <p className="text-[var(--text-muted)]">
            Todos os produtos estão com estoque acima do nível mínimo.
          </p>
        </div>
      )}
    </div>
  );
}
