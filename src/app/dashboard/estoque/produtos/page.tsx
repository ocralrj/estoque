import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { canManageStock, requireSession } from "@/lib/auth";

export default async function ProductsPage() {
  const { supabase, profile } = await requireSession();
  await exigirPermissao("estoque", "products", "read");

  const { data: products } = await supabase
    .from("products")
    .select(`
      *,
      category:categories(name)
    `)
    .eq("active", true)
    .order("name");

  const canManage = canManageStock(profile?.role);

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">Produtos</h1>
        {canManage && (
          <Link
            href="/dashboard/estoque/produtos/new"
            className="px-4 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors"
          >
            Novo Produto
          </Link>
        )}
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        <div className="neo-flat overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--neo-flat)] border-b border-[var(--neo-line)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Quantidade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Mínimo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Localização
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Status
                </th>
                {canManage && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-[var(--neo-bg)] divide-y divide-[var(--neo-line)]">
              {products && products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-[var(--neo-flat)]">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">
                      {product.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {product.category?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {product.quantity_current} {product.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {product.quantity_minimum} {product.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {product.location || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {product.is_low_stock ? (
                        <span className="neo-sit neo-sit--erro">Estoque baixo</span>
                      ) : (
                        <span className="neo-sit neo-sit--ok">Normal</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/dashboard/estoque/movimentacoes/new?product=${product.id}`}
                          className="text-[var(--primary)] hover:underline"
                        >
                          Movimentar
                        </Link>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-6 py-4 text-center text-sm text-[var(--text-muted)]">
                    Nenhum produto cadastrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
