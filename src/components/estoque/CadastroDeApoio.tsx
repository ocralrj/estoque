"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarCategoria,
  criarCategoria,
  definirStatusDaCategoria,
  excluirCategoria,
} from "@/app/actions/categorias";
import {
  atualizarLocalizacao,
  criarLocalizacao,
  definirStatusDaLocalizacao,
  excluirLocalizacao,
} from "@/app/actions/localizacoes";
import Tooltip from "@/components/ui/Tooltip";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { IconeEditar, IconeExcluir, IconeVer } from "@/components/ui/IconesAcao";
import { formatDate } from "@/lib/labels";
import {
  CADASTROS,
  LIMITE_DESCRICAO,
  LIMITE_NOME,
  chaveDoNome,
  type RegistroDeCadastro,
  type TipoDeCadastro,
} from "@/lib/estoque/cadastros";

const ACOES = {
  categoria: {
    criar: criarCategoria,
    atualizar: atualizarCategoria,
    definirStatus: definirStatusDaCategoria,
    excluir: excluirCategoria,
  },
  localizacao: {
    criar: criarLocalizacao,
    atualizar: atualizarLocalizacao,
    definirStatus: definirStatusDaLocalizacao,
    excluir: excluirLocalizacao,
  },
};

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;
type Filtro = "todos" | "ativos" | "inativos";
type Janela =
  | { modo: "criar" }
  | { modo: "editar"; registro: RegistroDeCadastro }
  | { modo: "ver"; registro: RegistroDeCadastro }
  | null;

/** Quantos produtos vinculados a janela de visualização lista antes de resumir. */
const PRODUTOS_NA_JANELA = 12;

/**
 * Tela de um cadastro de apoio do Estoque: categorias ou localizações.
 *
 * As duas têm a mesma forma e as mesmas regras, e por isso a mesma tela. O que
 * muda — textos, ações, permissões — chega pelo `tipo` e pelas props.
 */
export default function CadastroDeApoio({
  tipo,
  registros,
  podeCriar,
  podeEditar,
  podeExcluir,
}: {
  tipo: TipoDeCadastro;
  registros: RegistroDeCadastro[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const cfg = CADASTROS[tipo];
  const acoes = ACOES[tipo];
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { confirmar, Dialogo } = useConfirmacao();

  const [aviso, setAviso] = useState<Aviso>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [janela, setJanela] = useState<Janela>(null);
  const [rascunho, setRascunho] = useState({ nome: "", descricao: "", ativo: true });
  const [erroDaJanela, setErroDaJanela] = useState("");

  const visiveis = useMemo(() => {
    const termo = chaveDoNome(busca);
    return registros.filter((r) => {
      if (filtro === "ativos" && !r.active) return false;
      if (filtro === "inativos" && r.active) return false;
      if (!termo) return true;
      return (
        chaveDoNome(r.name).includes(termo) ||
        chaveDoNome(r.description ?? "").includes(termo)
      );
    });
  }, [registros, busca, filtro]);

  const ativos = registros.filter((r) => r.active).length;

  // Esc fecha a janela, como na confirmação.
  useEffect(() => {
    if (!janela) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setJanela(null);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [janela]);

  function abrirCriacao() {
    setRascunho({ nome: "", descricao: "", ativo: true });
    setErroDaJanela("");
    setJanela({ modo: "criar" });
  }

  function abrirEdicao(r: RegistroDeCadastro) {
    setRascunho({ nome: r.name, descricao: r.description ?? "", ativo: r.active });
    setErroDaJanela("");
    setJanela({ modo: "editar", registro: r });
  }

  function salvar() {
    if (!janela || janela.modo === "ver") return;
    setErroDaJanela("");
    setAviso(null);
    const dados = {
      nome: rascunho.nome,
      descricao: rascunho.descricao,
      ativo: rascunho.ativo,
    };

    iniciar(async () => {
      if (janela.modo === "criar") {
        const res = await acoes.criar(dados);
        if (!res.ok) {
          setErroDaJanela(res.message);
          return;
        }
        setAviso({ tipo: "ok", texto: `${capitalizar(cfg.singular)} "${res.data.nome}" criada.` });
      } else {
        const res = await acoes.atualizar(janela.registro.id, dados);
        if (!res.ok) {
          setErroDaJanela(res.message);
          return;
        }
        setAviso({ tipo: "ok", texto: `${capitalizar(cfg.singular)} atualizada.` });
      }
      setJanela(null);
      router.refresh();
    });
  }

  function mudarStatus(r: RegistroDeCadastro, ativo: boolean) {
    setAviso(null);
    iniciar(async () => {
      const res = await acoes.definirStatus(r.id, ativo);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({
        tipo: "ok",
        texto: ativo
          ? `"${r.name}" voltou a aparecer no cadastro de produto.`
          : `"${r.name}" foi desativada. Os produtos que já a usam continuam com ela.`,
      });
      router.refresh();
    });
  }

  async function excluir(r: RegistroDeCadastro) {
    const quantos = r.produtos.length;

    // Em uso: a exclusão não é oferecida. O que resolve o caso real — "não
    // usamos mais isto" — é desativar, e é isso que o diálogo propõe.
    if (quantos > 0) {
      const desativar = await confirmar({
        titulo: `Não é possível excluir "${r.name}"`,
        mensagem: `Esta ${cfg.singular} está vinculada a ${quantos} produto(s). ${
          r.active
            ? "Desative-a para tirá-la das novas escolhas; os produtos que já a usam continuam com ela."
            : "Ela já está inativa e não aparece nas novas escolhas."
        }`,
        rotuloConfirmar: r.active ? "Desativar" : "Entendi",
        rotuloCancelar: r.active ? "Cancelar" : "Fechar",
      });
      if (desativar && r.active) mudarStatus(r, false);
      return;
    }

    const ok = await confirmar({
      titulo: `Excluir a ${cfg.singular} "${r.name}"?`,
      mensagem: "Nenhum produto a usa. A exclusão não pode ser desfeita.",
      rotuloConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;

    setAviso(null);
    iniciar(async () => {
      const res = await acoes.excluir(r.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: `${capitalizar(cfg.singular)} "${r.name}" excluída.` });
      router.refresh();
    });
  }

  const colunas = podeEditar || podeExcluir ? 5 : 5;

  return (
    <div className="space-y-6">
      <Dialogo />

      {aviso && (
        <p
          role="status"
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
              {registros.length} {registros.length === 1 ? cfg.singular : cfg.plural}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {ativos} ativa(s), {registros.length - ativos} inativa(s).
            </p>
          </div>

          {podeCriar && (
            <button
              type="button"
              onClick={abrirCriacao}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              Nova {cfg.singular}
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
          <div>
            <label htmlFor={`busca-${tipo}`} className={rotulo}>
              Pesquisar
            </label>
            <input
              id={`busca-${tipo}`}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou descrição"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor={`status-${tipo}`} className={rotulo}>
              Status
            </label>
            <select
              id={`status-${tipo}`}
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className={campo}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </div>
        </div>
      </section>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        <div className="neo-flat overflow-x-auto">
          <table className="w-full tabela-mobile">
            <thead className="bg-[var(--neo-flat)] border-b border-[var(--neo-line)]">
              <tr>
                <th className={cabecalho}>Nome</th>
                <th className={cabecalho}>Descrição</th>
                <th className={cabecalho}>Produtos</th>
                <th className={cabecalho}>Status</th>
                <th className={cabecalho}>Ações</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--neo-bg)] divide-y divide-[var(--neo-line)]">
              {visiveis.length > 0 ? (
                visiveis.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--neo-flat)]">
                    <td data-rotulo="Nome" className="px-6 py-4 text-sm font-semibold text-[var(--text)]">
                      {r.name}
                    </td>
                    <td data-rotulo="Descrição" className="px-6 py-4 text-sm text-[var(--text-muted)]">
                      {r.description || "—"}
                    </td>
                    <td data-rotulo="Produtos" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {r.produtos.length}
                    </td>
                    <td data-rotulo="Status" className="px-6 py-4 whitespace-nowrap">
                      {r.active ? (
                        <span className="neo-sit neo-sit--ok">Ativo</span>
                      ) : (
                        <span className="neo-sit neo-sit--aviso">Inativo</span>
                      )}
                    </td>
                    <td data-rotulo="Ações" className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        <Tooltip lado="cima" texto="Visualizar">
                          <button
                            type="button"
                            onClick={() => setJanela({ modo: "ver", registro: r })}
                            aria-label={`Visualizar ${r.name}`}
                            className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)]"
                          >
                            <IconeVer />
                          </button>
                        </Tooltip>
                        {podeEditar && (
                          <Tooltip lado="cima" texto="Editar">
                            <button
                              type="button"
                              disabled={pendente}
                              onClick={() => abrirEdicao(r)}
                              aria-label={`Editar ${r.name}`}
                              className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] disabled:opacity-50"
                            >
                              <IconeEditar />
                            </button>
                          </Tooltip>
                        )}
                        {podeExcluir && (
                          <Tooltip
                            lado="cima"
                            texto={
                              r.produtos.length > 0
                                ? `Em uso por ${r.produtos.length} produto(s): não pode ser excluída`
                                : "Excluir"
                            }
                          >
                            <button
                              type="button"
                              disabled={pendente}
                              onClick={() => excluir(r)}
                              aria-label={`Excluir ${r.name}`}
                              className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--erro-fg)] disabled:opacity-50"
                            >
                              <IconeExcluir />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={colunas} className="px-6 py-4 text-center text-sm text-[var(--text-muted)]">
                    {registros.length === 0
                      ? `Nenhuma ${cfg.singular} cadastrada.`
                      : `Nenhuma ${cfg.singular} encontrada com esses filtros.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {janela && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`janela-${tipo}-titulo`}
          onClick={() => setJanela(null)}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="neo-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            {janela.modo === "ver" ? (
              <Visualizacao
                tipo={tipo}
                registro={janela.registro}
                podeEditar={podeEditar}
                aoEditar={() => abrirEdicao(janela.registro)}
                aoFechar={() => setJanela(null)}
              />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  salvar();
                }}
                className="space-y-4"
              >
                <h2 id={`janela-${tipo}-titulo`} className="text-lg font-bold text-[var(--text)]">
                  {janela.modo === "criar"
                    ? `Nova ${cfg.singular}`
                    : `Editar ${cfg.singular}`}
                </h2>

                <div>
                  <label htmlFor={`nome-${tipo}`} className={rotulo}>
                    Nome da {cfg.singular} *
                  </label>
                  <input
                    id={`nome-${tipo}`}
                    autoFocus
                    value={rascunho.nome}
                    maxLength={LIMITE_NOME}
                    onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                    placeholder={cfg.exemplo}
                    className={campo}
                  />
                </div>

                <div>
                  <label htmlFor={`descricao-${tipo}`} className={rotulo}>
                    Descrição
                  </label>
                  <textarea
                    id={`descricao-${tipo}`}
                    rows={3}
                    value={rascunho.descricao}
                    maxLength={LIMITE_DESCRICAO}
                    onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                    placeholder={cfg.exemploDescricao}
                    className={campo}
                  />
                </div>

                <div>
                  <label htmlFor={`ativo-${tipo}`} className={rotulo}>
                    Status
                  </label>
                  <select
                    id={`ativo-${tipo}`}
                    value={rascunho.ativo ? "ativo" : "inativo"}
                    onChange={(e) =>
                      setRascunho({ ...rascunho, ativo: e.target.value === "ativo" })
                    }
                    className={campo}
                  >
                    <option value="ativo">Ativo — aparece no cadastro de produto</option>
                    <option value="inativo">Inativo — fora das novas escolhas</option>
                  </select>
                  {janela.modo === "editar" &&
                    !rascunho.ativo &&
                    janela.registro.produtos.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Os {janela.registro.produtos.length} produto(s) que já usam esta{" "}
                        {cfg.singular} continuam com ela.
                      </p>
                    )}
                </div>

                {erroDaJanela && (
                  <p className="rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm font-semibold text-[var(--erro-fg)]">
                    {erroDaJanela}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setJanela(null)}
                    className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={pendente || rascunho.nome.trim().length < 2}
                    className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
                  >
                    {pendente ? "Salvando…" : janela.modo === "criar" ? "Criar" : "Salvar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Visualizacao({
  tipo,
  registro,
  podeEditar,
  aoEditar,
  aoFechar,
}: {
  tipo: TipoDeCadastro;
  registro: RegistroDeCadastro;
  podeEditar: boolean;
  aoEditar: () => void;
  aoFechar: () => void;
}) {
  const cfg = CADASTROS[tipo];
  const restantes = registro.produtos.length - PRODUTOS_NA_JANELA;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id={`janela-${tipo}-titulo`} className="text-lg font-bold text-[var(--text)]">
          {registro.name}
        </h2>
        {registro.active ? (
          <span className="neo-sit neo-sit--ok shrink-0">Ativo</span>
        ) : (
          <span className="neo-sit neo-sit--aviso shrink-0">Inativo</span>
        )}
      </div>

      <div>
        <p className={rotulo}>Descrição</p>
        <p className="mt-1 whitespace-pre-line text-sm text-[var(--text)]">
          {registro.description || "Sem descrição."}
        </p>
      </div>

      <div>
        <p className={rotulo}>Produtos com esta {cfg.singular}</p>
        {registro.produtos.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Nenhum produto a usa.</p>
        ) : (
          <ul className="mt-2 space-y-1 rounded-2xl bg-[var(--neo-flat)] px-4 py-3 text-sm text-[var(--text)]">
            {registro.produtos.slice(0, PRODUTOS_NA_JANELA).map((p) => (
              <li key={p.id}>
                <span className="font-mono text-xs text-[var(--muted)]">{p.code}</span>{" "}
                {p.name}
              </li>
            ))}
            {restantes > 0 && (
              <li className="text-xs text-[var(--muted)]">e mais {restantes} produto(s)</li>
            )}
          </ul>
        )}
      </div>

      <p className="border-t border-[var(--stroke)] pt-3 text-xs text-[var(--muted)]">
        Cadastrada em {formatDate(registro.created_at)}
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={aoFechar}
          className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
        >
          Fechar
        </button>
        {podeEditar && (
          <button
            type="button"
            onClick={aoEditar}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
          >
            Editar
          </button>
        )}
      </div>
    </div>
  );
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
const cabecalho =
  "px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider";
