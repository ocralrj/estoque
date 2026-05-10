"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import { clsx } from "clsx";

const navItems = (role: string) => {
  const items = [
    { href: "/dashboard", label: "Início", roles: ["super_admin", "gestor", "uploader", "viewer"] },
    { href: "/dashboard/certificates", label: "Certificados", roles: ["super_admin", "gestor", "uploader", "viewer"] },
    { href: "/dashboard/upload", label: "Enviar Certificado", roles: ["super_admin", "uploader"] },
    { href: "/dashboard/groups", label: "Grupos de Acesso", roles: ["super_admin", "gestor"] },
    { href: "/dashboard/users", label: "Usuários", roles: ["super_admin", "gestor"] },
    { href: "/dashboard/logs", label: "Logs de Download", roles: ["super_admin", "gestor"] },
  ];
  return items.filter((item) => item.roles.includes(role));
};

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
    uploader: "Uploader",
    viewer: "Visualizador",
  };

  return (
    <aside className="w-64 bg-primary-900 text-white flex flex-col">
      <div className="p-6 border-b border-primary-700">
        <h1 className="text-lg font-bold">Certificados OCRAL</h1>
        <p className="text-xs text-primary-100 mt-1 truncate">{profile.email}</p>
        <span className="inline-block mt-2 text-xs bg-primary-700 rounded-full px-2 py-0.5">
          {roleLabel[profile.role] ?? profile.role}
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems(profile.role).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "block px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === item.href
                ? "bg-primary-600 text-white font-medium"
                : "text-primary-100 hover:bg-primary-700"
            )}
          >
            {item.label}
          </Link>
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
