"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { createGroup } from "@/app/actions/groups";
import SuggestWithAi from "@/components/ai/SuggestWithAi";

export default function NovoGrupoForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);

    try {
      await createGroup(formData);
      router.push("/dashboard/admin/grupos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar grupo");
      setLoading(false);
    }
  }

  return (
    <Card title="Novo Grupo" subtitle="Criar novo grupo de usuários">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nome do Grupo *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Ex: Analistas Financeiros"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Descrição
            </label>
            <SuggestWithAi
              fieldType="descricao_grupo"
              whatToSuggest="descrições claras de grupos de usuários e suas responsabilidades no ERP"
              domain="ERP OCRAL - Administração"
              currentValue={description}
              context={{
                nome_grupo: name,
                finalidade: "grupo de usuários com permissões",
              }}
              onAccept={setDescription}
            />
          </div>
          <textarea
            id="description"
            name="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Descreva as responsabilidades e permissões deste grupo"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar Grupo"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
