"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Movement, ReportStats, ProductMovementStats, CategoryStats } from "@/types/database";

export default function ReportsClient() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [topProducts, setTopProducts] = useState<ProductMovementStats[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // dateRange.end é uma data pura; comparada a um timestamp ela vale
    // 00:00 daquele dia. Usamos o início do dia seguinte com "menor que"
    // para que o dia final entre inteiro no período.
    const endExclusive = new Date(`${dateRange.end}T00:00:00`);
    endExclusive.setDate(endExclusive.getDate() + 1);

    const { data: movements } = await supabase
      .from("movements")
      .select(`
        *,
        product:products(name, code, category:categories(name))
      `)
      .gte("created_at", `${dateRange.start}T00:00:00`)
      .lt("created_at", endExclusive.toISOString())
      .returns<Movement[]>();

    if (!movements) {
      setLoading(false);
      return;
    }

    const entradas = movements.filter(m => m.type === "entrada");
    const saidas = movements.filter(m => m.type === "saida");

    setStats({
      totalMovements: movements.length,
      totalEntradas: entradas.length,
      totalSaidas: saidas.length,
      volumeEntrada: entradas.reduce((sum, m) => sum + m.quantity, 0),
      volumeSaida: saidas.reduce((sum, m) => sum + m.quantity, 0),
    });

    const productCounts = movements.reduce<Record<string, ProductMovementStats>>((acc, m) => {
      const key = m.product_id;
      if (!acc[key]) {
        acc[key] = {
          product: m.product || null,
          entradas: 0,
          saidas: 0,
          totalMovements: 0,
        };
      }
      acc[key].totalMovements++;
      if (m.type === "entrada") acc[key].entradas += m.quantity;
      else acc[key].saidas += m.quantity;
      return acc;
    }, {});

    const sortedProducts = Object.values(productCounts)
      .sort((a, b) => b.totalMovements - a.totalMovements)
      .slice(0, 10);

    setTopProducts(sortedProducts);

    const categoryCounts = movements.reduce<Record<string, CategoryStats>>((acc, m) => {
      const category = m.product?.category?.name || "Sem categoria";
      if (!acc[category]) {
        acc[category] = { name: category, count: 0 };
      }
      acc[category].count++;
      return acc;
    }, {});

    setCategoryStats(Object.values(categoryCounts).sort((a, b) => b.count - a.count));
    setLoading(false);
  }, [dateRange.end, dateRange.start]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Relatórios</h1>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Período</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-md">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-[var(--text-muted)]">Carregando relatórios...</p>
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-1 gap-4 mb-8 sm:grid-cols-2 xl:grid-cols-5">
              <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
                <p className="text-sm text-[var(--text-muted)]">Total de Movimentações</p>
                <p className="text-3xl font-bold text-[var(--primary)] mt-1">{stats.totalMovements}</p>
              </div>
              <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
                <p className="text-sm text-[var(--text-muted)]">Entradas</p>
                <p className="text-3xl font-bold text-[var(--ok-solid)] mt-1">{stats.totalEntradas}</p>
              </div>
              <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
                <p className="text-sm text-[var(--text-muted)]">Saídas</p>
                <p className="text-3xl font-bold text-[var(--erro-solid)] mt-1">{stats.totalSaidas}</p>
              </div>
              <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
                <p className="text-sm text-[var(--text-muted)]">Volume Entrada</p>
                <p className="text-3xl font-bold text-[var(--ok-solid)] mt-1">{stats.volumeEntrada}</p>
              </div>
              <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
                <p className="text-sm text-[var(--text-muted)]">Volume Saída</p>
                <p className="text-3xl font-bold text-[var(--erro-solid)] mt-1">{stats.volumeSaida}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-[var(--text)] mb-4">
                Top 10 Produtos Mais Movimentados
              </h2>
              {topProducts.length > 0 ? (
                <div className="space-y-3">
                  {topProducts.map((item) => (
                    <div key={item.product?.code ?? item.product?.name} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">
                          {item.product?.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{item.product?.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[var(--primary)]">
                          {item.totalMovements} mov.
                        </p>
                        <p className="text-xs text-[var(--ok-solid)]">+{item.entradas}</p>
                        <p className="text-xs text-[var(--erro-solid)]">-{item.saidas}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Nenhuma movimentação no período</p>
              )}
            </div>

            <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-[var(--text)] mb-4">
                Movimentações por Categoria
              </h2>
              {categoryStats.length > 0 ? (
                <div className="space-y-3">
                  {categoryStats.map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between border-b pb-2">
                      <p className="text-sm font-medium text-[var(--text)]">{cat.name}</p>
                      <p className="text-sm font-semibold text-[var(--primary)]">{cat.count} mov.</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Nenhuma movimentação no período</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
