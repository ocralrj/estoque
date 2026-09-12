"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aprovarPedido,
  excluirPedidoRecusado,
  recusarPedido,
  type PedidoDeAcesso,
} from "@/app/actions/acessos";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { IconeExcluir } from "@/components/ui/IconesAcao";
import { formatDateTime } from "@/lib/labels";

/**
 * A fila de quem pediu acesso.
 *
 * Aprovar cria a conta e devolve a senha provisória aqui, na tela — o sistema
 * não tem provedor de e-mail, então quem aprova repassa. A senha vale uma vez:
 * a conta nasce obrigada a trocá-la no primeiro acesso.
 *
 * `podeExcluirRecusados` só esconde o botão; quem barra a exclusão de fato é a
 * Server Action e a política de DELETE da migração 041.
 */
export default function PedidosClient({
  inicial,
  podeExcluirRecusados = false,
}: {
  inicial: PedidoDeAcesso[];
  podeExcluirRecusados?: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { confirmar, Dialogo } = useConfirmacao();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const pendentes = inicial.filter((p) => p.status === "pendente");
  const decididos = inicial.filter((p) => p.status !== "pendente");

  async function excluir(p: PedidoDeAcesso) {
    const ok = await confirmar({
      titulo: "Excluir solicitação recusada?",
      mensagem:
        "Esta ação removerá o cadastro recusado e permitirá que esta pessoa faça uma nova solicitação utilizando o mesmo e-mail.",
      rotuloConfirmar: "Excluir",
      rotuloCancelar: "Cancelar",
      perigo: true,
    });
    if (!ok) return;

    setAviso(null);
    iniciar(async () => {
      const res = await excluirPedidoRecusado(p.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({
        tipo: "ok",
        texto: `Solicitação recusada de ${p.nome} excluída. ${p.email} já pode pedir acesso novamente.`,
      });
      router.refresh();
    });
  }

  function aprovar(p: PedidoDeAcesso) {
    setAviso(null);
    iniciar(async () => {
      const res = await aprovarPedido(p.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({
        tipo: "ok",
        texto: `Conta criada para ${res.data.email}. Senha provisória: ${res.data.senha} — repasse a ${p.nome}, que será obrigado a trocá-la no primeiro acesso.`,
      });
      router.refresh();
    });
  }

  function recusar(id: string) {
    setAviso(null);
    iniciar(async () => {
      const res = await recusarPedido(id, motivo);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setRecusando(null);
      setMotivo("");
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

      <section className="neo-card p-5">
        <h2 className="text-lg font-bold text-[var(--text)]">
          {pendentes.length === 0
            ? "Nenhum pedido esperando"
            : `${pendentes.length} pedido(s) esperando decisão`}
        </h2>

        <ul className="mt-4 space-y-3">
          {pendentes.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nome={p.nome} email={p.email} tamanho={40} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">{p.nome}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{p.email}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {p.departamento} · {formatDateTime(p.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: `Aprovar o acesso de ${p.nome}?`,
                        mensagem:
                          "A conta é criada com uma senha provisória, que aparece aqui para você repassar. Ela vale uma vez: a pessoa é obrigada a trocá-la no primeiro acesso.",
                        rotuloConfirmar: "Aprovar e criar conta",
                      });
                      if (ok) aprovar(p);
                    }}
                    className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--on-accent)] disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => {
                      setRecusando(recusando === p.id ? null : p.id);
                      setMotivo("");
                    }}
                    className="neo-button rounded-full px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-50"
                  >
                    Recusar
                  </button>
                </div>
              </div>

              {p.mensagem && (
                <p className="mt-3 rounded-xl bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--muted)]">
                  {p.mensagem}
                </p>
              )}

              {recusando === p.id && (
                <div className="mt-3 border-t border-[var(--stroke)] pt-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Motivo da recusa
                  </label>
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    autoFocus
                    placeholder="Fica registrado, para consulta depois"
                    className="mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => recusar(p.id)}
                      className="rounded-full bg-[var(--danger)] px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-50"
                    >
                      Confirmar recusa
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecusando(null)}
                      className="text-xs font-semibold text-[var(--muted)] hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}

          {pendentes.length === 0 && (
            <li className="rounded-2xl border border-dashed border-[var(--stroke)] p-6 text-center text-sm text-[var(--muted)]">
              Pedidos feitos na tela de acesso aparecem aqui, para quem responde
              pelo departamento decidir.
            </li>
          )}
        </ul>
      </section>

      {decididos.length > 0 && (
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)]">Já decididos</h2>
          <ul className="mt-3 space-y-2">
            {decididos.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--stroke)] px-4 py-2.5 text-sm"
              >
                <span className="text-[var(--text)]">
                  {p.nome}{" "}
                  <span className="text-[var(--muted)]">· {p.departamento}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={
                      p.status === "aprovado"
                        ? "neo-sit neo-sit--ok"
                        : "neo-sit neo-sit--erro"
                    }
                  >
                    {p.status === "aprovado" ? "Aprovado" : "Recusado"}
                  </span>
                  {podeExcluirRecusados && p.status === "recusado" && (
                    <Tooltip
                      lado="cima"
                      texto={`Excluir a solicitação recusada de ${p.nome} — libera o e-mail para um novo pedido`}
                    >
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => excluir(p)}
                        aria-label={`Excluir a solicitação recusada de ${p.nome}`}
                        className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--erro-fg)] disabled:opacity-50"
                      >
                        <IconeExcluir />
                      </button>
                    </Tooltip>
                  )}
                </span>
                {p.motivo_recusa && (
                  <span className="w-full text-xs text-[var(--muted)]">
                    Motivo: {p.motivo_recusa}
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
