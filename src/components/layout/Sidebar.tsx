"use client";

import Tooltip from "@/components/ui/Tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { Profile } from "@/types";

interface NavItem {
  href?: string;
  label: string;
  /** O que a tela faz, mostrado na dica ao passar o ponteiro. */
  dica?: string;
  roles: string[];
  children?: NavItem[];
}

const navStructure = (role: string): NavItem[] => {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Início",
      dica: "Visão geral: totais de estoque, alertas e movimentações recentes",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      label: "Estoque",
      dica: "Produtos do almoxarifado, entradas e saídas",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
      children: [
        { href: "/dashboard/estoque/produtos", label: "Produtos", dica: "Cadastro dos itens do almoxarifado, com saldo e ponto de reposição", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/estoque/movimentacoes", label: "Movimentações", dica: "Histórico de entradas e saídas. O saldo do produto é atualizado por aqui", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/estoque/alertas", label: "Alertas", dica: "Produtos abaixo da quantidade mínima definida no cadastro", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/estoque/relatorios", label: "Relatórios", dica: "Volume movimentado por período, produto e categoria", roles: ["super_admin", "gestor"] },
      ],
    },
    {
      // Grupo com href: o rótulo navega para o painel, a seta expande.
      href: "/dashboard/ged",
      label: "GED",
      dica: "Gestão eletrônica de documentos: acervo, prazos de guarda e certificados",
      roles: ["super_admin", "gestor", "almoxarife"],
      children: [
        { href: "/dashboard/ged/documentos", label: "Documentos", dica: "Buscar, cadastrar e baixar arquivos do acervo", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/ged/pastas", label: "Pastas", dica: "Estrutura de arquivamento por departamento", roles: ["super_admin", "gestor", "almoxarife"] },
      ],
    },
    {
      href: "/dashboard/sugestoes",
      label: "Minhas Sugestões",
      dica: "Melhorias que você propôs e a resposta da equipe",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      href: "/dashboard/protocolos",
      label: "Protocolos",
      dica: "Solicitações internas com número, responsável e situação",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      label: "Administração",
      dica: "Usuários, grupos, departamentos e trilha de auditoria",
      roles: ["super_admin", "gestor"],
      children: [
        { href: "/dashboard/admin/usuarios", label: "Usuários", dica: "Convidar pessoas, definir papéis e ativar ou desativar contas", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/departamentos", label: "Departamentos", dica: "Áreas da empresa que originam documentos no GED", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/grupos", label: "Grupos", dica: "Conjuntos de usuários com permissões em comum", roles: ["super_admin"] },
        { href: "/dashboard/admin/sugestoes", label: "Sugestões", dica: "Melhorias enviadas por todos: responder e definir prioridade", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/auditoria", label: "Auditoria", dica: "Quem alterou papéis, grupos e permissões, e quando", roles: ["super_admin", "gestor"] },
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

/** Iniciais para o modo recolhido, onde só cabe o ícone. */
function itemInitials(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

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
        <Tooltip texto={item.dica ? `${item.label} — ${item.dica}` : item.label}>
          <Link
            href={destino || "#"}
            onClick={onNavigate}
            className="flex h-11 w-full items-center justify-center rounded-2xl text-xs font-bold text-[var(--muted)] transition-all hover:bg-[var(--surface-soft)] hover:text-[var(--primary-strong)]"
          >
            {itemInitials(item.label)}
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
            <Tooltip texto={item.dica ?? item.label}>
              <Link
                href={item.href}
                onClick={() => {
                  setIsOpen(true);
                  onNavigate?.();
                }}
                className="flex-1 px-4 py-3 text-sm font-bold text-inherit"
              >
                {item.label}
              </Link>
            </Tooltip>
          ) : (
            <Tooltip texto={item.dica ?? item.label}>
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex-1 px-4 py-3 text-left text-sm font-bold text-inherit"
              >
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
    <Tooltip texto={item.dica ? `${item.label} — ${item.dica}` : item.label}>
    <Link
      href={item.href || "#"}
      onClick={onNavigate}
      className={clsx(
        "block w-full rounded-2xl text-sm font-bold transition-all",
        collapsed
          ? "flex h-11 items-center justify-center text-xs"
          : "px-4 py-3",
        isActive
          ? "neo-soft bg-[var(--surface)] text-[var(--primary-strong)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary-strong)]"
      )}
    >
      {collapsed ? itemInitials(item.label) : item.label}
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
  const isDrawer = variant === "drawer";
  const isCollapsed = collapsed && !isDrawer;

  return (
    <aside
      className={clsx(
        "relative flex shrink-0 flex-col border-r border-[var(--stroke)] bg-[var(--bg)] py-7 text-[var(--text)] transition-[width] duration-200",
        isDrawer ? "h-full w-72 px-4" : "hidden min-h-screen lg:flex",
        !isDrawer && (isCollapsed ? "w-20 px-3" : "w-72 px-5")
      )}
    >
      <div className={clsx("pb-6", isCollapsed ? "text-center" : "px-2")}>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold tracking-tight text-[var(--text)]">
              Ocral
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">Almoxarifado e gestão</p>
          </div>
        )}

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
          className="neo-alca absolute -right-4 top-[68px] z-20 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] text-[var(--text)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
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

      <nav className="flex-1 space-y-1 overflow-y-auto py-2">
        {navStructure(profile.role).map((item) => (
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
