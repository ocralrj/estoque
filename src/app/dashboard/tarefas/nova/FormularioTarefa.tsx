"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarTarefa } from "@/app/actions/tarefas";
import { Button } from "@/components/ui";
import { TAREFA_PRIORIDADE_LABELS } from "@/types/modules/tarefas";

interface Opcao {
  id: string;
  nome: string;
}

export default function FormularioTarefa({
  podeAtribuir,
  pessoas,
  grupos,
}: {
  podeAtribuir: boolean;
  pessoas: Opcao[];
  grupos: Opcao[];
}) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [prazo, setPrazo] = useState("");
  const [destino, setDestino] = useState<"ninguem" | "pessoa">("ninguem");
  const [assignedTo, setAssignedTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("titulo", titulo);
    formData.set("descricao", descricao);
    formData.set("prioridade", prioridade);
    if (prazo) formData.set("prazo", prazo);
    if (destino === "pessoa" && assignedTo) {
      formData.set("assigned_to", assignedTo);
    }

    const res = await criarTarefa(formData);

    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard/tarefas");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Nova Tarefa</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Registre um compromisso com prazo e responsável para acompanhar até o fim.
        </p>
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-[var(--erro-bg)] border border-[var(--neo-line)] rounded-lg text-[var(--erro-fg)] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Título *</label>
            <input
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              maxLength={120}
              required
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              placeholder="O que precisa ser feito"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Descrição</label>
            <textarea
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              rows={4}
              maxLength={4000}
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              placeholder='Detalhe o que envolve: contexto, o que já foi tentado e o que conta como "feito"'
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">Prioridade</label>
              <select
                value={prioridade}
                onChange={(event) => setPrioridade(event.target.value)}
                className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                {Object.entries(TAREFA_PRIORIDADE_LABELS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">
                Prazo <span className="font-normal text-[var(--text-muted)]">(opcional)</span>
              </label>
              <input
                type="date"
                value={prazo}
                onChange={(event) => setPrazo(event.target.value)}
                className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
          </div>

          {podeAtribuir && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                De quem é esta tarefa
              </label>

              {/* Pessoa ou grupo, como no protocolo: boa parte das tarefas é da
                  área — o DP, o Financeiro — e escolher um nome nesses casos
                  elege um responsável arbitrário que pode estar de férias. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                    ["ninguem", "Ninguém ainda", "Fica na fila"],
                    ["pessoa", "Uma pessoa", "Um responsável específico"],
                  ] as const
                  ).map(([valor, tituloOpcao, detalhe]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setDestino(valor)}
                    aria-pressed={destino === valor}
                    className={`rounded-2xl border p-3 text-left transition ${
                      destino === valor
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--neo-line)] bg-[var(--neo-flat)]"
                    }`}
                  >
                    <span className="block text-sm font-bold text-[var(--text)]">
                      {tituloOpcao}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {detalhe}
                    </span>
                  </button>
                ))}
              </div>

              {destino === "pessoa" && (
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                >
                  <option value="">Escolha a pessoa</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar Tarefa"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}