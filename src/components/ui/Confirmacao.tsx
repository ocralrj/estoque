"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PedidoDeConfirmacao {
  titulo: string;
  /** O que acontece se confirmar. Uma frase, no que a pessoa vai perceber. */
  mensagem?: string;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  /** Ação destrutiva: o botão de confirmar vem na cor de perigo. */
  perigo?: boolean;
}

/**
 * Confirmação no visual do sistema, no lugar do `window.confirm`.
 *
 * O alerta nativo do navegador não é só feio: ele mostra o endereço do site
 * antes da pergunta ("ocral.vercel.app diz"), não respeita o tema escuro, não
 * permite destacar a ação destrutiva e coloca "OK" onde deveria estar o verbo
 * do que vai acontecer. Numa confirmação de exclusão, ler "OK" e ler "Excluir"
 * levam a decisões diferentes.
 *
 * A API é uma promessa, para o chamador continuar escrito como estava:
 *
 *   if (!(await confirmar({ titulo: "Excluir?" }))) return;
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<PedidoDeConfirmacao | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  const confirmar = useCallback((p: PedidoDeConfirmacao) => {
    setPedido(p);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  }, []);

  useEffect(() => {
    if (!pedido) return;
    // O foco vai para o botão de ação: quem confirma com o teclado não precisa
    // caçar o botão, e Esc continua cancelando.
    botaoRef.current?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") responder(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pedido, responder]);

  const Dialogo = useCallback(() => {
    if (!pedido) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmacao-titulo"
        onClick={() => responder(false)}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="neo-card w-full max-w-sm p-6"
        >
          <h2
            id="confirmacao-titulo"
            className="text-lg font-bold text-[var(--text)]"
          >
            {pedido.titulo}
          </h2>

          {pedido.mensagem && (
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted)]">
              {pedido.mensagem}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => responder(false)}
              className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
            >
              {pedido.rotuloCancelar ?? "Cancelar"}
            </button>

            {/* O rótulo diz o que vai acontecer, e não "OK": ler "Excluir" e
                ler "OK" leva a decisões diferentes na hora de confirmar. */}
            <button
              ref={botaoRef}
              type="button"
              onClick={() => responder(true)}
              className={`rounded-full px-5 py-2.5 text-sm font-bold ${
                pedido.perigo
                  ? "bg-[var(--danger)] text-[var(--text)]"
                  : "bg-[var(--primary)] text-[var(--on-accent)]"
              }`}
            >
              {pedido.rotuloConfirmar ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    );
  }, [pedido, responder]);

  return { confirmar, Dialogo };
}
