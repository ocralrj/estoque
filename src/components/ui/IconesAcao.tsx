/**
 * Ícones das ações em tabela.
 *
 * Numa coluna de ações, o texto repetido em cada linha — "Editar", "Tornar
 * super admin" — soma mais ruído do que informação: são sempre as mesmas
 * palavras, e o que muda é a linha. O ícone identifica a ação e devolve o
 * espaço ao conteúdo.
 *
 * Todo ícone aqui vai acompanhado de `aria-label` e dica no botão que o usa:
 * ícone sozinho é adivinhação para quem não o reconhece, e nada para quem usa
 * leitor de tela.
 */

export function IconeEditar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

/**
 * Escudo com "S", para a promoção a super admin.
 *
 * O escudo é desenhado aqui, e não trazido de uma biblioteca de marcas: o que
 * se quer é a ideia de "poder máximo" que a figura evoca, sem usar o símbolo
 * registrado de ninguém.
 */
export function IconeSuperAdmin({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Escudo */}
      <path d="M12 2.5 4.5 5.2v6.1c0 4.6 3.1 8.1 7.5 10.2 4.4-2.1 7.5-5.6 7.5-10.2V5.2L12 2.5Z" />
      {/* S estilizado, em uma linha só para não virar borrão no tamanho pequeno */}
      <path d="M14.6 8.4c-1.6-.9-3.6-.7-4.4.5-.8 1.2.3 2.2 1.9 2.6 1.6.4 2.7 1.4 1.9 2.6-.8 1.2-2.8 1.4-4.4.5" />
    </svg>
  );
}

export function IconeVer({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function IconeExcluir({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
