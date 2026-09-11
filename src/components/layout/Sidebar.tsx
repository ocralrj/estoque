"use client";

import Tooltip from "@/components/ui/Tooltip";
import IconeMenu from "./IconesMenu";
import Logo from "./Logo";
import { usePode } from "@/components/auth/Permissoes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { Profile } from "@/types";

interface NavItem {
  href?: string;
  label: string;
  /**
   * Permissão que revela o item, como "modulo:recurso:acao". Sem ela o item
   * não aparece — e a página correspondente recusa o acesso direto pela URL,
   * porque esconder o link não protege nada.
   */
  permissao?: string;
  /** Ícone do item. Recolhido, é a única identificação visível. */
  icone?: string;
  /** O que a tela faz, mostrado na dica ao passar o ponteiro. */
  dica?: string;
  roles: string[];
  children?: NavItem[];
}

/** Tudo que o menu pergunta. Fica explícito para o filtro poder ser um Set. */
const TODAS_AS_PERMISSOES = [
  "estoque:products:read",
  "estoque:movements:read",
  "estoque:requisicoes:read",
  "estoque:alerts:read",
  "estoque:reports:read",
  "ged:documents:read",
  "ged:folders:read",
  "certificados:certificates:read",
  "sugestoes:minhas:read",
  "sugestoes:todas:read",
  "protocolos:protocolos:read",
  "admin:users:read",
  "admin:users:create",
  "admin:departamentos:read",
  "admin:cargos:read",
  "admin:groups:read",
  "admin:audit:read",
];

const navStructure = (role: string, permissoes: Set<string>): NavItem[] => {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Início",
      icone: "inicio",
      dica: "Visão geral: totais de estoque, alertas e movimentações recentes",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      label: "Estoque",
      icone: "estoque",
      permissao: "estoque:products:read",
      dica: "Produtos do almoxarifado, entradas e saídas",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
      children: [
        { href: "/dashboard/estoque/produtos", label: "Produtos", icone: "produtos", permissao: "estoque:products:read", dica: "Cadastro dos itens do almoxarifado, com saldo e ponto de reposição", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/estoque/pedidos", label: "Pedidos de material", icone: "protocolos", permissao: "estoque:requisicoes:read", dica: "Pedir material e atender o que foi pedido. A baixa no estoque acontece na entrega", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/estoque/movimentacoes", label: "Movimentações", icone: "movimentacoes", permissao: "estoque:movements:read", dica: "Histórico de entradas e saídas. O saldo do produto é atualizado por aqui", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/estoque/alertas", label: "Alertas", icone: "alertas", permissao: "estoque:alerts:read", dica: "Produtos abaixo da quantidade mínima definida no cadastro", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/estoque/relatorios", label: "Relatórios", icone: "relatorios", permissao: "estoque:reports:read", dica: "Volume movimentado por período, produto e categoria", roles: ["super_admin", "gestor"] },
      ],
    },
    {
      // Grupo com href: o rótulo navega para o painel, a seta expande.
      href: "/dashboard/ged",
      label: "GED",
      icone: "ged",
      permissao: "ged:documents:read",
      dica: "Gestão eletrônica de documentos: acervo, prazos de guarda e certificados",
      roles: ["super_admin", "gestor", "almoxarife"],
      children: [
        { href: "/dashboard/ged/documentos", label: "Documentos", icone: "documentos", permissao: "ged:documents:read", dica: "Buscar, cadastrar e baixar arquivos do acervo", roles: ["super_admin", "gestor", "almoxarife", "requisitante"] },
        { href: "/dashboard/ged/pastas", label: "Pastas", icone: "pastas", permissao: "ged:folders:read", dica: "Estrutura de arquivamento por departamento", roles: ["super_admin", "gestor", "almoxarife"] },
      ],
    },
    {
      href: "/dashboard/certificados",
      label: "Certificados",
      icone: "certificados",
      permissao: "certificados:certificates:read",
      dica: "Certificados digitais das empresas, com aviso de vencimento",
      roles: ["super_admin", "gestor", "almoxarife"],
      children: [
        { href: "/dashboard/certificados", label: "Todos", icone: "certificados", permissao: "certificados:certificates:read", dica: "O acervo, ordenado pelo que vence primeiro", roles: ["super_admin", "gestor", "almoxarife"] },
        { href: "/dashboard/certificados/empresas", label: "Empresas", icone: "departamentos", permissao: "certificados:certificates:read", dica: "As empresas e quem cuida dos certificados de cada uma", roles: ["super_admin", "gestor", "almoxarife"] },
      ],
    },
    {
      href: "/dashboard/sugestoes",
      label: "Minhas Sugestões",
      icone: "sugestoes",
      permissao: "sugestoes:minhas:read",
      dica: "Melhorias que você propôs e a resposta da equipe",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      href: "/dashboard/protocolos",
      label: "Protocolos",
      icone: "protocolos",
      permissao: "protocolos:protocolos:read",
      dica: "Solicitações internas com número, responsável e situação",
      roles: ["super_admin", "gestor", "almoxarife", "requisitante"],
    },
    {
      label: "Administração",
      icone: "administracao",
      permissao: "admin:users:read",
      dica: "Usuários, grupos, departamentos e trilha de auditoria",
      roles: ["super_admin", "gestor"],
      children: [
        { href: "/dashboard/admin/acessos", label: "Pedidos de acesso", icone: "usuarios", permissao: "admin:users:create", dica: "Quem pediu acesso pela tela pública, esperando aprovação", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/usuarios", label: "Usuários", icone: "usuarios", permissao: "admin:users:read", dica: "Convidar pessoas, definir papéis e ativar ou desativar contas", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/departamentos", label: "Departamentos", icone: "departamentos", permissao: "admin:departamentos:read", dica: "Áreas da empresa que originam documentos no GED", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/cargos", label: "Cargos", icone: "usuarios", permissao: "admin:cargos:read", dica: "O que cada pessoa faz na empresa — separado do que ela pode fazer no sistema", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/grupos", label: "Grupos", icone: "grupos", permissao: "admin:groups:read", dica: "Conjuntos de usuários com permissões em comum", roles: ["super_admin"] },
        { href: "/dashboard/admin/sugestoes", label: "Sugestões", icone: "sugestoes", permissao: "sugestoes:todas:read", dica: "Melhorias enviadas por todos: responder e definir prioridade", roles: ["super_admin", "gestor"] },
        { href: "/dashboard/admin/auditoria", label: "Auditoria", icone: "auditoria", permissao: "admin:audit:read", dica: "Quem alterou papéis, grupos e permissões, e quando", roles: ["super_admin", "gestor"] },
      ],
    },
  ];

  // A filtragem é por permissão, não por papel. O papel continua no item apenas
  // como rede: se as permissões ainda não vieram do banco, o menu volta a ser o
  // que era antes dos grupos, em vez de aparecer vazio.
  const visivel = (item: NavItem) =>
    permissoes.size > 0
      ? !item.permissao || permissoes.has(item.permissao)
      : item.roles.includes(role);

  return items.filter(visivel).map((item) => ({
    ...item,
    children: item.children?.filter(visivel),
  }));
};

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
  const pode = usePode();
  const isDrawer = variant === "drawer";
  const isCollapsed = collapsed && !isDrawer;

  const permissoes = useMemo(() => {
    const set = new Set<string>();
    for (const item of TODAS_AS_PERMISSOES) {
      const [m, r, a] = item.split(":");
      if (pode(m, r, a)) set.add(item);
    }
    return set;
  }, [pode]);

  // Um grupo cujos filhos sumiram todos não deve aparecer sozinho: ele levaria
  // a uma tela que a pessoa não pode abrir.
  const itens = navStructure(profile.role, permissoes).filter(
    (item) => !item.children || item.children.length > 0
  );

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
            "neo-alca fixed z-30 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] text-[var(--text)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-left duration-200 top-[68px]",
            collapsed ? "left-[64px]" : "left-[304px]"
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

      <nav className="flex-1 space-y-1 overflow-y-auto py-2">
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
