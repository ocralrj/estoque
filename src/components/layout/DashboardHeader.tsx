"use client";

import { useState } from "react";
import SuggestImprovementModal from "@/components/suggestions/SuggestImprovementModal";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function DashboardHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          type="button"
          onClick={() => alert("Notificações serão adicionadas em breve ao projeto!")}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus:ring-offset-gray-900"
          title="Notificações em breve"
        >
          <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 2a6 6 0 0 0-6 6v4.586l-.707.707A1 1 0 0 0 5 15h14a1 1 0 0 0 .707-1.707L18 12.586V8a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 20Z" />
            </svg>
            <span className="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
          </span>
          <span className="hidden sm:inline">Notificações</span>
        </button>

        <ThemeToggle compact />

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-medium text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          title="Sugerir uma melhoria"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-300/80">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M7.5 5.5L9 2l1.5 3.5L14 7l-3.5 1.5L9 12 7.5 8.5 4 7l3.5-1.5zM16 11l1 2.5L20 14.5 17 15.5 16 18l-1-2.5L12 14.5l3-1L16 11zM5 15l.8 2 2 .8-2 .8L5 21l-.8-2.2-2-.8 2-.8L5 15z" />
            </svg>
          </span>
          <span className="hidden sm:inline">Sugerir uma melhoria</span>
        </button>
      </div>

      <SuggestImprovementModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
