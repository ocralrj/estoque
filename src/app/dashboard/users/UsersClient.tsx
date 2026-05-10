"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/types";

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  gestor: "Gestor",
  uploader: "Uploader",
  viewer: "Visualizador",
};

export default function UsersClient({
  users,
  currentRole,
}: {
  users: Profile[];
  currentRole: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function updateRole(userId: string, role: UserRole) {
    setLoading(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (error) setMsg("Erro: " + error.message);
    else { setMsg("Perfil atualizado!"); router.refresh(); }
    setLoading(null);
  }

  async function toggleActive(userId: string, active: boolean) {
    setLoading(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ active: !active })
      .eq("id", userId);
    if (error) setMsg("Erro: " + error.message);
    else { setMsg("Usuário atualizado!"); router.refresh(); }
    setLoading(null);
  }

  const availableRoles: UserRole[] =
    currentRole === "super_admin"
      ? ["super_admin", "gestor", "uploader", "viewer"]
      : ["uploader", "viewer"];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Usuários</h1>

      {msg && (
        <p className="text-sm bg-green-50 text-green-700 rounded-lg px-3 py-2 mb-4">{msg}</p>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Nome / Email</th>
              <th className="px-4 py-3 text-left">Função</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{u.full_name || "—"}</p>
                  <p className="text-gray-400 text-xs">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  {currentRole === "super_admin" || u.role === "viewer" || u.role === "uploader" ? (
                    <select
                      value={u.role}
                      disabled={loading === u.id}
                      onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      {availableRoles.map((r) => (
                        <option key={r} value={r}>{roleLabel[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-600">{roleLabel[u.role]}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs rounded-full px-2 py-0.5 ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={loading === u.id}
                    onClick={() => toggleActive(u.id, u.active)}
                    className="text-xs text-primary-600 hover:underline disabled:opacity-50"
                  >
                    {u.active ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
