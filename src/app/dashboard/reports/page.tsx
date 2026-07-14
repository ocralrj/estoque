"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [stats, setStats] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);

  useEffect(() => {
    loadReports();
  }, [dateRange]);

  async function loadReports() {
    setLoading(true);
    const supabase = createClient();

    const { data: movements } = await supabase
      .from("movements")
      .select(`
        *,
        product:products(name, code, category:categories(name))
      `)
      .gte("created_at", dateRange.start)
      .lte("created_at", dateRange.end);

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

    const productCounts = movements.reduce((acc: any, m: any) => {
      const key = m.product_id;
      if (!acc[key]) {
        acc[key] = {
          product: m.product,
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
      .sort((a: any, b: any) => b.totalMovements - a.totalMovements)
      .slice(0, 10);

    setTopProducts(sortedProducts);

    const categoryCounts = movements.reduce((acc: any, m: any) => {
      const category = m.product?.category?.name || "Sem categoria";
      if (!acc[category]) {
        acc[category] = { name: category, count: 0 };
      }
      acc[category].count++;
      return acc;
    }, {});

    setCategoryStats(Object.values(categoryCounts).sort((a: any, b: any) => b.count - a.count));
    setLoading(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Relatórios</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Período</h2>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Carregando relatórios...</p>
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Total de Movimentações</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{stats.totalMovements}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Entradas</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.totalEntradas}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Saídas</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{stats.totalSaidas}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Volume Entrada</p>
                <p className="text-3xl font-bold text-green-500 mt-1">{stats.volumeEntrada}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Volume Saída</p>
                <p className="text-3xl font-bold text-red-500 mt-1">{stats.volumeSaida}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Top 10 Produtos Mais Movimentados
              </h2>
              {topProducts.length > 0 ? (
                <div className="space-y-3">
                  {topProducts.map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.product?.name}
                        </p>
                        <p className="text-xs text-gray-500">{item.product?.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-blue-600">
                          {item.totalMovements} mov.
                        </p>
                        <p className="text-xs text-green-600">+{item.entradas}</p>
                        <p className="text-xs text-red-600">-{item.saidas}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhuma movimentação no período</p>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Movimentações por Categoria
              </h2>
              {categoryStats.length > 0 ? (
                <div className="space-y-3">
                  {categoryStats.map((cat: any, index: number) => (
                    <div key={index} className="flex items-center justify-between border-b pb-2">
                      <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                      <p className="text-sm font-semibold text-blue-600">{cat.count} mov.</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhuma movimentação no período</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
