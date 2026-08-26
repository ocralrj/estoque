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
      href: "/dashboard/sugestoes",
      label: "Meus pedidos",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      href: "/dashboard/protocolos",
      label: "Protocolos",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      label: "Administração",
      roles: ["super_admin", "gestor"],
      children: [
        { href: "/dashboard/admin/usuarios", label: "Usuários", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/grupos", label: "Grupos", roles: ["super_admin"] },
        { href: "/dashboard/admin/sugestoes", label: "Sugestões", roles: ["super_admin", "gestor"] },
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
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold text-gray-600 hover:text-primary-700 hover:bg-white/40 transition-all"
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
          <div className="ml-4 mt-1 space-y-1 border-l-2 border-primary-200 pl-2">
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
        "block px-4 py-3 rounded-2xl text-sm font-bold transition-all",
        isActive
          ? "neo-soft bg-[var(--neo-surface)] text-primary-700"
          : "text-gray-600 hover:bg-white/40 hover:text-primary-700"
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
    <aside className="hidden lg:flex w-72 shrink-0 min-h-screen bg-[var(--neo-bg)] text-gray-900 flex-col px-5 py-7 border-r border-white/45">
      <div className="px-3 pb-7">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-primary-600 mb-5">OCRAL</p>
        <a href="/dashboard/profile" className="flex items-center gap-3 no-underline">
          <div className="neo-soft h-14 w-14 rounded-2xl overflow-hidden text-primary-700 flex items-center justify-center text-xl font-extrabold">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Foto do usuário"
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{(profile.full_name || profile.email)?.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-extrabold text-gray-900 truncate">{profile.full_name || profile.email}</p>
            <p className="text-xs text-gray-500 truncate">Meu perfil</p>
          </div>
        </a>
        <p className="text-xs text-gray-500 mt-4 truncate">{profile.email}</p>
        <span className="inline-block mt-2 text-[11px] font-bold text-primary-700 bg-primary-100 rounded-full px-3 py-1">
          {roleLabel[profile.role] ?? profile.role}
        </span>
      </div>

      <nav className="flex-1 py-2 space-y-1 overflow-y-auto">
        {navStructure(profile.role).map((item) => (
          <NavItemComponent key={item.href || item.label} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="pt-5 mt-4 border-t border-white/70">
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-3 rounded-2xl text-sm font-bold text-gray-500 hover:text-red-500 hover:bg-white/40 transition-all"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
