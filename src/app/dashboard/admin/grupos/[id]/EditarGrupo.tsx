"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateGroup } from "@/app/actions/groups";

/**
 * Nome e descrição do grupo, editados na própria tela.
 *
 * O botão "Editar" apontava para uma rota que não existe e devolvia 404. Em vez
 * de criar mais uma página para dois campos, a edição acontece aqui: são os
 * mesmos dois campos que a tela já mostra, e não há nada a carregar.
 */
export default function EditarGrupo({
  grupoId,
  nome,
  descricao,
  ehDoSistema,
}: {
  grupoId: string;
  nome: string;
  descricao: string | null;
  /** Grupo base da hierarquia: o nome é referência e não se muda. */
  ehDoSistema: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [rascunho, setRascunho] = useState({ nome, descricao: descricao ?? "" });

  function salvar() {
    setErro("");
    if (!rascunho.nome.trim()) {
      setErro("O nome do grupo é obrigatório.");
      return;
    }

    iniciar(async () => {
      try {
        const dados = new FormData();
        dados.append("name", rascunho.nome.trim());
        dados.append("description", rascunho.descricao.trim());
        await updateGroup(grupoId, dados);
        setAberto(false);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)]"
      >
        Editar
      </button>
    );
  }

  return (
    <div className="neo-card w-full max-w-md space-y-3 p-4">
      <div>
        <label htmlFor="grupo-nome" className={rotulo}>
          Nome
        </label>
        <input
          id="grupo-nome"
          value={rascunho.nome}
          disabled={ehDoSistema}
          onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
          className={campo}
        />
        {ehDoSistema && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Este grupo sustenta a hierarquia: o nome é referência do sistema e não
            muda. A descrição você pode ajustar.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="grupo-descricao" className={rotulo}>
          Descrição
        </label>
        <input
          id="grupo-descricao"
          value={rascunho.descricao}
          onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
          placeholder="O que este grupo faz na empresa"
          className={campo}
        />
      </div>

      {erro && (
        <p className="rounded-2xl bg-[var(--erro-bg)] px-3 py-2 text-sm text-[var(--erro-fg)]">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRascunho({ nome, descricao: descricao ?? "" });
            setAberto(false);
            setErro("");
          }}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-60";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
