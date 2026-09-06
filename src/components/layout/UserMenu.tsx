"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { roleLabel } from "@/lib/labels";
import type { Profile } from "@/types";

/**
 * Identidade do usuário no header: avatar, dados do perfil e saída.
 * Ficava no rodapé da sidebar, que some em telas menores.
 */
export default function UserMenu({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  // O nome é a identificação; o e-mail só entra quando ainda não foi definido
  // (o próprio usuário resolve isso em Meu perfil).
  const displayName = profile.full_name?.trim() || profile.email;
  const initial = displayName?.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="neo-button inline-flex items-center gap-2 rounded-full p-1 pr-3 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30"
        aria-haspopup="menu"
        aria-expanded={open}
        title={displayName}
      >
        <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-sm font-extrabold text-[var(--primary-strong)]">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt="Foto do usuário"
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-bold text-[var(--text)] sm:inline">
          {displayName}
        </span>
      </button>

      {open && (
        <div
          className="neo-raised absolute right-0 z-30 mt-3 w-72 overflow-hidden"
          role="menu"
        >
          <div className="border-b border-[var(--stroke)] bg-[var(--surface)]/80 px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[var(--primary-soft)] text-lg font-extrabold text-[var(--primary-strong)]">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt="Foto do usuário"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initial
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-extrabold text-[var(--text)]">
                  {profile.full_name || "Sem nome"}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">{profile.email}</p>
              </div>
            </div>
            <span className="mt-3 inline-block rounded-full bg-[var(--primary-soft)] px-3 py-1 text-[11px] font-bold text-[var(--primary-strong)]">
              {roleLabel(profile.role)}
            </span>
          </div>

          <div className="space-y-1 bg-[var(--surface-soft)] p-2">
            <Link
              href="/dashboard/profile"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="block rounded-2xl px-4 py-2.5 text-sm font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-strong)]"
            >
              Meu perfil
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              role="menuitem"
              className="block w-full rounded-2xl px-4 py-2.5 text-left text-sm font-bold text-[var(--muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--danger)]"
            >
              Sair do sistema
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
