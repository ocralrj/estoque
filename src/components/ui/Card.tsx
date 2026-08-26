import { ReactNode } from "react";
import { clsx } from "clsx";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function Card({ children, className, title, subtitle }: CardProps) {
  return (
    <div className={clsx("neo-card", className)}>
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-[var(--stroke)]">
          {title && <h3 className="text-lg font-extrabold tracking-tight text-[var(--text)]">{title}</h3>}
          {subtitle && <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
