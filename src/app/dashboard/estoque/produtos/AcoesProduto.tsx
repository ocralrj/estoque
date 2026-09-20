"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { excluirProduto, renomearProduto } from "@/app/actions/produtos";
import Tooltip from "@/components/ui/Tooltip";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import {
  IconeEditar,
  IconeExcluir,
  IconeMovimentar,
} from "@/components/ui/IconesAcao";

const botaoIcone =
  "neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] disabled:opacity-50";

/**
 * Ações da linha do produto, no padrão das demais tabelas: ícone identifica a
 * ação, dica e `aria-label` dizem o resto. Alterar edita o nome na própria
 * linha; excluir pede confirmação e, com movimentação, desativa em vez de
 * apagar (o histórico não pode ir junto).
 */
export default function AcoesProduto({
  produtoId,
  nome,
  podeMovimentar,
  podeEditar,
  podeExcluir,
  emUso,
}: {
  produtoId: string;
  nome: string;
  podeMovimentar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Tem entrada/saída: excluir vira desativar, para não apagar o histórico. */
  emUso: boolean;
}) {
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const [erro, setErro] = useState("");

  function salvar() {
    const novo = valor.trim();
    if (novo === nome) {
      setEditando(false);
      return;
    }
    if (!novo) {
      setErro("Dê um nome para o produto.");
      return;
    }
    setErro("");
    iniciar(async () => {
      const res = await renomearProduto(produtoId, novo);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  async function excluir() {
    const ok = await confirmar(
      emUso
        ? {
            titulo: `Desativar "${nome}"?`,
            mensagem:
              "Este produto tem movimentações, e apagá-lo levaria o histórico junto. Desativar tira-o da lista mantendo as entradas e saídas.",
            rotuloConfirmar: "Desativar",
          }
        : {
            titulo: `Excluir "${nome}"?`,
            mensagem: "Nenhuma movimentação registrada. A exclusão não pode ser desfeita.",
            rotuloConfirmar: "Excluir",
            perigo: true,
          }
    );
    if (!ok) return;

    setErro("");
    iniciar(async () => {
      const res = await excluirProduto(produtoId);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Dialogo />
      {podeMovimentar && (
        <Tooltip lado="cima" texto="Movimentar">
          <Link
            href={`/dashboard/estoque/movimentacoes/new?product=${produtoId}`}
            aria-label={`Movimentar ${nome}`}
            className={botaoIcone}
          >
            <IconeMovimentar />
          </Link>
        </Tooltip>
      )}
      {podeEditar &&
        (editando ? (
          <span className="flex items-center gap-1">
            <label htmlFor={`renomear-${produtoId}`} className="sr-only">
              Novo nome do produto
            </label>
            <input
              id={`renomear-${produtoId}`}
              autoFocus
              value={valor}
              maxLength={120}
              disabled={pendente}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvar();
                if (e.key === "Escape") {
                  setValor(nome);
                  setErro("");
                  setEditando(false);
                }
              }}
              className="w-32 rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-1.5 text-xs text-[var(--text)]"
            />
            <button
              type="button"
              onClick={salvar}
              disabled={pendente}
              aria-label="Salvar novo nome"
              className="rounded-full bg-[var(--primary)] px-2.5 py-1.5 text-xs font-bold text-[var(--on-accent)] disabled:opacity-50"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                setValor(nome);
                setErro("");
                setEditando(false);
              }}
              className="text-xs font-semibold text-[var(--text-muted)] hover:underline"
            >
              Sair
            </button>
          </span>
        ) : (
          <Tooltip lado="cima" texto="Alterar nome">
            <button
              type="button"
              disabled={pendente}
              onClick={() => {
                setValor(nome);
                setErro("");
                setEditando(true);
              }}
              aria-label={`Alterar nome de ${nome}`}
              className={botaoIcone}
            >
              <IconeEditar />
            </button>
          </Tooltip>
        ))}
      {podeExcluir && (
        <Tooltip
          lado="cima"
          texto={
            emUso
              ? "Tem movimentações: sai da lista, sem apagar o histórico"
              : "Excluir"
          }
        >
          <button
            type="button"
            disabled={pendente}
            onClick={excluir}
            aria-label={`Excluir ${nome}`}
            className={`${botaoIcone} !text-[var(--erro-fg)]`}
          >
            <IconeExcluir />
          </button>
        </Tooltip>
      )}
      {erro && <p className="text-xs text-[var(--erro-fg)]">{erro}</p>}
    </div>
  );
}
