"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  definirCategoria,
  definirCodigo,
  definirLocalizacao,
} from "@/app/actions/produtos";
import Tooltip from "@/components/ui/Tooltip";

export interface CategoriaSimples {
  id: string;
  name: string;
}

/** Compara sem acento e sem caixa: é aí que a divergência de nome nasce. */
function normalizar(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Categoria editável na própria linha.
 *
 * Em repouso é só o texto; o seletor abre no clique. Uma tabela com um
 * <select> por linha vira um formulário, e a lista deixa de se ler de relance.
 */
export function CelulaCategoria({
  produtoId,
  categoriaId,
  nome,
  categorias,
  editavel,
}: {
  produtoId: string;
  categoriaId: string | null;
  nome: string | null;
  categorias: CategoriaSimples[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  if (!editavel) {
    return <span className="text-[var(--text-muted)]">{nome || "—"}</span>;
  }

  if (editando) {
    return (
      <select
        autoFocus
        defaultValue={categoriaId ?? ""}
        disabled={pendente}
        aria-label="Categoria do produto"
        onBlur={() => setEditando(false)}
        onChange={(e) => {
          const valor = e.target.value;
          setEditando(false);
          if (valor === (categoriaId ?? "")) return;
          iniciar(async () => {
            const res = await definirCategoria(produtoId, valor || null);
            if (!res.ok) {
              setErro(res.message);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-1.5 text-xs text-[var(--text)]"
      >
        <option value="">Sem categoria</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={pendente}
        onClick={() => setEditando(true)}
        aria-label={`Categoria: ${nome || "sem categoria"}. Pressione para alterar`}
        className={`neo-button rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
          nome ? "text-[var(--text)]" : "text-[var(--text-muted)]"
        }`}
      >
        {pendente ? "Salvando…" : nome || "Sem categoria"}
      </button>
      {erro && <p className="mt-1 text-xs text-[var(--erro-fg)]">{erro}</p>}
    </>
  );
}

/**
 * Localização editável, com o que já existe à mão.
 *
 * O ganho não é editar um produto: é poder corrigir o lugar em todos de uma
 * vez. "Armário na Sala do TI" e "Armário no departamento de TI" são a mesma
 * prateleira em duas linhas do relatório, e arrumar de um em um é justamente o
 * trabalho que produziu a divergência.
 */
export function CelulaLocalizacao({
  produtoId,
  local,
  locaisDisponiveis = [],
  locaisUsados,
  editavel,
}: {
  produtoId: string;
  local: string | null;
  /** Locais cadastrados no sistema (tabela locations). */
  locaisDisponiveis?: { id: string; name: string }[];
  /** Locais em uso e quantos produtos há em cada um. */
  locaisUsados: { local: string; total: number }[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(local ?? "");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  const quantosDividem =
    locaisUsados.find((l) => l.local === local)?.total ?? 0;

  const todosLocaisNomes = Array.from(
    new Set([
      ...locaisDisponiveis.map((l) => l.name),
      ...locaisUsados.map((l) => l.local),
    ])
  );

  const semelhantes = valor.trim()
    ? locaisUsados
        .filter(
          (l) =>
            normalizar(l.local).includes(normalizar(valor)) &&
            l.local !== valor.trim()
        )
        .slice(0, 4)
    : [];

  function salvar(emTodos: boolean) {
    setErro("");
    iniciar(async () => {
      const res = await definirLocalizacao(produtoId, valor, emTodos);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (!editavel) {
    return <span className="text-[var(--text-muted)]">{local || "—"}</span>;
  }

  if (!editando) {
    return (
      <Tooltip
        lado="cima"
        texto={
          quantosDividem > 1
            ? `${quantosDividem} produtos neste local. Pressione para alterar — dá para corrigir todos de uma vez.`
            : "Pressione para alterar a localização"
        }
      >
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            setValor(local ?? "");
            setEditando(true);
          }}
          className={`neo-button rounded-full px-3 py-1.5 text-left text-xs font-bold disabled:opacity-50 ${
            local ? "text-[var(--text)]" : "text-[var(--text-muted)]"
          }`}
        >
          {pendente ? "Salvando…" : local || "Sem localização"}
          {quantosDividem > 1 && (
            <span className="ml-1 font-normal text-[var(--text-muted)]">
              ·{quantosDividem}
            </span>
          )}
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="min-w-[14rem] space-y-2">
      <input
        autoFocus
        value={valor}
        list="locais-produtos"
        onChange={(e) => setValor(e.target.value)}
        placeholder="ex: Almoxarifado Central, Depósito 1"
        className="w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]"
      />
      <datalist id="locais-produtos">
        {todosLocaisNomes.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>

      {semelhantes.length > 0 && (
        <ul className="space-y-0.5">
          {semelhantes.map((l) => (
            <li key={l.local}>
              <button
                type="button"
                onClick={() => setValor(l.local)}
                className="text-left text-xs text-[var(--primary)] hover:underline"
              >
                {l.local}{" "}
                <span className="text-[var(--text-muted)]">
                  ({l.total} produto{l.total > 1 ? "s" : ""})
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="text-xs text-[var(--erro-fg)]">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => salvar(false)}
          disabled={pendente}
          className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-[var(--on-accent)] disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Só este"}
        </button>

        {/* Aparece quando o lugar é dividido: é o caso em que corrigir só um
            deixaria a divergência de pé, agora com um nome a mais. */}
        {quantosDividem > 1 && local && (
          <button
            type="button"
            onClick={() => salvar(true)}
            disabled={pendente}
            className="rounded-full bg-[var(--ok-solid)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Aplicar aos {quantosDividem}
          </button>
        )}

        <button
          type="button"
          onClick={() => setEditando(false)}
          className="text-xs font-semibold text-[var(--text-muted)] hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Código editável na linha.
 *
 * Em maiúsculas sempre: "sec001" e "SEC001" seriam dois códigos diferentes
 * para o banco e o mesmo para quem procura na prateleira. Trocar o código não
 * afeta o histórico — as movimentações apontam para o id.
 */
export function CelulaCodigo({
  produtoId,
  codigo,
  editavel,
}: {
  produtoId: string;
  codigo: string;
  editavel: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(codigo);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  if (!editavel) {
    return <span className="font-medium text-[var(--text)]">{codigo}</span>;
  }

  if (!editando) {
    return (
      <>
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            setValor(codigo);
            setErro("");
            setEditando(true);
          }}
          aria-label={`Código ${codigo}. Pressione para alterar`}
          className="neo-button rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)] disabled:opacity-50"
        >
          {pendente ? "Salvando…" : codigo}
        </button>
        {erro && <p className="mt-1 text-xs text-[var(--erro-fg)]">{erro}</p>}
      </>
    );
  }

  function salvar() {
    setErro("");
    if (valor.trim().toUpperCase() === codigo) {
      setEditando(false);
      return;
    }
    iniciar(async () => {
      const res = await definirCodigo(produtoId, valor);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <div className="min-w-[9rem] space-y-2">
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") setEditando(false);
        }}
        className="w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 font-mono text-sm uppercase text-[var(--text)]"
      />

      {erro && <p className="text-xs text-[var(--erro-fg)]">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pendente || valor.trim().length < 2}
          className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-[var(--on-accent)] disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="text-xs font-semibold text-[var(--text-muted)] hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
