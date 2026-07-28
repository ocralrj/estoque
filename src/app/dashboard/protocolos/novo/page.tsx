"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createProtocol } from "@/app/actions/protocols";
import { Button } from "@/components/ui";
import type { Profile } from "@/types/database";

const priorities = [
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "baixa", label: "Baixa" },
];

export default function NovoProtocoloPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = profile?.role;
      const manager = role === "super_admin" || role === "gestor";
      setIsManager(manager);

      if (manager) {
        const { data } = await supabase
          .from<Profile>("profiles")
          .select("id, email, full_name")
          .eq("active", true)
          .order("email");

        setUsers(data || []);
      }
    }

    loadUserData();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("priority", priority);
    if (assignedTo) formData.set("assigned_to", assignedTo);

    try {
      await createProtocol(formData);
      router.push("/dashboard/protocolos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar protocolo");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Novo Protocolo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Abra um novo protocolo para acompanhar solicitações e atribuir responsáveis.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Título *</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              placeholder="Descreva o objetivo do protocolo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              placeholder="Detalhe o que deve ser tratado neste protocolo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prioridade</label>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {priorities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {isManager && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Atribuir responsável</label>
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">Nenhum</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar Protocolo"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
