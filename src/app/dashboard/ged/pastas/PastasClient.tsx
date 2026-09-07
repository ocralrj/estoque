"use client";

import { useConfirmacao } from "@/components/ui/Confirmacao";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarPasta, atualizarPasta, excluirPasta } from "@/app/actions/ged-pastas";
import type { GedFolder } from "@/types/modules/ged";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

const vazio = { setor: "", nome: "", caminho: "", ativa: true };

export default function PastasClient({
  pastas,
  departamentos,
  ehAdmin,
}: {
  pastas: GedFolder[];
  departamentos: string[];
  ehAdmin: boolean;
}) {
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio, setor: departamentos[0] ?? "" });

  function abrirNova() {
    setForm({ ...vazio, setor: departamentos[0] ?? "" });
    setCriando(true);
    setEditando(null);
    setAviso(null);
  }

  function abrirEdicao(p: GedFolder) {
    setForm({ setor: p.setor, nome: p.nome, caminho: p.caminho, ativa: p.ativa });
    setEditando(p.id);
    setCriando(false);
    setAviso(null);
  }

  function salvar() {
    setAviso(null);
    iniciar(async () => {
      const res = editando
        ? await atualizarPasta(editando, form)
        : await criarPasta(form);

      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setCriando(false);
      setEditando(null);
      setAviso({ tipo: "ok", texto: editando ? "Pasta atualizada." : "Pasta criada." });
      router.refresh();
    });
  }

  async function excluir(p: GedFolder) {
    const ok = await confirmar({
      titulo: `Excluir a pasta "${p.nome}"?`,
      mensagem: "Os documentos dentro dela não são apagados, mas ficam sem pasta.",
      rotuloConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setAviso(null);
    iniciar(async () => {
      const res = await excluirPasta(p.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: "Pasta excluída." });
      router.refresh();
    });
  }

  // Agrupa por departamento, preservando a ordem do catálogo.
  const porDepartamento = new Map<string, GedFolder[]>();
  for (const p of pastas) {
    const lista = porDepartamento.get(p.setor) ?? [];
    lista.push(p);
    porDepartamento.set(p.setor, lista);
  }

  const editor = (
    <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 sm:grid-cols-2">
      <div>
        <label className={rotulo}>Departamento *</label>
        <select
          value={form.setor}
          onChange={(e) => setForm({ ...form, setor: e.target.value })}
          className={campo}
        >
          {departamentos.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={rotulo}>Nome *</label>
        <input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          placeholder="Ex.: Notas de entrada"
          className={campo}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={rotulo}>Caminho *</label>
        <input
          value={form.caminho}
          onChange={(e) => setForm({ ...form, caminho: e.target.value })}
          placeholder="Ex.: Fiscal/Entradas e Saídas/NF-e/2026"
          className={campo}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Use barras para indicar os níveis. Sem barra no começo nem no fim.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--text)] sm:col-span-2">
        <input
          type="checkbox"
          checked={form.ativa}
          onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
        />
        Ativa (aparece na escolha de pasta ao cadastrar documento)
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
        >
          {pendente ? "Salvando…" : editando ? "Salvar" : "Criar pasta"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCriando(false);
            setEditando(null);
          }}
          className="rounded-full border border-[var(--stroke)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Dialogo />

      {aviso && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--success)] text-[var(--text)]"
              : "bg-[var(--danger)] text-[var(--text)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <section className="neo-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">
              {pastas.length} pasta(s)
            </h2>
            <p className="text-sm text-[var(--muted)]">
              A estrutura em que os documentos são arquivados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => (criando ? setCriando(false) : abrirNova())}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] shadow-[10px_10px_18px_rgba(122,109,216,0.28)]"
          >
            {criando ? "Cancelar" : "Nova pasta"}
          </button>
        </div>
        {criando && editor}
      </section>

      {porDepartamento.size > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from(porDepartamento.entries()).map(([dep, itens]) => (
            <div key={dep} className="neo-card p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[var(--text)]">{dep}</h2>
                <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
                  {itens.length} pasta(s)
                </span>
              </div>

              <div className="space-y-3">
                {itens.map((p) =>
                  editando === p.id ? (
                    <div key={p.id}>{editor}</div>
                  ) : (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--text)]">
                            {p.nome}
                          </p>
                          <p className="truncate text-xs text-[var(--muted)]">
                            {p.caminho}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {p.ativa ? "Ativa" : "Inativa"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(p)}
                          className="neo-button rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)]"
                        >
                          Editar
                        </button>
                        {ehAdmin && (
                          <button
                            type="button"
                            onClick={() => excluir(p)}
                            disabled={pendente}
                            className="rounded-full bg-[var(--danger)] px-3 py-1.5 text-xs font-bold text-[var(--text)] disabled:opacity-60"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="neo-card p-10 text-center">
          <p className="font-semibold text-[var(--text)]">Nenhuma pasta cadastrada</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Crie a primeira acima para organizar o acervo por departamento.
          </p>
        </div>
      )}

      {!ehAdmin && pastas.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          A exclusão de pastas é exclusiva do administrador. Você pode criar, editar e
          desativar.
        </p>
      )}
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
