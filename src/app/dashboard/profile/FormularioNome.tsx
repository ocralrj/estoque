"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarMeuNome } from "@/app/actions/users";

/**
 * Edição do nome de exibição.
 *
 * Sem isto o perfil só exibia "Não informado", e o sistema inteiro caía no
 * e-mail como identificação — em saudações, listas e na trilha de auditoria.
 */
export default function FormularioNome({ nomeAtual }: { nomeAtual: string | null }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [nome, setNome] = useState(nomeAtual ?? "");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    iniciar(async () => {
      const res = await atualizarMeuNome(nome);
      setAviso(
        res.ok
          ? { ok: true, texto: "Nome atualizado." }
          : { ok: false, texto: res.message }
      );
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      <div>
        <label
          htmlFor="nome"
          className="block text-sm font-medium text-[var(--text)]"
        >
          Nome completo
        </label>
        <input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Como você quer ser chamado no sistema"
          className="mt-2 block w-full rounded-lg border border-[var(--neo-line)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          É por ele que você aparece nas listas, no histórico e nas saudações. Sem
          nome, o sistema mostra seu e-mail.
        </p>
      </div>

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            aviso.ok ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]" : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente || nome.trim() === (nomeAtual ?? "")}
        className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:opacity-50"
      >
        {pendente ? "Salvando…" : "Salvar nome"}
      </button>
    </form>
  );
}
