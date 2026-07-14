"use client";

import { useState } from "react";
import SuggestImprovementModal from "@/components/suggestions/SuggestImprovementModal";

export default function DashboardHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-medium text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
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
