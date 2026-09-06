"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SuggestWithAi from "@/components/ai/SuggestWithAi";
import type { MovementType, Product } from "@/types/database";

function NewMovementForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    product_id: searchParams.get("product") ?? "",
    type: (searchParams.get("type") === "saida" ? "saida" : "entrada") as MovementType,
    quantity: 0,
    reason: "",
    notes: "",
  });

  useEffect(() => {
    async function loadProducts() {
      const supabase = createClient();
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name");
      setProducts(data || []);
    }
    loadProducts();
  }, []);

  useEffect(() => {
    if (formData.product_id) {
      const product = products.find((p) => p.id === formData.product_id);
      setSelectedProduct(product ?? null);
    } else {
      setSelectedProduct(null);
    }
  }, [formData.product_id, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError("Sessão expirada. Entre novamente.");
      setLoading(false);
      return;
    }

    if (formData.type === "saida" && selectedProduct && formData.quantity > selectedProduct.quantity_current) {
      setError("Quantidade solicitada maior que o estoque disponível.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("movements").insert({
      ...formData,
      created_by: user.id,
    });

    if (insertError) {
      setError("Erro ao registrar movimentação: " + insertError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard/estoque/movimentacoes");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Nova Movimentação</h1>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Tipo de Movimentação *
            </label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as MovementType })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Produto *
            </label>
            <select
              required
              value={formData.product_id}
              onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            >
              <option value="">Selecione um produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} - {product.name} (Estoque: {product.quantity_current} {product.unit})
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div className="bg-[var(--info-bg)] border border-[var(--neo-line)] rounded-lg p-4">
              <p className="text-sm text-[var(--info-fg)]">
                <span className="font-medium">Estoque atual:</span> {selectedProduct.quantity_current} {selectedProduct.unit}
              </p>
              {selectedProduct.is_low_stock && (
                <p className="text-sm text-[var(--erro-solid)] mt-1">
                  Atenção: Este produto está com estoque baixo!
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Quantidade *
            </label>
            <input
              type="number"
              required
              min="1"
              value={formData.quantity || ""}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                Motivo *
              </label>
              <SuggestWithAi
                fieldType="motivo_movimentacao"
                whatToSuggest={
                  formData.type === "entrada"
                    ? "motivos curtos de entrada de estoque (compra, devolução, ajuste)"
                    : "motivos curtos de saída de estoque (requisição, uso, perda)"
                }
                currentValue={formData.reason}
                context={{
                  tipo: formData.type,
                  produto: selectedProduct
                    ? {
                        codigo: selectedProduct.code,
                        nome: selectedProduct.name,
                        estoque: selectedProduct.quantity_current,
                        unidade: selectedProduct.unit,
                      }
                    : null,
                  quantidade: formData.quantity,
                }}
                onAccept={(texto) =>
                  setFormData((prev) => ({ ...prev, reason: texto }))
                }
              />
            </div>
            <input
              type="text"
              required
              placeholder={formData.type === "entrada" ? "Ex: Compra, Devolução" : "Ex: Requisição, Utilização"}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                Observações
              </label>
              <SuggestWithAi
                fieldType="observacao_movimentacao"
                whatToSuggest="observações complementares objetivas para a movimentação de estoque"
                currentValue={formData.notes}
                context={{
                  tipo: formData.type,
                  motivo: formData.reason,
                  produto: selectedProduct
                    ? {
                        codigo: selectedProduct.code,
                        nome: selectedProduct.name,
                      }
                    : null,
                  quantidade: formData.quantity,
                }}
                onAccept={(texto) =>
                  setFormData((prev) => ({ ...prev, notes: texto }))
                }
              />
            </div>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--erro-solid)] bg-[var(--erro-bg)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
            >
              {loading ? "Registrando..." : "Registrar Movimentação"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-[var(--neo-flat-alt)] text-[var(--text)] rounded-lg hover:brightness-95 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewMovementPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Carregando...</p>}>
      <NewMovementForm />
    </Suspense>
  );
}
