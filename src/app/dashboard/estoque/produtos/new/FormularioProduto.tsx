"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { atualizarProdutoCompleto } from "@/app/actions/produtos";
import SuggestWithAi from "@/components/ai/SuggestWithAi";

interface Opcao {
  id: string;
  name: string;
}

/** Produto carregado para alteração: todos os campos atuais, menos o código. */
export interface ProdutoEmEdicao {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  categoria_nome: string | null;
  unit: string;
  quantity_current: number;
  quantity_minimum: number;
  location: string | null;
  localizacao_nome: string | null;
}

export default function FormularioProduto({ produto }: { produto?: ProdutoEmEdicao }) {
  const emEdicao = !!produto;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [categories, setCategories] = useState<Opcao[]>([]);
  const [locais, setLocais] = useState<Opcao[]>([]);
  const [itensPorLocal, setItensPorLocal] = useState<Record<string, string[]>>({});
  const [erroCarga, setErroCarga] = useState("");
  const [formData, setFormData] = useState({
    name: produto?.name ?? "",
    description: produto?.description ?? "",
    category_id: produto?.category_id ?? "",
    unit: produto?.unit ?? "",
    quantity_current: produto?.quantity_current ?? 0,
    quantity_minimum: produto?.quantity_minimum ?? 0,
    location_id: produto?.location ?? "",
  });

  useEffect(() => {
    async function carregar() {
      const supabase = createClient();

      // Só cadastros ativos: inativo não entra em produto novo. O banco recusa
      // do mesmo jeito (gatilho da 043); aqui ele apenas não é oferecido.
      const [cats, locs, produtos] = await Promise.all([
        supabase.from("categories").select("id, name").eq("active", true).order("name"),
        supabase.from("locations").select("id, name").eq("active", true).order("name"),
        supabase
          .from("products")
          .select("location, name")
          .eq("active", true)
          .not("location", "is", null),
      ]);

      const falha = cats.error ?? locs.error ?? produtos.error;
      if (falha) {
        console.error("Falha ao carregar categorias e localizações:", falha);
        setErroCarga(`Não foi possível carregar categorias e localizações: ${falha.message}`);
      }

      setCategories((cats.data as Opcao[] | null) ?? []);
      setLocais((locs.data as Opcao[] | null) ?? []);

      const mapa: Record<string, string[]> = {};
      for (const p of produtos.data ?? []) {
        const id = p.location as string;
        mapa[id] = [...(mapa[id] ?? []), p.name as string];
      }
      setItensPorLocal(mapa);
    }
    carregar();
  }, []);

  const itensNoLocal = formData.location_id
    ? itensPorLocal[formData.location_id] ?? []
    : [];

  // Na alteração, a categoria/localização atual entra na lista mesmo inativa:
  // sem ela o campo abriria mostrando outra opção como se fosse a do produto.
  const categoriasDisponiveis =
    produto?.category_id && !categories.some((c) => c.id === produto.category_id)
      ? [
          ...categories,
          {
            id: produto.category_id,
            name: `${produto.categoria_nome ?? "Categoria"} (inativa)`,
          },
        ]
      : categories;
  const locaisDisponiveis =
    produto?.location && !locais.some((l) => l.id === produto.location)
      ? [
          ...locais,
          {
            id: produto.location,
            name: `${produto.localizacao_nome ?? "Localização"} (inativa)`,
          },
        ]
      : locais;

  // Sem estes dois não existe produto: o nome o identifica, a unidade dá
  // sentido a qualquer quantidade. O código vem do banco (gatilho da 042).
  const podeSalvar =
    formData.name.trim().length > 0 &&
    formData.unit.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Alterar atualiza o registro que já existe — nunca cria outro.
    if (emEdicao && produto) {
      const res = await atualizarProdutoCompleto(produto.id, {
        name: formData.name,
        description: formData.description || null,
        category_id: formData.category_id || null,
        unit: formData.unit,
        quantity_minimum: formData.quantity_minimum,
        location: formData.location_id || null,
      });
      if (!res.ok) {
        alert(res.message);
        setLoading(false);
        return;
      }
      setSalvo(true);
      setLoading(false);
      setTimeout(() => router.push("/dashboard/estoque/produtos"), 1500);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Sem `code`: o gatilho `products_gerar_codigo` preenche com o maior
    // código + 1, sob trava, para dois cadastros simultâneos não colidirem.
    const payload = {
      name: formData.name,
      description: formData.description || null,
      category_id: formData.category_id || null,
      unit: formData.unit,
      quantity_current: formData.quantity_current,
      quantity_minimum: formData.quantity_minimum,
      location: formData.location_id || null,
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
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">
        {emEdicao ? "Alterar Produto" : "Novo Produto"}
      </h1>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {erroCarga && (
            <p className="rounded-lg bg-[var(--erro-bg)] px-3 py-2 text-sm text-[var(--erro-fg)]">
              {erroCarga}
            </p>
          )}
          {salvo && (
            <p className="rounded-lg bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok-fg)]">
              Produto atualizado com sucesso. Voltando à lista…
            </p>
          )}

          <div>
            <label
              htmlFor="codigo-produto"
              className="block text-sm font-medium text-[var(--text)] mb-1"
            >
              Código
            </label>
            <input
              id="codigo-produto"
              type="text"
              readOnly
              disabled
              value={produto?.code ?? "Gerado automaticamente ao salvar"}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-[var(--text-muted)] cursor-not-allowed"
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
                  nome: formData.name,
                  unidade: formData.unit,
                  categoria:
                    categories.find((c) => c.id === formData.category_id)?.name ||
                    null,
                  localizacao:
                    locais.find((l) => l.id === formData.location_id)?.name || null,
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
            <label
              htmlFor="categoria-produto"
              className="block text-sm font-medium text-[var(--text)] mb-1"
            >
              Categoria
            </label>
            <select
              id="categoria-produto"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            >
              <option value="">Selecione uma categoria</option>
              {categoriasDisponiveis.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {categoriasDisponiveis.length === 0 && !erroCarga && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Nenhuma categoria ativa. Cadastre em{" "}
                <Link href="/dashboard/estoque/categorias" className="text-[var(--primary)] hover:underline">
                  Estoque → Categorias
                </Link>
                .
              </p>
            )}
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
              {emEdicao ? (
                <>
                  <input
                    type="number"
                    readOnly
                    disabled
                    value={formData.quantity_current}
                    aria-label="Quantidade atual (somente leitura)"
                    className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-[var(--text-muted)] cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    A quantidade muda por movimentação, não aqui.{" "}
                    <Link
                      href={`/dashboard/estoque/movimentacoes/new?product=${produto?.id ?? ""}`}
                      className="text-[var(--primary)] hover:underline"
                    >
                      Movimentar
                    </Link>
                    .
                  </p>
                </>
              ) : (
                <input
                  type="number"
                  min="0"
                  value={formData.quantity_current}
                  onChange={(e) => setFormData({ ...formData, quantity_current: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
                />
              )}
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
            <label
              htmlFor="localizacao-produto"
              className="block text-sm font-medium text-[var(--text)] mb-1"
            >
              Localização
            </label>
            <select
              id="localizacao-produto"
              value={formData.location_id}
              onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
            >
              <option value="">Selecione uma localização</option>
              {locaisDisponiveis.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            {locaisDisponiveis.length === 0 && !erroCarga && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Nenhuma localização ativa. Cadastre em{" "}
                <Link href="/dashboard/estoque/localizacoes" className="text-[var(--primary)] hover:underline">
                  Estoque → Localizações
                </Link>
                .
              </p>
            )}

            {/* O que já mora no lugar escolhido. Responde a pergunta que se faz
                ao guardar algo — "cabe aqui?" — sem abrir outra tela. */}
            {itensNoLocal.length > 0 && (
              <div className="mt-2 rounded-lg bg-[var(--neo-flat)] px-3 py-2">
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  Já guardados neste local: {itensNoLocal.length} item(ns)
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {itensNoLocal.slice(0, 5).join(", ")}
                  {itensNoLocal.length > 5 ? "…" : ""}
                </p>
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
                {loading ? "Salvando..." : emEdicao ? "Salvar Alterações" : "Salvar Produto"}
              </button>
            ) : (
              <p className="rounded-lg bg-[var(--neo-flat)] px-4 py-2 text-xs text-[var(--text-muted)]">
                {!formData.name.trim()
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
