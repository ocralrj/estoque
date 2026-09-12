"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarFuncao, atualizarFuncao, excluirFuncao } from "@/app/actions/funcoes";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { IconeEditar, IconeExcluir } from "@/components/ui/IconesAcao";
import Tooltip from "@/components/ui/Tooltip";
import { papelDoNivel, resumoDoPapel } from "@/lib/atribuicoes";
import { ROLE_LABELS } from "@/lib/labels";
import type { Funcao } from "@/types/modules/admin";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

const VAZIO = { nome: "", descricao: "", nivel: 40, ativo: true, sistema: false };

/**
 * Cadastro de funções, em uma janela.
 *
 * Fica aqui, e não numa tela própria, porque função só é interessante ao lado
 * das pessoas que a ocupam: quem abre isto está olhando a lista de usuários e
 * percebeu que falta uma função. Uma página separada obrigaria a sair da lista,
 * cadastrar, e voltar para procurar de novo onde estava.
 *
 * O nível é o campo que decide tudo. De 1 a 99, MENOR é MAIS ALTO — a mesma
 * escala dos grupos — e é dele que sai o papel de onde a função herda as
 * permissões. Por isso o formulário mostra, ao vivo, o que o nível escolhido
 * vai conceder: escolher "25" sem saber que isso significa Almoxarife seria
 * conceder acesso às cegas.
 */
export default function GerenciarFuncoes({
  funcoes,
  aviso: avisoInicial,
  meuNivelMinimo,
  aoFechar,
}: {
  funcoes: Funcao[];
  /** Mensagem de migração pendente, quando a tabela ainda não existe. */
  aviso: string | null;
  /** O nível mais alto que quem está editando pode conceder. */
  meuNivelMinimo: number;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { confirmar, Dialogo } = useConfirmacao();
  const [aviso, setAviso] = useState<Aviso>(
    avisoInicial ? { tipo: "erro", texto: avisoInicial } : null
  );
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  function abrirCriacao() {
    setForm({ ...VAZIO, nivel: Math.max(40, meuNivelMinimo) });
    setEditando(null);
    setCriando(true);
    setAviso(null);
  }

  function abrirEdicao(f: Funcao) {
    setForm({
      nome: f.nome,
      descricao: f.descricao ?? "",
      nivel: f.nivel,
      ativo: f.ativo,
      sistema: f.sistema,
    });
    setCriando(false);
    setEditando(f.id);
    setAviso(null);
  }

  function fecharFormulario() {
    setCriando(false);
    setEditando(null);
    setForm(VAZIO);
  }

  function salvar() {
    iniciar(async () => {
      const { sistema: _sistema, ...dados } = form;
      const res = editando
        ? await atualizarFuncao(editando, dados)
        : await criarFuncao(dados);

      if (res.ok) {
        setAviso({
          tipo: "ok",
          texto: editando ? "Função atualizada." : "Função criada.",
        });
        fecharFormulario();
        router.refresh();
      } else {
        setAviso({ tipo: "erro", texto: res.message });
      }
    });
  }

  function remover(f: Funcao) {
    iniciar(async () => {
      const ok = await confirmar({
        titulo: `Excluir a função "${f.nome}"?`,
        mensagem:
          "A função some do cadastro. Quem a ocupava não perde acesso — o papel já gravado continua valendo —, mas fica sem função até receber outra.",
        rotuloConfirmar: "Excluir função",
      });
      if (!ok) return;

      const res = await excluirFuncao(f.id);
      if (res.ok) {
        setAviso({ tipo: "ok", texto: `Função "${f.nome}" excluída.` });
        router.refresh();
      } else {
        setAviso({ tipo: "erro", texto: res.message });
      }
    });
  }

  const papelDoFormulario = papelDoNivel(form.nivel);
  const nivelAcimaDoPermitido = !form.sistema && form.nivel < meuNivelMinimo;
  const nomeValido = form.nome.trim().length >= 2;
  const formValido =
    nomeValido && form.nivel >= 1 && form.nivel <= 99 && !nivelAcimaDoPermitido;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gerenciar funções"
      onClick={aoFechar}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
    >
      <Dialogo />
      <div
        onClick={(e) => e.stopPropagation()}
        className="neo-card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">Funções</h2>
            <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">
              A função diz onde a pessoa está na hierarquia. O nível vai de 1
              (mais alto) a 99, e é ele que define as permissões herdadas.
            </p>
          </div>
          <button
            type="button"
            onClick={criando ? fecharFormulario : abrirCriacao}
            className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)]"
          >
            {criando ? "Cancelar" : "Nova função"}
          </button>
        </div>

        {(criando || editando) && (
          <div className="mt-5 rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="funcao-nome" className={rotulo}>
                  Nome *
                </label>
                <input
                  id="funcao-nome"
                  value={form.nome}
                  autoFocus
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Coordenador, Supervisor, Diretoria…"
                  className={campo}
                />
              </div>
              <div>
                <label htmlFor="funcao-nivel" className={rotulo}>
                  Nível hierárquico *
                </label>
                <input
                  id="funcao-nivel"
                  type="number"
                  min={1}
                  max={99}
                  value={form.nivel}
                  disabled={form.sistema}
                  onChange={(e) =>
                    setForm({ ...form, nivel: Number(e.target.value) || 0 })
                  }
                  className={`${campo} disabled:opacity-60`}
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {form.sistema ? (
                    <>
                      Função do sistema: o nível não muda, porque metade das
                      permissões do sistema herda dele. O nome, sim.
                    </>
                  ) : (
                    <>
                      Menor manda em maior. Herda as permissões de{" "}
                      <strong className="font-semibold">
                        {ROLE_LABELS[papelDoFormulario]}
                      </strong>
                      .
                    </>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="funcao-descricao" className={rotulo}>
                  Descrição
                </label>
                <input
                  id="funcao-descricao"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="O que esta função responde na empresa"
                  className={campo}
                />
              </div>
              {editando && !form.sistema && (
                <label className="flex items-center gap-2 text-sm text-[var(--text)] sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  />
                  Ativa — funções desativadas não aparecem para escolher
                </label>
              )}
            </div>

            <p className="mt-3 rounded-xl bg-[var(--neo-flat)] px-3 py-2 text-xs text-[var(--text-muted)]">
              {resumoDoPapel(papelDoFormulario)}
            </p>

            {nivelAcimaDoPermitido && (
              <p className="mt-2 text-xs text-[var(--erro-fg)]">
                Você não pode criar uma função acima da sua: o nível mais alto
                permitido para você é {meuNivelMinimo}.
              </p>
            )}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={fecharFormulario}
                className="neo-button rounded-full px-5 py-2 text-sm font-bold text-[var(--text)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={pendente || !formValido}
                className="rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-bold text-[var(--on-accent)] disabled:opacity-50"
              >
                {pendente ? "Salvando…" : editando ? "Salvar" : "Criar função"}
              </button>
            </div>
          </div>
        )}

        {aviso && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              aviso.tipo === "ok"
                ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
                : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
            }`}
          >
            {aviso.texto}
          </p>
        )}

        <ul className="mt-5 divide-y divide-[var(--neo-line)]">
          {funcoes.length === 0 && (
            <li className="py-6 text-center text-sm text-[var(--text-muted)]">
              Nenhuma função cadastrada ainda.
            </li>
          )}

          {funcoes.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--text)]">
                  {f.nome}
                  <span className="rounded-full bg-[var(--neo-flat)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                    nível {f.nivel}
                  </span>
                  {f.sistema && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      do sistema
                    </span>
                  )}
                  {!f.ativo && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      desativada
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {f.descricao || resumoDoPapel(f.papel_base)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Tooltip lado="cima" texto={`Editar a função ${f.nome}`}>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => abrirEdicao(f)}
                    aria-label={`Editar a função ${f.nome}`}
                    className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] disabled:opacity-50"
                  >
                    <IconeEditar />
                  </button>
                </Tooltip>

                {/* As quatro de sistema não mostram o botão de excluir: o banco
                    recusaria de qualquer forma, e um botão que só serve para
                    produzir um erro não é um botão. */}
                {!f.sistema && (
                  <Tooltip lado="cima" texto={`Excluir a função ${f.nome}`}>
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => remover(f)}
                      aria-label={`Excluir a função ${f.nome}`}
                      className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--erro-fg)] disabled:opacity-50"
                    >
                      <IconeExcluir />
                    </button>
                  </Tooltip>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={aoFechar}
            className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]";
