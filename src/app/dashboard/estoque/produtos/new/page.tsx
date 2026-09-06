"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SuggestWithAi from "@/components/ai/SuggestWithAi";
import type { Category } from "@/types/database";

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    category_id: "",
    unit: "",
    quantity_current: 0,
    quantity_minimum: 0,
    location: "",
  });

  useEffect(() => {
    async function loadCategories() {
      const supabase = createClient();
      const { data } = await supabase.from("categories").select("*").order("name");
      setCategories(data || []);
    }
    loadCategories();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      code: formData.code,
      name: formData.name,
      description: formData.description || null,
      category_id: formData.category_id || null,
      unit: formData.unit,
      quantity_current: formData.quantity_current,
      quantity_minimum: formData.quantity_minimum,
      location: formData.location || null,
      created_by: user?.id,
    };

    const { error } = await supabase.from("products").insert(payload);

    if (error) {
      alert("Erro ao criar produto: " + error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard/estoque/produtos");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Novo Produto</h1>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Código *
            </label>
            <input
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Nome *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                Descrição
              </label>
              <SuggestWithAi
                fieldType="descricao_produto"
                whatToSuggest="descrições claras e úteis para o cadastro do produto no almoxarifado"
                currentValue={formData.description}
                context={{
                  codigo: formData.code,
                  nome: formData.name,
                  unidade: formData.unit,
                  categoria:
                    categories.find((c) => c.id === formData.category_id)?.name ||
                    null,
                  localizacao: formData.location,
                }}
                onAccept={(texto) =>
                  setFormData((prev) => ({ ...prev, description: texto }))
                }
              />
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Categoria
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            >
              <option value="">Selecione uma categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Unidade *
            </label>
            <input
              type="text"
              required
              placeholder="ex: UN, CX, PC, L"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Quantidade Atual
              </label>
              <input
                type="number"
                min="0"
                value={formData.quantity_current}
                onChange={(e) => setFormData({ ...formData, quantity_current: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Quantidade Mínima
              </label>
              <input
                type="number"
                min="0"
                value={formData.quantity_minimum}
                onChange={(e) => setFormData({ ...formData, quantity_minimum: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Localização
            </label>
            <input
              type="text"
              placeholder="ex: Prateleira A3, Sala 2"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar Produto"}
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
