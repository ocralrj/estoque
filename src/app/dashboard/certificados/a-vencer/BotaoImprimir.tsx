"use client";

export default function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="nao-imprimir neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)]"
    >
      Imprimir / PDF
    </button>
  );
}
