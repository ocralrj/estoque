"use client";

import { useMemo, useState } from "react";
import { gedDocuments } from "@/lib/ged/mock-data";

export default function GedBuscaPage() {
  const [query, setQuery] = useState("");
  const [setor, setSetor] = useState("Todos");

  const filteredDocuments = useMemo(() => {
    return gedDocuments.filter((document) => {
      const matchesText = [document.nome, document.preview, document.tags.join(" "), document.cliente]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());

      const matchesSetor = setor === "Todos" || document.setor === setor;
      return matchesText && matchesSetor;
    });
  }, [query, setor]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Busca GED</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pesquisa por texto documental, OCR, metadados e palavras-chave do arquivo.
        </p>
      </div>

      <section className="neo-card p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_0.7fr] gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Termo de busca</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por palavra-chave, cliente, documento ou termo do OCR"
              className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Setor</label>
            <select
              value={setor}
              onChange={(event) => setSetor(event.target.value)}
              className="mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
            >
              <option>Todos</option>
              <option>Fiscal</option>
              <option>DP</option>
              <option>Contábil</option>
            </select>
          </div>
        </div>
      </section>

      <section className="neo-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Resultados</h2>
          <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
            {filteredDocuments.length} itens
          </span>
        </div>

        <div className="space-y-3">
          {filteredDocuments.length > 0 ? (
            filteredDocuments.map((document) => (
              <div key={document.id} className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text)]">{document.nome}</p>
                    <p className="text-xs text-[var(--muted)]">{document.cliente} • {document.setor}</p>
                  </div>
                  <span className="rounded-full bg-[var(--success)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text)]">
                    {document.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">{document.preview}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {document.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-[var(--stroke)] bg-[var(--surface-strong)] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
              Nenhum resultado encontrado para a busca atual.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
