import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { canManageStock, requireSession } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import {
  CelulaCategoria,
  CelulaCodigo,
  CelulaLocalizacao,
} from "./CamposEditaveis";

export default async function ProductsPage() {
  const { supabase, profile } = await requireSession();
  await exigirPermissao("estoque", "products", "read");

  const [{ data: products }, { data: categorias }, { data: locaisData }] = await Promise.all([
    supabase
      .from("products")
      .select(`
        *,
        category:categories(name)
      `)
      .eq("active", true)
      .order("name"),
    supabase
      .from("categories")
      .select("id, name")
      .order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .order("name"),
  ]);

  const canManage = canManageStock(profile?.role);

  // Editar na linha exige a permissão de alterar produto — a de movimentar não
  // basta: quem dá baixa não decide o código nem onde a coisa fica guardada.
  const podeEditar = await pode("estoque", "products", "update");

  const locaisLista = ((locaisData as { id: string; name: string }[] | null) ?? []);
  const locaisMap = new Map<string, string>();
  for (const l of locaisLista) {
    locaisMap.set(l.id, l.name);
  }

  // Quantos produtos há em cada local: agrupados pelo NOME do local,
  // e nunca por UUID ou coordenadas.
  const locaisUsados = Object.entries(
    (products ?? []).reduce<Record<string, number>>((acc, p) => {
      const raw = (p.location as string | null)?.trim();
      if (!raw) return acc;
      const nome = (locaisMap.get(raw) || raw).trim();
      if (nome) acc[nome] = (acc[nome] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([local, total]) => ({ local, total }))
    .sort((a, b) => b.total - a.total);

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
          <table className="w-full tabela-mobile">
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
                    <td data-rotulo="Código" className="px-6 py-4 text-sm">
                      <CelulaCodigo
                        produtoId={product.id}
                        codigo={product.code}
                        editavel={podeEditar}
                      />
                    </td>
                    <td data-rotulo="Nome" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {product.name}
                    </td>
                    <td data-rotulo="Categoria" className="px-6 py-4 text-sm">
                      <CelulaCategoria
                        produtoId={product.id}
                        categoriaId={product.category_id}
                        nome={product.category?.name ?? null}
                        categorias={categorias ?? []}
                        editavel={podeEditar}
                      />
                    </td>
                    <td data-rotulo="Quantidade" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {product.quantity_current} {product.unit}
                    </td>
                    <td data-rotulo="Mínimo" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {product.quantity_minimum} {product.unit}
                    </td>
                    <td data-rotulo="Localização" className="px-6 py-4 text-sm">
                      <CelulaLocalizacao
                        produtoId={product.id}
                        local={
                          product.location
                            ? (locaisMap.get(product.location) || product.location)
                            : null
                        }
                        locaisDisponiveis={locaisLista}
                        locaisUsados={locaisUsados}
                        editavel={podeEditar}
                      />
                    </td>
                    <td data-rotulo="Status" className="px-6 py-4 whitespace-nowrap">
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
