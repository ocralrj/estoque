/**
 * Ícones do menu lateral.
 *
 * Traço em vez de preenchimento, para acompanhar o peso do restante da
 * interface, e desenhados como um único `path` por item sempre que possível —
 * são dezesseis ícones carregados em toda página, e uma biblioteca inteira para
 * isso custaria mais do que entrega.
 *
 * Recolhido, o ícone é a única identificação visível do item: por isso cada um
 * precisa ser distinguível dos vizinhos de relance, e não apenas bonito. As
 * iniciais que existiam antes ("MS", "PR", "AD") não cumpriam esse papel.
 */

const TRACOS: Record<string, string> = {
  inicio: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  estoque: "M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Zm0 18V12m0 0 9-4.5M12 12 3 7.5",
  produtos: "M4 7h16v13H4V7Zm0 0 2-3h12l2 3M9.5 11.5h5",
  movimentacoes: "M7 8h13m0 0-3-3m3 3-3 3M17 16H4m0 0 3-3m-3 3 3 3",
  alertas: "M12 3a5 5 0 0 0-5 5v4l-2 3h14l-2-3V8a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0",
  relatorios: "M3 20h18M7.5 20v-6M12 20V8m4.5 12v-9",
  ged: "M3 6h18v3.5H3V6Zm2 3.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M10 13.5h4",
  documentos:
    "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4",
  pastas: "M3 7.5a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z",
  sugestoes:
    "M9.5 21h5M10 18h4M12 3a6 6 0 0 0-3.5 10.9c.3.2.5.6.5 1V16h6v-1.1c0-.4.2-.8.5-1A6 6 0 0 0 12 3Z",
  protocolos:
    "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2M9 12h6M9 16h4",
  administracao: "M12 3 4 6v6c0 4.5 3.2 7.9 8 9 4.8-1.1 8-4.5 8-9V6l-8-3Z",
  usuarios:
    "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M16 4.2a4 4 0 0 1 0 7.6",
  departamentos:
    "M3 21h18M5.5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M13.5 9.5H18a1 1 0 0 1 1 1V21M8 8h3M8 12h3M8 16h3",
  grupos:
    "M7.5 20v-1a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v1M12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 20v-1a3 3 0 0 1 2.2-2.9M20.5 20v-1a3 3 0 0 0-2.2-2.9",
  auditoria: "M12 3 4 6v6c0 4.5 3.2 7.9 8 9 4.8-1.1 8-4.5 8-9V6l-8-3Zm-3 8.6 2.2 2.2 4.3-4.3",
};

export type NomeDeIcone = keyof typeof TRACOS;

export default function IconeMenu({
  nome,
  className = "h-5 w-5",
}: {
  nome?: string;
  className?: string;
}) {
  const d = nome ? TRACOS[nome] : undefined;
  if (!d) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
