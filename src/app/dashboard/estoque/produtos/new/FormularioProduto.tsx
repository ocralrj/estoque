"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SuggestWithAi from "@/components/ai/SuggestWithAi";
import type { Category } from "@/types/database";

export default function FormularioProduto() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locaisUsados, setLocaisUsados] = useState<
    { local: string; itens: string[] }[]
  >([]);
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
    async function carregar() {
      const supabase = createClient();

      const [{ data: cats }, { data: produtos }] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        // As localizações já em uso, com o que guardam. Um almoxarifado real
        // tem meia dúzia de lugares, e digitá-los de novo a cada produto gera
        // "Sala do TI", "sala do ti" e "Sala TI" convivendo — três prateleiras
        // no relatório, uma na vida real.
        supabase
          .from("products")
          .select("location, name")
          .eq("active", true)
          .not("location", "is", null),
      ]);

      setCategories(cats || []);

      const mapa = new Map<string, string[]>();
      for (const p of produtos ?? []) {
        const local = (p.location as string | null)?.trim();
        if (!local) continue;
        const lista = mapa.get(local) ?? [];
        lista.push(p.name as string);
        mapa.set(local, lista);
      }

      setLocaisUsados(
        Array.from(mapa.entries())
          .map(([local, itens]) => ({ local, itens }))
          .sort((a, b) => b.itens.length - a.itens.length)
      );
    }
    carregar();
  }, []);

  // Compara sem acento e sem caixa: "Sala do TI" e "sala do ti" são o mesmo
  // lugar, e é justamente essa diferença que multiplica prateleiras no
  // relatório.
  function normalizar(t: string) {
    return t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  }

  const buscado = normalizar(formData.location);
  const locaisSemelhantes = buscado
    ? locaisUsados.filter((l) => normalizar(l.local).includes(buscado)).slice(0, 5)
    : locaisUsados.slice(0, 5);

  // Sem estes três não existe produto: código e nome o identificam, a unidade
  // dá sentido a qualquer quantidade. O resto pode ser preenchido depois.
  const podeSalvar =
    formData.code.trim().length > 0 &&
    formData.name.trim().length > 0 &&
    formData.unit.trim().length > 0;

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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              list="locais-em-uso"
              placeholder="ex: Prateleira A3, Sala 2"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            />
            <datalist id="locais-em-uso">
              {locaisUsados.map((l) => (
                <option key={l.local} value={l.local} />
              ))}
            </datalist>

            {/* O que já mora no lugar digitado. Responde a pergunta que se faz
                ao guardar algo — "cabe aqui?" — mostrando o que está lá, em vez
                de deixar a pessoa abrir outra tela para conferir. */}
            {locaisSemelhantes.length > 0 && (
              <div className="mt-2 rounded-lg bg-[var(--neo-flat)] px-3 py-2">
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  {formData.location.trim()
                    ? "Locais parecidos já em uso — clique para reaproveitar"
                    : "Locais já em uso"}
                </p>
                <ul className="mt-1 space-y-1">
                  {locaisSemelhantes.map((l) => (
                    <li key={l.local}>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, location: l.local })
                        }
                        className="text-left text-xs text-[var(--primary)] hover:underline"
                      >
                        <strong>{l.local}</strong>
                        <span className="text-[var(--text-muted)]">
                          {" "}
                          — {l.itens.length} item(ns): {l.itens.slice(0, 3).join(", ")}
                          {l.itens.length > 3 ? "…" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4">
            {/* O botão só existe quando dá para salvar. No lugar dele fica o
                que falta — um espaço vazio deixaria a pessoa procurando um
                botão que sumiu sem explicação. */}
            {podeSalvar ? (
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-[var(--primary)] px-6 py-2 text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Salvando..." : "Salvar Produto"}
              </button>
            ) : (
              <p className="rounded-lg bg-[var(--neo-flat)] px-4 py-2 text-xs text-[var(--text-muted)]">
                {!formData.code.trim()
                  ? "Informe o código para continuar"
                  : !formData.name.trim()
                    ? "Informe o nome para continuar"
                    : "Informe a unidade para continuar"}
              </p>
            )}
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
