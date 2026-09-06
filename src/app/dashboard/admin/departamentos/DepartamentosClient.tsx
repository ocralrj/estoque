"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarDepartamento,
  atualizarDepartamento,
  excluirDepartamento,
  type Departamento,
} from "@/app/actions/departamentos";
import { formatDate } from "@/lib/labels";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

export default function DepartamentosClient({
  inicial,
  ehAdmin,
}: {
  inicial: Departamento[];
  ehAdmin: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const [novo, setNovo] = useState({ nome: "", descricao: "" });
  const [rascunho, setRascunho] = useState({
    nome: "",
    descricao: "",
    ativo: true,
    propagar: true,
  });

  function abrirEdicao(d: Departamento) {
    setEditando(d.id);
    setCriando(false);
    setAviso(null);
    setRascunho({
      nome: d.nome,
      descricao: d.descricao ?? "",
      ativo: d.ativo,
      propagar: true,
    });
  }

  function salvarNovo() {
    setAviso(null);
    iniciar(async () => {
      const res = await criarDepartamento(novo.nome, novo.descricao);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setNovo({ nome: "", descricao: "" });
      setCriando(false);
      setAviso({ tipo: "ok", texto: `Departamento "${res.data.nome}" criado.` });
      router.refresh();
    });
  }

  function salvarEdicao(id: string, nomeAtual: string) {
    setAviso(null);
    iniciar(async () => {
      const res = await atualizarDepartamento(
        id,
        rascunho.nome,
        rascunho.descricao,
        rascunho.ativo,
        rascunho.propagar
      );
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setEditando(null);
      setAviso({
        tipo: "ok",
        texto:
          res.data.registrosAtualizados > 0
            ? `Departamento atualizado e ${res.data.registrosAtualizados} registro(s) renomeado(s).`
            : nomeAtual !== rascunho.nome.trim()
              ? "Departamento renomeado. Os registros antigos mantiveram o nome anterior."
              : "Departamento atualizado.",
      });
      router.refresh();
    });
  }

  function excluir(d: Departamento) {
    if (!window.confirm(`Excluir o departamento "${d.nome}"?`)) return;
    setAviso(null);
    iniciar(async () => {
      const res = await excluirDepartamento(d.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: "Departamento excluído." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
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
              {inicial.length} departamento(s)
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Alimentam o campo &quot;Departamento de origem&quot; do GED.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCriando((c) => !c);
              setEditando(null);
            }}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white shadow-[10px_10px_18px_rgba(122,109,216,0.28)]"
          >
            {criando ? "Cancelar" : "Novo departamento"}
          </button>
        </div>

        {criando && (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Nome *</label>
              <input
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Ex.: Compras"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Descrição</label>
              <input
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                placeholder="O que este departamento arquiva"
                className={campo}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={salvarNovo}
                disabled={pendente}
                className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pendente ? "Salvando…" : "Criar"}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {inicial.map((d) => (
          <div key={d.id} className="neo-card p-5">
            {editando === d.id ? (
              <div className="space-y-3">
                <div>
                  <label className={rotulo}>Nome</label>
                  <input
                    value={rascunho.nome}
                    onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo}>Descrição</label>
                  <input
                    value={rascunho.descricao}
                    onChange={(e) =>
                      setRascunho({ ...rascunho, descricao: e.target.value })
                    }
                    className={campo}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={rascunho.ativo}
                    onChange={(e) => setRascunho({ ...rascunho, ativo: e.target.checked })}
                  />
                  Ativo (aparece nas listas do GED)
                </label>

                {rascunho.nome.trim() !== d.nome && (
                  <label className="flex items-start gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={rascunho.propagar}
                      onChange={(e) =>
                        setRascunho({ ...rascunho, propagar: e.target.checked })
                      }
                      className="mt-1"
                    />
                    <span>
                      Renomear também nos documentos e pastas já cadastrados.
                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Sem isso, o histórico continua com o nome antigo — o que pode
                        ser o desejado se o departamento mudou de nome ao longo do tempo.
                      </span>
                    </span>
                  </label>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => salvarEdicao(d.id, d.nome)}
                    disabled={pendente}
                    className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {pendente ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-[var(--text)]">{d.nome}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      d.ativo
                        ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                        : "bg-[var(--surface-strong)] text-[var(--muted)]"
                    }`}
                  >
                    {d.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                {d.descricao && (
                  <p className="mt-2 text-sm text-[var(--muted)]">{d.descricao}</p>
                )}

                <p className="mt-3 border-t border-[var(--stroke)] pt-3 text-xs text-[var(--muted)]">
                  Criado em {formatDate(d.created_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(d)}
                    className="neo-button rounded-full px-4 py-2 text-xs font-bold text-[var(--text)]"
                  >
                    Editar
                  </button>
                  {ehAdmin && (
                    <button
                      type="button"
                      onClick={() => excluir(d)}
                      disabled={pendente}
                      className="rounded-full bg-[var(--danger)] px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {inicial.length === 0 && (
        <p className="neo-card p-10 text-center text-sm text-[var(--muted)]">
          Nenhum departamento cadastrado. Crie o primeiro acima.
        </p>
      )}
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
