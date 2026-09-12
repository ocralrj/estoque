"use client";

import Tooltip from "@/components/ui/Tooltip";
import IconeMenu from "./IconesMenu";
import Logo from "./Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { Profile } from "@/types";
import { navStructure, usePermissoesDaNavegacao, type NavItem } from "./navegacao";

function NavItemComponent({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const hasChildren = Boolean(item.children && item.children.length > 0);
  const [isOpen, setIsOpen] = useState(
    item.children?.some((child) => pathname.startsWith(child.href || "")) ?? false
  );

  const isActive = item.href === pathname;

  if (hasChildren) {
    // Recolhida, a sidebar não tem largura para submenus: mostramos só o
    // primeiro nível, e o grupo leva ao seu próprio destino (ou ao item inicial).
    if (collapsed) {
      const destino = item.href || item.children?.[0]?.href;
      // Recolhida, o rótulo some — a dica passa a ser a única identificação.
      return (
        <Tooltip
          className="block w-full"
          texto={item.dica ? `${item.label} — ${item.dica}` : item.label}
        >
          <Link
            href={destino || "#"}
            onClick={onNavigate}
            className="flex h-11 w-full items-center justify-center rounded-2xl text-[var(--muted)] transition-all hover:bg-[var(--surface-soft)] hover:text-[var(--primary-strong)]"
          >
            <IconeMenu nome={item.icone} />
          </Link>
        </Tooltip>
      );
    }

    const grupoAtivo = item.href === pathname;

    return (
      <div>
        <div
          className={clsx(
            "flex items-center rounded-2xl transition-all",
            grupoAtivo
              ? "neo-soft bg-[var(--surface)] text-[var(--primary-strong)]"
              : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary-strong)]"
          )}
        >
          {/* Grupo com destino próprio navega ao ser clicado; sem destino,
              o rótulo apenas abre e fecha, como antes. */}
          {item.href ? (
            <Tooltip className="flex flex-1" texto={item.dica ?? item.label}>
              <Link
                href={item.href}
                onClick={() => {
                  setIsOpen(true);
                  onNavigate?.();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-inherit"
              >
                <IconeMenu nome={item.icone} />
                {item.label}
              </Link>
            </Tooltip>
          ) : (
            <Tooltip className="flex flex-1" texto={item.dica ?? item.label}>
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-inherit"
              >
                <IconeMenu nome={item.icone} />
                {item.label}
              </button>
            </Tooltip>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Recolher ${item.label}` : `Expandir ${item.label}`}
            className="px-3 py-3 text-inherit"
          >
            <svg
              className={clsx("w-4 h-4 transition-transform", isOpen && "rotate-90")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div className="ml-4 mt-1 space-y-1 border-l-2 border-[var(--primary-soft)] pl-2">
            {item.children?.map((child) => (
              <NavItemComponent
                key={child.href}
                item={child}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Tooltip
      className="block w-full"
      texto={item.dica ? `${item.label} — ${item.dica}` : item.label}
    >
    <Link
      href={item.href || "#"}
      onClick={onNavigate}
      className={clsx(
        "flex w-full items-center rounded-2xl text-sm font-bold transition-all",
        collapsed
          ? "h-11 justify-center"
          : "gap-3 px-4 py-3",
        isActive
          ? "neo-soft bg-[var(--surface)] text-[var(--primary-strong)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary-strong)]"
      )}
    >
      <IconeMenu nome={item.icone} />
      {!collapsed && item.label}
    </Link>
    </Tooltip>
  );
}

interface SidebarProps {
  profile: Profile;
  /** Recolhida para a faixa de ícones (somente desktop). */
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Fecha a gaveta depois de navegar, no mobile. */
  onNavigate?: () => void;
  /** No mobile a sidebar é uma gaveta e não deve ser recolhível. */
  variant?: "desktop" | "drawer";
}

export default function Sidebar({
  profile,
  collapsed,
  onToggleCollapse,
  onNavigate,
  variant = "desktop",
}: SidebarProps) {
  const pathname = usePathname();
  const permissoes = usePermissoesDaNavegacao();
  const isDrawer = variant === "drawer";
  const isCollapsed = collapsed && !isDrawer;

  const itens = navStructure(profile.role, permissoes);

  return (
    <aside
      className={clsx(
        "relative flex shrink-0 flex-col border-r border-[var(--stroke)] bg-[var(--bg)] py-7 text-[var(--text)] transition-[width] duration-200",
        isDrawer ? "h-full w-72 px-4" : "hidden min-h-screen lg:flex",
        !isDrawer && (isCollapsed ? "w-20 px-3" : "w-72 px-5")
      )}
    >
      {/* Recolhida, a marca encolhe em vez de sumir: é o que diz de que sistema
          se trata quando os rótulos do menu não cabem. */}
      <div className={clsx("flex pb-6", isCollapsed ? "justify-center" : "px-2")}>
        <Link href="/dashboard" aria-label="Ir para o início" onClick={onNavigate}>
          <Logo largura={isCollapsed ? 44 : 132} />
        </Link>
      </div>

      {/* Sobre a linha que divide o menu do conteúdo, na altura da barra de
          opções do topo: o padding do main (36px) mais metade da barra (32px)
          põem o centro do botão em 68px. Fica fixo ao rolar, porque a aside
          não rola com o conteúdo. */}
      {!isDrawer && (
        <Tooltip
          texto={
            isCollapsed
              ? "Expandir o menu e mostrar os nomes das telas"
              : "Recolher o menu para uma faixa de ícones e ganhar espaço"
          }
        >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!isCollapsed}
          className={clsx(
            "neo-alca fixed z-30 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] text-[var(--text)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-[left] duration-200 top-[68px]",
            // Centro do botão (32px) sobre a borda da aside: w-20 = 80px, w-72 = 288px.
            collapsed ? "left-[64px]" : "left-[272px]"
          )}
        >
          <svg
            className={clsx("h-4 w-4 transition-transform", isCollapsed && "rotate-180")}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        </Tooltip>
      )}

      {/* O overflow que deixa o menu rolar também recorta a sombra do item
          ativo, que passa 20px da caixa — o "Início", primeiro da lista, saía
          com a sombra cortada reta em cima e dos lados. A margem negativa com
          padding igual dá essa folga sem mover nenhum item; na lateral ela
          vai até a borda da aside, e não além. */}
      <nav
        className={clsx(
          "flex-1 space-y-1 overflow-y-auto -mt-5 pt-7 pb-2",
          isDrawer ? "-mx-4 px-4" : isCollapsed ? "-mx-3 px-3" : "-mx-5 px-5"
        )}
      >
        {itens.map((item) => (
          <NavItemComponent
            key={item.href || item.label}
            item={item}
            pathname={pathname}
            collapsed={isCollapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </aside>
  );
}
