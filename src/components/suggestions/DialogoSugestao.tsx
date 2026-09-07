"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  marcarSugestaoAtendida,
  responderSugestao,
} from "@/app/actions/suggestions";
import Avatar from "@/components/ui/Avatar";
import { formatDateTime } from "@/lib/labels";
import type { MensagemDaSugestao } from "@/types/modules/suggestions";

/**
 * A conversa sobre uma sugestão.
 *
 * Antes a resposta da equipe vivia num campo único que cada nova resposta
 * sobrescrevia: depois de três voltas não restava registro do que tinha sido
 * dito, e o autor não tinha como responder — o assunto saía do sistema e ia
 * para o corredor.
 *
 * Aqui cada fala fica, com quem disse e quando. E quem encerra é quem pediu:
 * dar por resolvido o pedido de outra pessoa é decidir por ela.
 */
export default function DialogoSugestao({
  sugestaoId,
  mensagens,
  souOAutor,
  encerrada,
  atendidaEm,
}: {
  sugestaoId: string;
  mensagens: MensagemDaSugestao[];
  souOAutor: boolean;
  encerrada: boolean;
  atendidaEm?: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");

  function enviar() {
    if (!texto.trim()) return;
    setErro("");
    iniciar(async () => {
      const res = await responderSugestao(sugestaoId, texto.trim());
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      setTexto("");
      router.refresh();
    });
  }

  function encerrar() {
    if (
      !window.confirm(
        "Dar esta sugestão por atendida?\n\nEla sai da fila da equipe e é descartada 30 dias depois. Se o assunto ainda não resolveu, responda em vez de encerrar."
      )
    ) {
      return;
    }
    setErro("");
    iniciar(async () => {
      const res = await marcarSugestaoAtendida(sugestaoId);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-[var(--neo-line)] pt-4">
      {mensagens.length > 0 && (
        <ul className="mb-4 space-y-3">
          {mensagens.map((m) => (
            <li
              key={m.id}
              className={`flex gap-3 ${m.da_gestao ? "" : "flex-row-reverse"}`}
            >
              <Avatar
                nome={m.autor?.full_name}
                email={m.autor?.email}
                url={m.autor?.avatar_url}
                tamanho={32}
              />
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.da_gestao
                    ? "bg-[var(--aviso-bg)] text-[var(--text)]"
                    : "bg-[var(--primary-soft)] text-[var(--text)]"
                }`}
              >
                <p className="text-xs font-bold text-[var(--muted)]">
                  {m.da_gestao ? "Equipe" : "Você"}
                  {m.autor?.full_name ? ` · ${m.autor.full_name}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.texto}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {formatDateTime(m.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {encerrada ? (
        <p className="rounded-2xl bg-[var(--ok-bg)] px-4 py-3 text-sm text-[var(--ok-fg)]">
          Você deu esta sugestão por atendida
          {atendidaEm ? ` em ${formatDateTime(atendidaEm)}` : ""}. Ela será
          descartada 30 dias depois disso.
        </p>
      ) : (
        <>
          <label
            htmlFor={`resposta-${sugestaoId}`}
            className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
          >
            Continuar a conversa
          </label>
          <textarea
            id={`resposta-${sugestaoId}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Falta algo? A resposta não resolveu? Escreva aqui."
            className="mt-1 w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]"
          />

          {erro && (
            <p className="mt-2 rounded-lg bg-[var(--erro-bg)] px-3 py-2 text-xs text-[var(--erro-fg)]">
              {erro}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={pendente || !texto.trim()}
              className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--on-accent)] disabled:opacity-50"
            >
              {pendente ? "Enviando…" : "Responder"}
            </button>

            {souOAutor && (
              <button
                type="button"
                onClick={encerrar}
                disabled={pendente}
                className="rounded-full bg-[var(--ok-solid)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Marcar como atendida
              </button>
            )}

            {souOAutor && (
              <span className="text-[11px] text-[var(--muted)]">
                Encerrar tira da fila da equipe.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
