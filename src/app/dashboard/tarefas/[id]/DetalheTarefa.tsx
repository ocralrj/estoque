"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarTarefa,
  excluirTarefa,
  mudarStatusTarefa,
} from "@/app/actions/tarefas";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { Button } from "@/components/ui";
import Tooltip from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/labels";
import {
  tarefaAtrasada,
  tarefaPrioridadeClass,
  tarefaPrioridadeLabel,
  tarefaStatusClass,
  tarefaStatusLabel,
  TAREFA_PRIORIDADE_LABELS,
  TAREFA_STATUS_LABELS,
  type Tarefa,
  type TarefaPrioridade,
  type TarefaStatus,
} from "@/types/modules/tarefas";

export interface Nomeacao {
  id: string;
  nome: string;
}

/**
 * Detalhe e movimentação de uma tarefa.
 *
 * Como em PedidosClient, o botão não mente: quem não participa não vê edição
 * nem situação, mas a recusa de verdade é da Server Action e do RLS — este
 * componente só esconde o que `permitido` diz.
 */
export default function DetalheTarefa({
  tarefa,
  podeAtribuir,
  coordena,
  participa,
  pessoas,
}: {
  tarefa: Tarefa;
  podeAtribuir: boolean;
  coordena: boolean;
  participa: boolean;
  pessoas: Nomeacao[];
}) {
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [editando, setEditando] = useState(false);

  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao ?? "");
  const [prioridade, setPrioridade] = useState<TarefaPrioridade>(tarefa.prioridade);
  const [prazo, setPrazo] = useState(tarefa.prazo ?? "");
  const [destino, setDestino] = useState<"ninguem" | "pessoa">(() =>
    tarefa.assigned_to ? "pessoa" : "ninguem"
  );
  const [assignedTo, setAssignedTo] = useState(tarefa.assigned_to ?? "");

  const atrasada = tarefaAtrasada(tarefa);

  function mover(proximo: TarefaStatus) {
    setAviso(null);
    iniciar(async () => {
      const res = await mudarStatusTarefa(tarefa.id, proximo);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      router.refresh();
    });
  }

  function excluir() {
    setAviso(null);
    iniciar(async () => {
      const res = await excluirTarefa(tarefa.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      router.push("/dashboard/tarefas");
    });
  }

  async function pedirExclusao() {
    const ok = await confirmar({
      titulo: "Excluir tarefa?",
      mensagem:
        "A tarefa será removida de todas as listas. Quem precisava dela perde o registro — o caminho comum é cancelar, que deixa rastro.",
      rotuloConfirmar: "Excluir",
      rotuloCancelar: "Voltar",
      perigo: true,
    });
    if (ok) excluir();
  }

  function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAviso(null);

    const formData = new FormData();
    formData.set("titulo", titulo);
    formData.set("descricao", descricao);
    formData.set("prioridade", prioridade);
    if (prazo) formData.set("prazo", prazo);
    if (destino === "pessoa" && assignedTo) {
      formData.set("assigned_to", assignedTo);
    }

    iniciar(async () => {
      const res = await atualizarTarefa(tarefa.id, formData);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: "Alterações salvas." });
      setEditando(false);
      router.refresh();
    });
  }

  async function mudarComConfirmacao(
    proximo: TarefaStatus,
    titulo: string,
    mensagem: string
  ) {
    const ok = await confirmar({
      titulo,
      mensagem,
      rotuloConfirmar: "Confirmar",
      rotuloCancelar: "Voltar",
      perigo: proximo === "cancelada",
    });
    if (ok) mover(proximo);
  }

  function moverStatusClique(
    e: React.SyntheticEvent,
    proximo: TarefaStatus,
    precisaConfirmar = false
  ) {
    e.preventDefault();
    if (precisaConfirmar) {
      const titulo = proximo === "cancelada" ? "Cancelar tarefa?" : "Reabrir tarefa?";
      const mensagem =
        proximo === "cancelada"
          ? "A tarefa sai das listas de pendências, com o rastro de quem cancelou e quando."
          : "A tarefa volta para em andamento, para uma nova tentativa.";
      void mudarComConfirmacao(proximo, titulo, mensagem);
    } else {
      mover(proximo);
    }
  }

  /** Transições com um só clique, sem confirmação — o caminho comum. */
  const AUTO: Partial<
    Record<TarefaStatus, { rotulo: string; proximo: TarefaStatus }>
  > = {
    aguardando: { rotulo: TAREFA_STATUS_LABELS.em_andamento, proximo: "em_andamento" },
    em_andamento: { rotulo: TAREFA_STATUS_LABELS.concluida, proximo: "concluida" },
  };
  const auto = AUTO[tarefa.status];

  return (
    <div className="space-y-6">
      <Dialogo />

      {aviso && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Tarefa</p>
          <h1 className="text-2xl font-bold text-[var(--text)]">{tarefa.codigo}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{tarefa.titulo}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/dashboard/tarefas")}
          >
            Voltar
          </Button>
          {coordena && (
            <Button type="button" variant="danger" onClick={pedirExclusao}>
              Excluir
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">Situação</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Situação</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tarefaStatusClass(tarefa.status)}`}>
                {tarefaStatusLabel(tarefa.status)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Prioridade</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tarefaPrioridadeClass(tarefa.prioridade)}`}>
                {tarefaPrioridadeLabel(tarefa.prioridade)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Prazo</span>
              <span
                className={`text-sm font-semibold ${
                  atrasada ? "text-[var(--erro-fg)]" : "text-[var(--text)]"
                }`}
              >
                {tarefa.prazo ? formatDate(tarefa.prazo) : "Sem prazo"}
                {atrasada && " · atrasada"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Aberta por</span>
              <span className="text-sm font-medium text-[var(--text)]">
                {tarefa.criada_por?.full_name || tarefa.criada_por?.email || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Responsável</span>
              <span className="text-sm font-medium text-[var(--text)]">
                {tarefa.executor?.full_name ||
                  tarefa.executor?.email ||
                  "Não atribuída"}
              </span>
            </div>
            {tarefa.concluida_por && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Concluída por</span>
                <span className="text-sm font-medium text-[var(--text)]">
                  {tarefa.concluida_por?.full_name || tarefa.concluida_por?.email}{" "}
                  {tarefa.concluida_em && `· ${formatDate(tarefa.concluida_em)}`}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">Descrição</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
            {tarefa.descricao || "Sem descrição."}
          </p>
        </section>
      </div>

      {participa && (
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)] mb-4">Mover situação</h2>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {auto && (
              <button
                type="button"
                className="neo-soft rounded-2xl px-4 py-2 text-sm font-bold text-[var(--text)] hover:translate-y-[-1px] transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={pendente}
                onClick={(e) => {
                  e.preventDefault();
                  mover(auto.proximo);
                }}
              >
                {auto.rotulo}
              </button>
            )}
            {tarefa.status === "concluida" && (
              <button
                type="button"
                onClick={(e) => moverStatusClique(e, "em_andamento", true)}
                className="neo-soft rounded-2xl px-4 py-2 text-sm font-bold text-[var(--text)] hover:translate-y-[-1px] transition disabled:opacity-50"
                disabled={pendente}
              >
                Reabrir
              </button>
            )}
            {tarefa.status !== "cancelada" && tarefa.status !== "concluida" && (
              <button
                type="button"
                onClick={(e) => moverStatusClique(e, "cancelada", true)}
                className="rounded-2xl px-4 py-2 text-sm font-semibold text-[var(--erro-fg)] border border-[var(--neo-line)] hover:brightness-95 transition disabled:opacity-50"
                disabled={pendente}
              >
                Cancelar
              </button>
            )}
          </div>
        </section>
      )}

      {participa && (
        <section className="neo-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text)]">Editar tarefa</h2>
            {editando && (
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="text-xs font-semibold text-[var(--text-muted)] hover:underline"
              >
                Fechar
              </button>
            )}
          </div>

          {!editando ? (
            <Button type="button" variant="secondary" onClick={() => setEditando(true)}>
              Editar campos
            </Button>
          ) : (
            <form onSubmit={salvar} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-2">Título *</label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  maxLength={120}
                  required
                  className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-2">Descrição</label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-2">Prioridade</label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value as TarefaPrioridade)}
                    className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                  >
                    {Object.entries(TAREFA_PRIORIDADE_LABELS).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-2">Prazo</label>
                  <input
                    type="date"
                    value={prazo}
                    onChange={(e) => setPrazo(e.target.value)}
                    className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                  />
                </div>
              </div>

              {podeAtribuir && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                    De quem é esta tarefa
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["ninguem", "Ninguém", "Fica na fila"],
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
                        <span className="block text-sm font-bold text-[var(--text)]">{tituloOpcao}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{detalhe}</span>
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

              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={pendente}>
                  {pendente ? "Salvando..." : "Salvar alterações"}
                </Button>
                <Tooltip texto="Campos de texto e prazo. Para mudar a situação, use os botões acima.">
                  <span className="inline-flex self-center text-xs text-[var(--text-muted)]">
                    A situação se move pelos botões, não aqui.
                  </span>
                </Tooltip>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}