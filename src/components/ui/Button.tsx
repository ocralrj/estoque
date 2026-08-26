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
  const baseStyles = "rounded-xl font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 active:scale-[0.98]";

  const variants = {
    primary: "bg-primary-600 text-white shadow-[5px_5px_10px_rgba(114,98,203,0.3),-3px_-3px_8px_rgba(255,255,255,0.5)] hover:bg-primary-700",
    secondary: "neo-soft bg-gray-200 text-gray-900 hover:bg-gray-300",
    danger: "bg-red-500 text-white shadow-[5px_5px_10px_rgba(185,70,70,0.25)] hover:bg-red-600",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
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
