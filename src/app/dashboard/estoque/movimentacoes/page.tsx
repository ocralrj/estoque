import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { requireSession, STOCK_ROLES } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";

export default async function MovementsPage() {
  const { supabase } = await requireSession(STOCK_ROLES);
  await exigirPermissao("estoque", "movements", "read");

  const { data: movements } = await supabase
    .from("movements")
    .select(`
      *,
      product:products(name, code, unit),
      user:profiles(full_name, email)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">Movimentações</h1>
        <Link
          href="/dashboard/estoque/movimentacoes/new"
          className="px-4 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors"
        >
          Nova Movimentação
        </Link>
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        <div className="neo-flat overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--neo-flat)] border-b border-[var(--neo-line)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Produto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Quantidade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Estoque Anterior
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Estoque Novo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Motivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Usuário
                </th>
              </tr>
            </thead>
            <tbody className="bg-[var(--neo-bg)] divide-y divide-[var(--neo-line)]">
              {movements && movements.length > 0 ? (
                movements.map((mov) => (
                  <tr key={mov.id} className="hover:bg-[var(--neo-flat)]">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {formatDateTime(mov.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      <div>{mov.product?.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{mov.product?.code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {mov.type === 'entrada' ? (
                        <span className="neo-sit neo-sit--ok">Entrada</span>
                      ) : (
                        <span className="neo-sit neo-sit--info">Saída</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">
                      {mov.type === 'entrada' ? '+' : '-'}{mov.quantity} {mov.product?.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {mov.previous_quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {mov.new_quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-muted)] max-w-xs truncate">
                      {mov.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {mov.user?.full_name || mov.user?.email}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-[var(--text-muted)]">
                    Nenhuma movimentação registrada
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
