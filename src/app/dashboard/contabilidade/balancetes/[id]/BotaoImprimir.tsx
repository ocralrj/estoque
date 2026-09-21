"use client";

export default function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center justify-center rounded-lg bg-[var(--neo-flat-alt)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:brightness-95"
    >
      Imprimir
    </button>
  );
}
