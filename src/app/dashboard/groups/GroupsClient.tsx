"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Group { id: string; name: string; description: string | null; group_members: { count: number }[] }
interface User { id: string; full_name: string | null; email: string }
interface Certificate { id: string; title: string }

export default function GroupsClient({
  groups,
  users,
  certificates,
}: {
  groups: Group[];
  users: User[];
  certificates: Certificate[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedCert, setSelectedCert] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("groups").insert({
      name: newGroupName,
      description: newGroupDesc || null,
    });
    if (error) { setMsg("Erro ao criar grupo: " + error.message); }
    else { setMsg("Grupo criado!"); setNewGroupName(""); setNewGroupDesc(""); router.refresh(); }
    setLoading(false);
  }

  async function addUserToGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || !selectedUser) return;
    setLoading(true);
    const { error } = await supabase.from("group_members").insert({
      group_id: selectedGroup,
      user_id: selectedUser,
    });
    if (error) { setMsg("Erro: " + error.message); }
    else { setMsg("Usuário adicionado ao grupo!"); router.refresh(); }
    setLoading(false);
  }

  async function grantCertAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || !selectedCert) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("certificate_access").insert({
      certificate_id: selectedCert,
      group_id: selectedGroup,
      granted_by: user?.id,
    });
    if (error) { setMsg("Erro: " + error.message); }
    else { setMsg("Acesso concedido!"); router.refresh(); }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Grupos de Acesso</h1>

      {msg && (
        <p className="text-sm bg-green-50 text-green-700 rounded-lg px-3 py-2">{msg}</p>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Criar novo grupo</h2>
        <form onSubmit={createGroup} className="space-y-3">
          <input
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Nome do grupo"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Criar grupo
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Adicionar usuário a grupo</h2>
        <form onSubmit={addUserToGroup} className="space-y-3">
          <select
            required
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione o grupo</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select
            required
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione o usuário</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Adicionar usuário
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Habilitar certificado para grupo</h2>
        <form onSubmit={grantCertAccess} className="space-y-3">
          <select
            required
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione o grupo</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select
            required
            value={selectedCert}
            onChange={(e) => setSelectedCert(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecione o certificado</option>
            {certificates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Habilitar acesso
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Grupos existentes</h2>
        {!groups.length ? (
          <p className="text-sm text-gray-400">Nenhum grupo criado.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id} className="flex justify-between text-sm text-gray-700 border-b pb-2">
                <span className="font-medium">{g.name}</span>
                <span className="text-gray-400">
                  {g.group_members?.[0]?.count ?? 0} membro(s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
