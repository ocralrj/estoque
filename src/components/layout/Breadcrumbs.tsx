"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

interface BreadcrumbItem {
  label: string;
  href: string;
}

const moduleLabelMap: Record<string, string> = {
  dashboard: "Início",
  estoque: "Estoque",
  produtos: "Produtos",
  movimentacoes: "Movimentações",
  alertas: "Alertas",
  relatorios: "Relatórios",
  certificados: "Certificados",
  ged: "GED",
  admin: "Administração",
  usuarios: "Usuários",
  grupos: "Grupos",
};

export default function Breadcrumbs() {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);

  const breadcrumbs: BreadcrumbItem[] = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = moduleLabelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    return { label, href };
  });

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.href} className="flex items-center">
          {index > 0 && <span className="mx-2 text-gray-400">/</span>}
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-gray-900">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-primary-600 transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
