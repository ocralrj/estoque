"use client";

import { useTheme } from "./ThemeProvider";
import { clsx } from "clsx";

interface ThemeToggleProps {
  className?: string;
  /** compact = só ícone */
  compact?: boolean;
}

export default function ThemeToggle({
  className,
  compact = false,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={clsx(
        "neo-button inline-flex items-center justify-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500/40",
        compact ? "h-11 w-11 p-0" : "h-11 px-4 py-2 text-sm font-semibold",
        className
      )}
      title={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {!compact && (
        <span className="hidden sm:inline">
          {isDark ? "Modo claro" : "Modo escuro"}
        </span>
      )}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}
