"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import DashboardHeader from "@/components/layout/DashboardHeader";
import type { Profile } from "@/types";

const COLLAPSE_KEY = "ocral-sidebar-collapsed";

/**
 * Casca do dashboard: mantém o estado do menu (recolhido no desktop, gaveta
 * no mobile) em torno de children renderizados no servidor.
 */
export default function DashboardShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // A preferência é lida após a montagem para não divergir do HTML do servidor.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* navegador sem storage: segue expandida */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignora */
      }
      return next;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Trava o scroll do fundo e permite fechar a gaveta com Esc.
  useEffect(() => {
    if (!mobileOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-[var(--neo-bg)]">
      <Sidebar
        profile={profile}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={closeMobile}
            className="absolute inset-0 bg-black/45"
          />
          <div className="relative z-10 h-full">
            <Sidebar
              profile={profile}
              collapsed={false}
              onToggleCollapse={toggleCollapse}
              onNavigate={closeMobile}
              variant="drawer"
            />
          </div>
        </div>
      )}

      {/* Quem rola é a janela, não o main. Um overflow "auto" aqui fazia do
          main um contêiner de rolagem que nunca rola — e o cabeçalho, sticky,
          grudava nele em vez de na tela. "clip" corta sem criar esse contêiner. */}
      <main className="min-w-0 flex-1 overflow-x-clip bg-[var(--neo-bg)] p-4 sm:p-6 lg:p-9">
        <DashboardHeader profile={profile} onOpenMenu={() => setMobileOpen(true)} />
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
