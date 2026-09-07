"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Lado = "direita" | "esquerda" | "cima" | "baixo";

/**
 * Dica em texto para um controle.
 *
 * Usa posição fixa calculada no momento de abrir, e não `absolute`: os lugares
 * onde a dica mais faz falta — a sidebar recolhida, uma célula de tabela — têm
 * `overflow` que cortaria um elemento posicionado por dentro.
 *
 * Abre no foco além do ponteiro, para quem navega por teclado, e fecha no Esc.
 * O `title` nativo é deliberadamente evitado: demora cerca de um segundo, não
 * responde ao teclado e não é estilizável.
 */
export default function Tooltip({
  texto,
  lado = "direita",
  className = "inline-flex",
  children,
}: {
  texto: string;
  lado?: Lado;
  /**
   * Forma do invólucro. O padrão `inline-flex` serve para dicas em botões e
   * ícones no meio de um texto, mas envolver um item de lista com ele o tira
   * do fluxo em bloco — é o que fazia o menu lateral quebrar em duas colunas.
   * Quem envolve um elemento de bloco passa `block w-full`.
   */
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const alvoRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const fechar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null);
  }, []);

  const abrir = useCallback(
    (imediato = false) => {
      const mostrar = () => {
        const r = alvoRef.current?.getBoundingClientRect();
        if (!r) return;
        const folga = 10;
        const coords = {
          direita: { top: r.top + r.height / 2, left: r.right + folga },
          esquerda: { top: r.top + r.height / 2, left: r.left - folga },
          cima: { top: r.top - folga, left: r.left + r.width / 2 },
          baixo: { top: r.bottom + folga, left: r.left + r.width / 2 },
        }[lado];
        setPos(coords);
      };

      if (imediato) mostrar();
      else timerRef.current = setTimeout(mostrar, 350);
    },
    [lado]
  );

  useEffect(() => {
    if (!pos) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    // Rolar ou redimensionar invalida a posição calculada.
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [pos, fechar]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const deslocamento = {
    direita: "translate(0, -50%)",
    esquerda: "translate(-100%, -50%)",
    cima: "translate(-50%, -100%)",
    baixo: "translate(-50%, 0)",
  }[lado];

  return (
    <>
      <span
        ref={alvoRef}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={() => abrir()}
        onMouseLeave={fechar}
        onFocus={() => abrir(true)}
        onBlur={fechar}
        className={className}
      >
        {children}
      </span>

      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{ top: pos.top, left: pos.left, transform: deslocamento }}
          className="pointer-events-none fixed z-[60] max-w-[16rem] rounded-lg border border-[var(--neo-line)] bg-[var(--neo-flat)] px-2.5 py-1.5 text-xs font-medium leading-snug text-[var(--text)] shadow-lg"
        >
          {texto}
        </span>
      )}
    </>
  );
}
