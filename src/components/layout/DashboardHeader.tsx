"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SuggestImprovementModal from "@/components/suggestions/SuggestImprovementModal";
import ThemeToggle from "@/components/theme/ThemeToggle";
import UserMenu from "@/components/layout/UserMenu";
import PesquisaDeFuncoes from "@/components/layout/PesquisaDeFuncoes";
import { formatDate } from "@/lib/labels";
import type { Notification } from "@/types/database";
import { usePode } from "@/components/auth/Permissoes";
import type { Profile } from "@/types";

export default function DashboardHeader({
  profile,
  onOpenMenu,
}: {
  profile: Profile;
  onOpenMenu?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [enviandoResposta, setEnviandoResposta] = useState(false);
  const pode = usePode();
  const router = useRouter();

  useEffect(() => {
    let ativo = true;

    async function loadNotifications() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Filtro explícito por usuário: não depender apenas do RLS para
      // não vazar notificações de terceiros se a política mudar.
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, title, message, is_read, link, permissao, origem_id, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!ativo || error || !data) return;
      setNotifications(data);
      setUnreadCount(data.filter((item) => !item.is_read).length);
    }

    loadNotifications();

    // Sem isto a lista era buscada uma única vez, na montagem: quem deixasse a
    // aba aberta — que é o normal num sistema de trabalho — só veria um aviso
    // novo ao recarregar a página, e a notificação chegaria tarde demais para
    // servir de aviso.
    //
    // Um minuto é frequente o bastante para o aviso ainda ser útil e raro o
    // bastante para não pesar: são cinco linhas filtradas por índice.
    const intervalo = setInterval(loadNotifications, 60_000);

    // Voltar para a aba é quando a pessoa mais espera ver novidade.
    function aoVoltar() {
      if (document.visibilityState === "visible") loadNotifications();
    }
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      ativo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  /**
   * Marca como lida: uma, ou todas.
   *
   * Antes o simples ato de abrir o painel dava tudo por lido. Bater o olho na
   * lista não é o mesmo que ter lido o aviso — e quem abrisse o sino de
   * passagem perdia o rastro do que ainda precisava ver.
   */
  /** A permissão do destino vem na própria notificação. */
  function podeAbrir(n: Notification): boolean {
    if (!n.link) return false;
    if (!n.permissao) return true;
    const [m, r, a] = n.permissao.split(":");
    return Boolean(m && r && a && pode(m, r, a));
  }

  /**
   * Clique na notificação.
   *
   * Marca como lida e leva ao destino — avisar sem dizer onde é metade do
   * trabalho. Quem não tem permissão para o destino não é levado a uma tela
   * que vai recusá-lo: recebe o campo de resposta, para pelo menos reagir a
   * quem avisou em vez de ficar sabendo de algo sem poder fazer nada.
   */
  async function aoClicar(n: Notification) {
    if (!n.is_read) await marcarComoLida(n.id);

    if (podeAbrir(n)) {
      setNotificationsOpen(false);
      router.push(n.link!);
      return;
    }

    if (n.origem_id) {
      setRespondendo((atual) => (atual === n.id ? null : n.id));
      setResposta("");
    }
  }

  async function enviarResposta(id: string) {
    if (!resposta.trim()) return;
    setEnviandoResposta(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("responder_notificacao", {
      p_id: id,
      p_texto: resposta.trim(),
    });
    setEnviandoResposta(false);
    if (error) return;
    setRespondendo(null);
    setResposta("");
  }

  async function marcarComoLida(id?: string) {
    const resposta = await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
    if (!resposta.ok) return;

    setNotifications((atuais) =>
      atuais.map((n) => (!id || n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((atual) => (id ? Math.max(0, atual - 1) : 0));
  }


  function closeNotifications() {
    setNotificationsOpen(false);
  }

  return (
    <>
      {/* Fixo no topo ao rolar. O fundo cobre a faixa acima da barra (o padding
          do main, que as margens negativas trazem para dentro) para o conteúdo
          não aparecer passando por ali. Fica em z-20, abaixo do botão de
          recolher o menu (z-30), que se apoia sobre a borda da barra. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-2 bg-[var(--neo-bg)] px-4 pb-4 pt-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-2 after:bg-gradient-to-b after:from-[var(--neo-bg)] after:to-transparent sm:-mx-6 sm:-mt-6 sm:mb-3 sm:px-6 sm:pt-6 lg:-mx-9 lg:-mt-9 lg:px-9 lg:pt-9">
        <div className="neo-panel flex flex-wrap items-center justify-end gap-2 rounded-[1.6rem] px-3 py-2.5 sm:gap-3">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Abrir menu"
              className="neo-button inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Ocupa o espaço vazio à esquerda: é o que empurra os demais controles
              para a direita, papel que antes era do botão de menu. */}
          <div className="mr-auto flex min-w-[2.75rem] flex-1">
            <PesquisaDeFuncoes role={profile.role} />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((value) => !value)}
              className="neo-button relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30"
              aria-label={
                unreadCount > 0
                  ? `Notificações: ${unreadCount} não lida(s)`
                  : "Notificações"
              }
              title={
                unreadCount > 0
                  ? `${unreadCount} notificação(ões) não lida(s)`
                  : "Notificações"
              }
            >
              <svg
                className={`h-5 w-5${unreadCount > 0 ? " sino-balanca" : ""}`}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2a6 6 0 0 0-6 6v4.586l-.707.707A1 1 0 0 0 5 15h14a1 1 0 0 0 .707-1.707L18 12.586V8a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 20Z" />
              </svg>

              {/* A contagem fica fora do SVG: dentro dele giraria junto com o
                  sino e ficaria ilegível. Acima de 9 vira "9+" — o número exato
                  não muda o que a pessoa faz a seguir. */}
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--erro-solid)] px-1 text-[11px] font-extrabold leading-none text-white ring-2 ring-[var(--neo-bg)]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="neo-raised absolute right-0 mt-3 w-80 z-20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--stroke)] bg-[var(--surface)]/80">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Notificações</p>
                    <p className="text-xs text-[var(--muted)]">
                      {unreadCount > 0 ? `${unreadCount} não lida(s)` : "Nenhuma nova notificação"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => marcarComoLida()}
                        className="text-xs font-semibold text-[var(--primary)] hover:underline"
                      >
                        Marcar todas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeNotifications}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
                      aria-label="Fechar notificações"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto p-3 bg-[var(--surface-soft)]">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => aoClicar(notification)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            aoClicar(notification);
                          }
                        }}
                        className={
                          `cursor-pointer rounded-2xl border px-4 py-3 text-sm transition-colors ` +
                          (notification.is_read
                            ? "border-[var(--stroke)] bg-[var(--surface)] text-[var(--text)]"
                            : "border-[var(--primary-soft)] bg-[var(--primary-soft)] text-[var(--text)]")
                        }
                      >
                        <p className="font-semibold">{notification.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {notification.message}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                            {formatDate(notification.created_at)}
                          </p>

                          {notification.is_read ? (
                            <span className="text-[11px] font-semibold text-[var(--muted)]">
                              {podeAbrir(notification) ? "Clique para abrir" : "Lida"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                marcarComoLida(notification.id);
                              }}
                              className="rounded-full bg-[var(--neo-bg)] px-3 py-1 text-[11px] font-bold text-[var(--primary)] hover:underline"
                            >
                              Marcar como lida
                            </button>
                          )}
                        </div>

                        {respondendo === notification.id && (
                          <div
                            className="mt-3 border-t border-[var(--stroke)] pt-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="mb-2 text-xs text-[var(--muted)]">
                              Você não tem acesso à tela deste aviso. Responda a quem
                              avisou:
                            </p>
                            <textarea
                              value={resposta}
                              onChange={(e) => setResposta(e.target.value)}
                              rows={2}
                              autoFocus
                              placeholder="Escreva sua resposta"
                              className="w-full rounded-lg border border-[var(--stroke)] bg-[var(--neo-bg)] px-2 py-1.5 text-xs text-[var(--text)]"
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={enviandoResposta || !resposta.trim()}
                                onClick={() => enviarResposta(notification.id)}
                                className="rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-bold text-[var(--on-accent)] disabled:opacity-50"
                              >
                                {enviandoResposta ? "Enviando…" : "Enviar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRespondendo(null)}
                                className="text-[11px] font-semibold text-[var(--muted)] hover:underline"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                      Ainda não há notificações.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <ThemeToggle compact />

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--primary)] hover:brightness-105 text-[var(--on-accent)] font-bold text-sm shadow-[8px_8px_18px_rgba(122,109,216,0.28),-8px_-8px_18px_rgba(255,255,255,0.12)] transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30"
            title="Sugerir uma melhoria"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--neo-bg)]/20">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M7.5 5.5L9 2l1.5 3.5L14 7l-3.5 1.5L9 12 7.5 8.5 4 7l3.5-1.5zM16 11l1 2.5L20 14.5 17 15.5 16 18l-1-2.5L12 14.5l3-1L16 11zM5 15l.8 2 2 .8-2 .8L5 21l-.8-2.2-2-.8 2-.8L5 15z" />
              </svg>
            </span>
            <span className="hidden sm:inline">Sugerir uma melhoria</span>
          </button>

          <UserMenu profile={profile} />
        </div>
      </div>

      <SuggestImprovementModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
