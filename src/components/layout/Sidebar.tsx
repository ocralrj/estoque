"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import { clsx } from "clsx";
import { useState } from "react";

interface NavItem {
  href?: string;
  label: string;
  roles: string[];
  children?: NavItem[];
}

const navStructure = (role: string): NavItem[] => {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Início",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"]
    },
    {
      label: "Estoque",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
      children: [
        { href: "/dashboard/estoque/produtos", label: "Produtos", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/estoque/movimentacoes", label: "Movimentações", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/estoque/alertas", label: "Alertas", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/estoque/relatorios", label: "Relatórios", roles: ["super_admin", "gestor"] },
      ],
    },
    {
      label: "Certificados",
      roles: ["super_admin", "gestor"],
      children: [
        { href: "/dashboard/certificados/lista", label: "Lista", roles: ["super_admin", "gestor", "requisitante"] },
        { href: "/dashboard/certificados/upload", label: "Upload", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/certificados/validade", label: "Validade", roles: ["super_admin", "gestor"] },
      ],
    },
    {
      label: "GED",
      roles: ["super_admin", "gestor", "almoxarife"],
      children: [
        { href: "/dashboard/ged/documentos", label: "Documentos", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/ged/pastas", label: "Pastas", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/ged/busca", label: "Busca", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
      ],
    },
    {
      label: "Administração",
      roles: ["super_admin", "gestor"],
      children: [
        { href: "/dashboard/admin/usuarios", label: "Usuários", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/grupos", label: "Grupos", roles: ["super_admin"] },
        { href: "/dashboard/admin/auditoria", label: "Auditoria", roles: ["super_admin"] },
      ],
    },
  ];

  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => child.roles.includes(role)),
    }));
};

function NavItemComponent({ item, pathname }: { item: NavItem; pathname: string }) {
  const [isOpen, setIsOpen] = useState(
    item.children?.some((child) => pathname.startsWith(child.href || "")) || false
  );

  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.href === pathname;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-primary-100 hover:bg-primary-700 transition-colors"
        >
          <span>{item.label}</span>
          <svg
            className={clsx("w-4 h-4 transition-transform", isOpen && "rotate-90")}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {isOpen && (
          <div className="ml-3 mt-1 space-y-1 border-l-2 border-primary-700 pl-2">
            {item.children?.map((child) => (
              <NavItemComponent key={child.href} item={child} pathname={pathname} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href || "#"}
      className={clsx(
        "block px-3 py-2 rounded-lg text-sm transition-colors",
        isActive
          ? "bg-primary-600 text-white font-medium"
          : "text-primary-100 hover:bg-primary-700"
      )}
    >
      {item.label}
    </Link>
  );
}

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  const roleLabel: Record<string, string> = {
    super_admin: "Super Admin",
    gestor: "Gestor",
    almoxarife: "Almoxarife",
    requisitante: "Requisitante",
  };

  return (
    <aside className="w-64 bg-primary-900 text-white flex flex-col">
      <div className="p-6 border-b border-primary-700">
        <h1 className="text-lg font-bold">ERP OCRAL</h1>
        <p className="text-xs text-primary-100 mt-1 truncate">{profile.email}</p>
        <span className="inline-block mt-2 text-xs bg-primary-700 rounded-full px-2 py-0.5">
          {roleLabel[profile.role] ?? profile.role}
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navStructure(profile.role).map((item) => (
          <NavItemComponent key={item.href || item.label} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="p-4 border-t border-primary-700">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-primary-100 hover:bg-primary-700 transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
