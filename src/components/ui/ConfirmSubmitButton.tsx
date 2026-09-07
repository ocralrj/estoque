"use client";

import { ButtonHTMLAttributes, ReactNode, useRef } from "react";
import { useConfirmacao } from "./Confirmacao";

interface ConfirmSubmitButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pergunta exibida antes de enviar o formulário. */
  message: string;
  /** Verbo do botão de confirmação. "Confirmar" quando não informado. */
  confirmLabel?: string;
  /** Ação destrutiva: o botão de confirmar vem na cor de perigo. */
  danger?: boolean;
  children: ReactNode;
}

/**
 * Botão de submit com confirmação. Existe porque handlers de evento não podem
 * ser declarados dentro de Server Components — passá-los quebra a renderização.
 *
 * A confirmação usa o diálogo do sistema, e não o `window.confirm`. Como aquele
 * é síncrono e este não, o clique é interrompido e o formulário é enviado por
 * `requestSubmit()` depois da resposta — que é o que preserva a validação nativa
 * dos campos, coisa que um `form.submit()` puro descartaria.
 */
export default function ConfirmSubmitButton({
  message,
  confirmLabel,
  danger = true,
  children,
  ...props
}: ConfirmSubmitButtonProps) {
  const { confirmar, Dialogo } = useConfirmacao();
  const botaoRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        {...props}
        ref={botaoRef}
        type="submit"
        onClick={async (event) => {
          event.preventDefault();
          const [titulo, ...resto] = message.split("\n\n");
          const ok = await confirmar({
            titulo,
            mensagem: resto.join("\n\n") || undefined,
            rotuloConfirmar: confirmLabel ?? "Confirmar",
            perigo: danger,
          });
          if (ok) botaoRef.current?.form?.requestSubmit();
        }}
      >
        {children}
      </button>
      <Dialogo />
    </>
  );
}
