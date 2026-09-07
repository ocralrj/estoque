"use client";

import SuggestWithAi from "@/components/ai/SuggestWithAi";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarCargo, criarCargo, excluirCargo } from "@/app/actions/cargos";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { formatDate } from "@/lib/labels";
import type { Cargo } from "@/types/modules/admin";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

/**
 * Cargos da empresa.
 *
 * O cargo diz o que a pessoa faz; o grupo diz o que ela pode. São coisas
 * separadas de propósito — se estivessem juntas, promover alguém seria mexer
 * em segurança, e mexer em segurança seria promover alguém.
 */
export default function CargosClient({
  inicial,
  ocupantes,
  podeCriar,
  podeEditar,
  podeExcluir,
}: {
  inicial: Cargo[];
  /** Quantas pessoas ocupam cada cargo, para a tela avisar antes de excluir. */
  ocupantes: Record<string, number>;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { confirmar, Dialogo } = useConfirmacao();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const [novo, setNovo] = useState({ nome: "", descricao: "" });
  const [rascunho, setRascunho] = useState({ nome: "", descricao: "", ativo: true });

  function salvarNovo() {
    setAviso(null);
    iniciar(async () => {
      const res = await criarCargo(novo.nome, novo.descricao);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setNovo({ nome: "", descricao: "" });
      setCriando(false);
      setAviso({ tipo: "ok", texto: `Cargo "${res.data.nome}" criado.` });
      router.refresh();
    });
  }

  function salvarEdicao(id: string) {
    setAviso(null);
    iniciar(async () => {
      const res = await atualizarCargo(
        id,
        rascunho.nome,
        rascunho.descricao,
        rascunho.ativo
      );
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setEditando(null);
      setAviso({ tipo: "ok", texto: "Cargo atualizado." });
      router.refresh();
    });
  }

  async function excluir(c: Cargo) {
    const quantos = ocupantes[c.id] ?? 0;
    const ok = await confirmar({
      titulo: `Excluir o cargo "${c.nome}"?`,
      mensagem:
        quantos > 0
          ? `${quantos} pessoa(s) ocupam este cargo. Elas não perdem acesso, mas ficam sem cargo. Desativar costuma ser o que se quer quando o cargo só saiu de uso.`
          : "Ninguém ocupa este cargo no momento.",
      rotuloConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;

    setAviso(null);
    iniciar(async () => {
      const res = await excluirCargo(c.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: "Cargo excluído." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Dialogo />

      {aviso && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <section className="neo-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">
              {inicial.length} cargo(s)
            </h2>
            <p className="text-sm text-[var(--muted)]">
              O cargo diz o que a pessoa faz. O que ela pode fazer no sistema
              continua vindo do grupo.
            </p>
          </div>

          {podeCriar && (
            <button
              type="button"
              onClick={() => {
                setCriando((c) => !c);
                setEditando(null);
              }}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              {criando ? "Cancelar" : "Novo cargo"}
            </button>
          )}
        </div>

        {criando && (
          <div className="mt-4 grid grid-cols-1 items-start gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 sm:grid-cols-2">
            <div>
              <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-2">
                <label className={rotulo}>Nome *</label>
              </div>
              <input
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Ex.: Auxiliar administrativo"
                className={campo}
              />
            </div>
            <div>
              <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-2">
                <label className={rotulo}>Descrição</label>
                {/* A sugestão parte do nome do cargo: pedir à IA que descreva
                    um cargo sem saber qual devolveria texto genérico. */}
                <SuggestWithAi
                  fieldType="descricao_cargo"
                  whatToSuggest="descrições curtas de cargos, dizendo as responsabilidades principais de quem o ocupa"
                  domain="ERP OCRAL - Administração de pessoas"
                  currentValue={novo.descricao}
                  disabled={!novo.nome.trim()}
                  label={novo.nome.trim() ? "Sugira com IA" : "Escreva o nome primeiro"}
                  context={{ cargo: novo.nome }}
                  onAccept={(texto) => setNovo({ ...novo, descricao: texto })}
                />
              </div>
              <input
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                placeholder="O que se faz neste cargo"
                className={campo}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={salvarNovo}
                disabled={pendente || !novo.nome.trim()}
                className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
              >
                {pendente ? "Salvando…" : "Criar"}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {inicial.map((c) => (
          <div key={c.id} className="neo-card p-5">
            {editando === c.id ? (
              <div className="space-y-3">
                <div>
                  <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-2">
                    <label className={rotulo}>Nome</label>
                  </div>
                  <input
                    value={rascunho.nome}
                    onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                    className={campo}
                  />
                </div>
                <div>
                  <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-2">
                    <label className={rotulo}>Descrição</label>
                    <SuggestWithAi
                      fieldType="descricao_cargo"
                      whatToSuggest="descrições curtas de cargos, dizendo as responsabilidades principais de quem o ocupa"
                      domain="ERP OCRAL - Administração de pessoas"
                      currentValue={rascunho.descricao}
                      disabled={!rascunho.nome.trim()}
                      context={{ cargo: rascunho.nome }}
                      onAccept={(texto) =>
                        setRascunho({ ...rascunho, descricao: texto })
                      }
                    />
                  </div>
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
                    onChange={(e) =>
                      setRascunho({ ...rascunho, ativo: e.target.checked })
                    }
                  />
                  Ativo (aparece nas listas de escolha)
                </label>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => salvarEdicao(c.id)}
                    disabled={pendente}
                    className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
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
                  <h3 className="text-lg font-bold text-[var(--text)]">{c.nome}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      c.ativo
                        ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                        : "bg-[var(--surface-strong)] text-[var(--muted)]"
                    }`}
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                {c.descricao && (
                  <p className="mt-2 text-sm text-[var(--muted)]">{c.descricao}</p>
                )}

                <p className="mt-3 text-sm font-semibold text-[var(--text)]">
                  {ocupantes[c.id] ?? 0} pessoa(s) neste cargo
                </p>

                <p className="mt-3 border-t border-[var(--stroke)] pt-3 text-xs text-[var(--muted)]">
                  Criado em {formatDate(c.created_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(c.id);
                        setCriando(false);
                        setRascunho({
                          nome: c.nome,
                          descricao: c.descricao ?? "",
                          ativo: c.ativo,
                        });
                      }}
                      className="neo-button rounded-full px-4 py-2 text-xs font-bold text-[var(--text)]"
                    >
                      Editar
                    </button>
                  )}
                  {podeExcluir && (
                    <button
                      type="button"
                      onClick={() => excluir(c)}
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
          Nenhum cargo cadastrado. Crie o primeiro acima.
        </p>
      )}
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
