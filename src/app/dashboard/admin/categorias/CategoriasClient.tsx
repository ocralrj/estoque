"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarCategoria, atualizarCategoria, excluirCategoria } from "@/app/actions/categorias";
import Tooltip from "@/components/ui/Tooltip";
import { usePode } from "@/components/auth/Permissoes";
import { formatDate } from "@/lib/labels";
import { IconeEditar, IconeExcluir } from "@/components/ui/IconesAcao";
import { clsx } from "clsx";

type Categoria = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type Feedback = { kind: "ok" | "erro"; text: string } | null;

export default function CategoriasClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [editandoCategoria, setEditandoCategoria] = useState<Categoria | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
  });
  const pode = usePode();

  useEffect(() => {
    loadCategorias();
  }, []);

  async function loadCategorias() {
    try {
      const data = await fetch("/api/admin/categorias").then(res => res.json());
      setCategorias(data);
    } catch (err) {
      console.error("Erro ao carregar categorias:", err);
      setFeedback({ kind: "erro", text: "Falha ao carregar categorias" });
    }
  }

  function criar() {
    if (!form.name.trim()) {
      setFeedback({ kind: "erro", text: "Nome da categoria é obrigatório" });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("description", form.description);
      try {
        await criarCategoria(formData);
        setFeedback({ kind: "ok", text: "Categoria criada" });
        setForm({ name: "", description: "" });
        await loadCategorias();
      } catch (err: any) {
        setFeedback({ kind: "erro", text: err.message ?? "Erro ao criar categoria" });
      }
    });
  }

  async function atualizar(id: string) {
    if (!form.name.trim()) {
      setFeedback({ kind: "erro", text: "Nome da categoria é obrigatório" });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("description", form.description);
      try {
        await atualizarCategoria(id, formData);
        setFeedback({ kind: "ok", text: "Categoria atualizada" });
        setEditandoCategoria(null);
        setForm({ name: "", description: "" });
        await loadCategorias();
      } catch (err: any) {
        setFeedback({ kind: "erro", text: err.message ?? "Erro ao atualizar categoria" });
      }
    });
  }

  async function excluir(id: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await excluirCategoria(id);
        setFeedback({ kind: "ok", text: "Categoria excluída" });
        await loadCategorias();
      } catch (err: any) {
        setFeedback({ kind: "erro", text: err.message ?? "Erro ao excluir categoria" });
      }
    });
  }

  function iniciarEdicao(categoria: Categoria) {
    setEditandoCategoria(categoria);
    setForm({
      name: categoria.name,
      description: categoria.description ?? "",
    });
  }

  function cancelarEdicao() {
    setEditandoCategoria(null);
    setForm({ name: "", description: "" });
  }

  return (
    <>
      {feedback && (
        <div
          className={clsx(
            "px-4 py-3 rounded mb-4",
            feedback.kind === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          )}
        >
          {feedback.text}
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--text)]">Categorias</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Gerencie as categorias de produtos
        </p>
      </div>

      {/* Formulário de criação/edição */}
      <div className="bg-[var(--neo-bg)] p-4 rounded mb-6">
        {editandoCategoria ? (
          <h2 className="text-lg font-bold text-[var(--text)] mb-2">
            Editando categoria: {editandoCategoria.name}
          </h2>
        ) : (
          <h2 className="text-lg font-bold text-[var(--text)] mb-2">
            Nova categoria
          </h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Nome
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--stroke)] bg-[var(--surface)] rounded text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Descrição
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--stroke)] bg-[var(--surface)] rounded text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              rows={3}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end space-x-3">
          <button
            type="button"
            onClick={editandoCategoria ? cancelarEdicao : () => setForm({ name: "", description: "" })}
            className="px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            {editandoCategoria ? "Cancelar" : "Limpar"}
          </button>
          <button
            type="button"
            onClick={editandoCategoria ? () => atualizar(editandoCategoria.id) : criar}
            disabled={pending}
            className={clsx(
              "px-4 py-2 text-sm font-medium text-[var(--on-accent)] bg-[var(--primary)] rounded hover:bg-[var(--primary-strong)] disabled:opacity-50",
              pending && "cursor-not-allowed"
            )}
          >
            {editandoCategoria ? "Atualizar" : "Criar"}
          </button>
        </div>
      </div>

      {/* Tabela de categorias */}
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-[var(--neo-line)]">
          <thead className="bg-[var(--neo-flat)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                Nome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                Descrição
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                Criado em
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((categoria) => (
              <tr key={categoria.id} className="hover:bg-[var(--neo-flat)]">
                <td className="px-4 py-3 text-left">
                  {categoria.name}
                </td>
                <td className="px-4 py-3 text-left">
                  {categoria.description ?? "-"}
                </td>
                <td className="px-4 py-3 text-left text-sm text-[var(--text-muted)]">
                  {formatDate(categoria.created_at)}
                </td>
                <td className="px-4 py-3 text-left space-x-2">
                  {pode("admin", "categories", "update") && (
                    <Tooltip
                      texto="Editar categoria"
                    >
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(categoria)}
                        className="p-1 rounded hover:bg-[var(--neo-flat)] text-[var(--text)]"
                      >
                        <IconeEditar />
                      </button>
                    </Tooltip>
                  )}
                  {pode("admin", "categories", "delete") && (
                    <Tooltip
                      texto="Excluir categoria"
                    >
                      <button
                        type="button"
                        onClick={() => excluir(categoria.id)}
                        className="p-1 rounded hover:bg-[var(--neo-flat)] text-[var(--text)]"
                      >
                        <IconeExcluir />
                      </button>
                    </Tooltip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}