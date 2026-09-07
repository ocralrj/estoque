"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atenderPedido,
  cancelarPedido,
  criarPedido,
  type PedidoDeMaterial,
} from "@/app/actions/pedidos";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import Avatar from "@/components/ui/Avatar";
import { formatDateTime } from "@/lib/labels";

interface Produto {
  id: string;
  name: string;
  code: string;
  unit: string;
  quantity_current: number;
}

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  aberto: { texto: "Aguardando", classe: "neo-sit neo-sit--info" },
  atendido: { texto: "Atendido", classe: "neo-sit neo-sit--ok" },
  parcial: { texto: "Atendido em parte", classe: "neo-sit neo-sit--aviso" },
  recusado: { texto: "Não atendido", classe: "neo-sit neo-sit--erro" },
  cancelado: { texto: "Cancelado", classe: "neo-sit neo-sit--erro" },
};

/**
 * Pedidos de material.
 *
 * Quem precisa registra o que quer, sem tocar no estoque. Quem cuida do
 * almoxarifado atende — e é o atendimento que gera a saída, com a quantidade
 * realmente entregue. Antes disto, quem retirava dava a própria baixa, e o
 * saldo refletia o que alguém lembrou de registrar.
 */
export default function PedidosClient({
  pedidos,
  produtos,
  meuId,
  podeAtender,
  podePedir,
}: {
  pedidos: PedidoDeMaterial[];
  produtos: Produto[];
  meuId: string;
  podeAtender: boolean;
  podePedir: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { confirmar, Dialogo } = useConfirmacao();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [abrindo, setAbrindo] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [itens, setItens] = useState<{ productId: string; quantidade: string }[]>([
    { productId: "", quantidade: "" },
  ]);

  const [atendendo, setAtendendo] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState("");

  const abertos = pedidos.filter((p) => p.status === "aberto");
  const encerrados = pedidos.filter((p) => p.status !== "aberto");

  function enviarPedido() {
    setAviso(null);
    iniciar(async () => {
      const res = await criarPedido({
        justificativa,
        itens: itens
          .filter((i) => i.productId && Number(i.quantidade) > 0)
          .map((i) => ({ productId: i.productId, quantidade: Number(i.quantidade) })),
      });

      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }

      setAbrindo(false);
      setJustificativa("");
      setItens([{ productId: "", quantidade: "" }]);
      setAviso({
        tipo: "ok",
        texto: `Pedido ${res.data.numero} aberto. Quem cuida do almoxarifado foi avisado.`,
      });
      router.refresh();
    });
  }

  function atender(p: PedidoDeMaterial) {
    setAviso(null);
    iniciar(async () => {
      const numeros: Record<string, number> = {};
      for (const item of p.itens ?? []) {
        numeros[item.product_id] = Number(entregas[item.id] ?? 0);
      }

      const res = await atenderPedido(p.id, numeros, observacao);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }

      setAtendendo(null);
      setEntregas({});
      setObservacao("");
      setAviso({
        tipo: "ok",
        texto:
          res.data.situacao === "recusado"
            ? "Pedido marcado como não atendido. Quem pediu foi avisado."
            : "Entrega registrada e estoque baixado. Quem pediu foi avisado.",
      });
      router.refresh();
    });
  }

  async function cancelar(p: PedidoDeMaterial) {
    const ok = await confirmar({
      titulo: `Cancelar o pedido ${p.numero}?`,
      mensagem: "Ele sai da fila do almoxarifado. Nada foi retirado do estoque ainda.",
      rotuloConfirmar: "Cancelar pedido",
      perigo: true,
    });
    if (!ok) return;

    iniciar(async () => {
      const res = await cancelarPedido(p.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      router.refresh();
    });
  }

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

      {podePedir && (
        <section className="neo-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Pedir material</h2>
              <p className="text-sm text-[var(--muted)]">
                O pedido não retira nada do estoque. Quem cuida do almoxarifado
                entrega e dá a baixa.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAbrindo((a) => !a)}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              {abrindo ? "Cancelar" : "Novo pedido"}
            </button>
          </div>

          {abrindo && (
            <div className="mt-4 space-y-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
              {itens.map((item, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <label className={rotulo}>Produto</label>
                    <select
                      value={item.productId}
                      onChange={(e) => {
                        const copia = [...itens];
                        copia[i] = { ...copia[i], productId: e.target.value };
                        setItens(copia);
                      }}
                      className={campo}
                    >
                      <option value="">Escolha o produto</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name} ({p.quantity_current} {p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-28">
                    <label className={rotulo}>Quantidade</label>
                    <input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => {
                        const copia = [...itens];
                        copia[i] = { ...copia[i], quantidade: e.target.value };
                        setItens(copia);
                      }}
                      className={campo}
                    />
                  </div>

                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItens(itens.filter((_, x) => x !== i))}
                      className="pb-2 text-xs font-semibold text-[var(--erro-fg)] hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => setItens([...itens, { productId: "", quantidade: "" }])}
                className="text-sm font-semibold text-[var(--primary)] hover:underline"
              >
                + Outro item
              </button>

              <div>
                <label className={rotulo}>Para quê</label>
                <input
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Ajuda quem atende a priorizar — opcional"
                  className={campo}
                />
              </div>

              <button
                type="button"
                onClick={enviarPedido}
                disabled={pendente}
                className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
              >
                {pendente ? "Abrindo…" : "Abrir pedido"}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="neo-card p-5">
        <h2 className="text-lg font-bold text-[var(--text)]">
          {abertos.length === 0
            ? "Nenhum pedido esperando"
            : `${abertos.length} pedido(s) esperando`}
        </h2>

        <ul className="mt-4 space-y-3">
          {abertos.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    nome={p.solicitante?.full_name}
                    email={p.solicitante?.email}
                    url={p.solicitante?.avatar_url}
                    tamanho={40}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[var(--muted)]">{p.numero}</p>
                    <p className="font-semibold text-[var(--text)]">
                      {p.solicitante?.full_name || p.solicitante?.email}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {p.departamento ?? "sem departamento"} ·{" "}
                      {formatDateTime(p.created_at)}
                    </p>
                  </div>
                </div>
                <span className={SITUACAO[p.status].classe}>
                  {SITUACAO[p.status].texto}
                </span>
              </div>

              {p.justificativa && (
                <p className="mt-2 rounded-xl bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--muted)]">
                  {p.justificativa}
                </p>
              )}

              <ul className="mt-3 space-y-1">
                {(p.itens ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-[var(--text)]">
                      {item.produto?.name ?? "produto"}{" "}
                      <span className="text-[var(--muted)]">
                        — pedido: {item.quantidade} {item.produto?.unit}
                      </span>
                    </span>
                    <span
                      className={`text-xs ${
                        (item.produto?.quantity_current ?? 0) < item.quantidade
                          ? "font-bold text-[var(--erro-fg)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      em estoque: {item.produto?.quantity_current ?? 0}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--stroke)] pt-3">
                {podeAtender && (
                  <button
                    type="button"
                    onClick={() => {
                      setAtendendo(atendendo === p.id ? null : p.id);
                      // A entrega já vem preenchida com o que foi pedido: o caso
                      // comum é entregar tudo, e ajustar é a exceção.
                      const inicial: Record<string, string> = {};
                      for (const i of p.itens ?? []) {
                        inicial[i.id] = String(
                          Math.min(i.quantidade, i.produto?.quantity_current ?? 0)
                        );
                      }
                      setEntregas(inicial);
                      setObservacao("");
                    }}
                    className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--on-accent)]"
                  >
                    {atendendo === p.id ? "Fechar" : "Atender"}
                  </button>
                )}

                {p.solicitante_id === meuId && (
                  <button
                    type="button"
                    onClick={() => cancelar(p)}
                    disabled={pendente}
                    className="text-xs font-semibold text-[var(--muted)] hover:underline disabled:opacity-50"
                  >
                    Cancelar meu pedido
                  </button>
                )}
              </div>

              {atendendo === p.id && podeAtender && (
                <div className="mt-3 space-y-3 rounded-2xl bg-[var(--neo-bg)] p-3">
                  <p className="text-xs text-[var(--muted)]">
                    Informe o que está entregando. Menos do que foi pedido marca o
                    pedido como atendido em parte; zero em tudo marca como não
                    atendido.
                  </p>

                  {(p.itens ?? []).map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[10rem] flex-1 text-sm text-[var(--text)]">
                        {item.produto?.name}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={item.quantidade}
                        value={entregas[item.id] ?? "0"}
                        onChange={(e) =>
                          setEntregas({ ...entregas, [item.id]: e.target.value })
                        }
                        className="w-24 rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)]"
                      />
                      <span className="text-xs text-[var(--muted)]">
                        de {item.quantidade}
                      </span>
                    </div>
                  ))}

                  <input
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Observação para quem pediu — opcional"
                    className={campo}
                  />

                  <button
                    type="button"
                    onClick={() => atender(p)}
                    disabled={pendente}
                    className="rounded-full bg-[var(--ok-solid)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {pendente ? "Registrando…" : "Registrar entrega e baixar estoque"}
                  </button>
                </div>
              )}
            </li>
          ))}

          {abertos.length === 0 && (
            <li className="rounded-2xl border border-dashed border-[var(--stroke)] p-6 text-center text-sm text-[var(--muted)]">
              Sem pedidos na fila.
            </li>
          )}
        </ul>
      </section>

      {encerrados.length > 0 && (
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)]">Já resolvidos</h2>
          <ul className="mt-3 space-y-2">
            {encerrados.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--stroke)] px-4 py-2.5 text-sm"
              >
                <span className="text-[var(--text)]">
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {p.numero}
                  </span>{" "}
                  {p.solicitante?.full_name || p.solicitante?.email}
                  {p.atendido_em && (
                    <span className="text-[var(--muted)]">
                      {" "}
                      · {formatDateTime(p.atendido_em)}
                    </span>
                  )}
                </span>
                <span className={SITUACAO[p.status].classe}>
                  {SITUACAO[p.status].texto}
                </span>
                {p.observacao_atendimento && (
                  <span className="w-full text-xs text-[var(--muted)]">
                    {p.observacao_atendimento}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
