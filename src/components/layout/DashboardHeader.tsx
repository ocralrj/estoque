"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SuggestImprovementModal from "@/components/suggestions/SuggestImprovementModal";
import ThemeToggle from "@/components/theme/ThemeToggle";
import type { Notification } from "@/types/database";

export default function DashboardHeader() {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    async function loadNotifications() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, title, message, is_read, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!error && data) {
        setNotifications(data);
        setUnreadCount(data.filter((item) => !item.is_read).length);
      }
    }

    loadNotifications();
  }, []);

  useEffect(() => {
    async function markAllAsRead() {
      if (!notificationsOpen || unreadCount === 0) return;

      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
      });

      if (response.ok) {
        setNotifications((current) => current.map((notification) => ({
          ...notification,
          is_read: true,
        })));
        setUnreadCount(0);
      }
    }

    markAllAsRead();
  }, [notificationsOpen, unreadCount]);

  function closeNotifications() {
    setNotificationsOpen(false);
  }

  return (
    <>
      <div className="flex items-center justify-end gap-3 mb-7 relative">
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((value) => !value)}
            className={
              `neo-soft inline-flex items-center justify-center h-11 w-11 rounded-2xl text-gray-700 transition-all hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2` +
              (unreadCount > 0 ? " animate-[bounce_0.7s_ease-in-out_infinite]" : "")
            }
            title={unreadCount > 0 ? `${unreadCount} notificações não lidas` : "Notificações"}
          >
            <span className="relative inline-flex h-5 w-5 items-center justify-center">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2a6 6 0 0 0-6 6v4.586l-.707.707A1 1 0 0 0 5 15h14a1 1 0 0 0 .707-1.707L18 12.586V8a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 20Z" />
              </svg>
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
              ) : null}
            </span>
          </button>

          {notificationsOpen && (
            <div className="neo-raised absolute right-0 mt-3 w-80 rounded-[1.5rem] border border-white/60 z-20">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {unreadCount > 0 ? `${unreadCount} não lida(s)` : "Nenhuma nova notificação"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeNotifications}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Fechar notificações"
                >
                  ×
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={
                        `rounded-2xl border px-4 py-3 text-sm transition-colors ` +
                        (notification.is_read
                          ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          : "border-primary-200 bg-primary-50 text-slate-900 dark:border-primary-700 dark:bg-slate-950 dark:text-white")
                      }
                    >
                      <p className="font-semibold">{notification.title}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {notification.message}
                      </p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    {new Date(notification.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
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
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-[5px_5px_10px_rgba(114,98,203,0.28)] transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          title="Sugerir uma melhoria"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/20">
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
      </div>

      <SuggestImprovementModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
