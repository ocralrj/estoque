"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setUserActive,
  updateUserRole,
  promoverASuperAdmin,
} from "@/app/actions/users";
import { ROLE_LABELS, roleLabel } from "@/lib/labels";
import type { Profile, UserRole } from "@/types";

type Feedback = { kind: "ok" | "erro"; text: string } | null;

export default function UsersClient({
  users,
  currentRole,
  meuId,
}: {
  users: Profile[];
  currentRole: string;
  meuId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // "Super Admin" não entra no seletor: conceder o papel máximo do sistema por
  // um clique distraído num dropdown, ao lado dos demais, é fácil demais.
  // A promoção tem botão próprio, com confirmação.
  const availableRoles: UserRole[] =
    currentRole === "super_admin"
      ? ["gestor", "almoxarife", "requisitante"]
      : ["almoxarife", "requisitante"];

  function promover(u: Profile) {
    const nome = u.full_name || u.email;
    if (
      !window.confirm(
        `Tornar "${nome}" um super admin?

Ele passa a poder excluir documentos, gerenciar todos os usuários e conceder o mesmo papel a outras pessoas. Depois disso, só ele próprio poderá alterar seu papel.`
      )
    ) {
      return;
    }
    run(u.id, () => promoverASuperAdmin(u.id));
  }

  function run(userId: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusyId(userId);
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setFeedback({ kind: "ok", text: "Usuário atualizado." });
        router.refresh();
      } else {
        setFeedback({ kind: "erro", text: result.message ?? "Erro ao atualizar." });
      }
      setBusyId(null);
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Usuários</h1>

      {feedback && (
        <p
          className={`text-sm rounded-lg px-3 py-2 mb-4 ${
            feedback.kind === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {feedback.text}
        </p>
      )}

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        <div className="neo-flat overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--neo-flat)] text-[var(--text-muted)] text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Nome / Email</th>
              <th className="px-4 py-3 text-left">Função</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--neo-line)]">
            {users.map((u) => {
              const ehSuperAdmin = u.role === "super_admin";
              // Super admin é intocável por terceiros: nem papel, nem status.
              const editable =
                !ehSuperAdmin &&
                (currentRole === "super_admin" ||
                  u.role === "requisitante" ||
                  u.role === "almoxarife");
              const busy = pending && busyId === u.id;

              return (
                <tr key={u.id} className="hover:bg-[var(--neo-flat)]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text)]">
                      {u.full_name || "Sem nome definido"}
                    </p>
                    <p className="text-[var(--text-muted)] text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <select
                        value={u.role}
                        disabled={busy}
                        onChange={(e) =>
                          run(u.id, () =>
                            updateUserRole(u.id, e.target.value as UserRole)
                          )
                        }
                        className="border border-[var(--neo-line)] rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--ring)] disabled:opacity-50"
                      >
                        {availableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={
                          ehSuperAdmin
                            ? "font-semibold text-[var(--primary-strong)]"
                            : "text-[var(--text-muted)]"
                        }
                      >
                        {roleLabel(u.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`neo-sit ${u.active ? "neo-sit--ok" : "neo-sit--erro"}`}
                    >
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {ehSuperAdmin ? (
                      <span className="text-xs text-[var(--text-muted)]">
                        {u.id === meuId ? "sua conta" : "protegido"}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          disabled={busy}
                          onClick={() => run(u.id, () => setUserActive(u.id, !u.active))}
                          className="text-xs text-[var(--primary)] hover:underline disabled:opacity-50"
                        >
                          {u.active ? "Desativar" : "Ativar"}
                        </button>
                        {currentRole === "super_admin" && u.active && (
                          <button
                            disabled={busy}
                            onClick={() => promover(u)}
                            className="text-xs text-[var(--primary-strong)] hover:underline disabled:opacity-50"
                          >
                            Tornar super admin
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
