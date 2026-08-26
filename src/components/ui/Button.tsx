import { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = "rounded-2xl font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/30 active:scale-[0.98] border border-white/40";

  const variants = {
    primary: "bg-[var(--primary)] text-white border-transparent shadow-[8px_8px_18px_rgba(122,109,216,0.28),-8px_-8px_18px_rgba(255,255,255,0.15)] hover:brightness-105",
    secondary: "neo-soft text-[var(--text)] hover:translate-y-[-1px]",
    danger: "bg-[var(--danger)] text-[var(--text)] shadow-[8px_8px_18px_rgba(235,150,150,0.25),-8px_-8px_18px_rgba(255,255,255,0.15)] hover:brightness-105",
    ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--surface)]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };

  return (
    <button
      className={clsx(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
