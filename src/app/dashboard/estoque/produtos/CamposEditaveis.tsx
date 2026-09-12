"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  definirCategoria,
  definirLocalizacao,
} from "@/app/actions/produtos";
import Tooltip from "@/components/ui/Tooltip";

/** Categoria ou localização como a lista de produtos a recebe. */
export interface CadastroSimples {
  id: string;
  name: string;
  active: boolean;
}

/**
 * O que o seletor oferece: os cadastros ativos, mais o atual se ele estiver
 * inativo. Sem o atual, o <select> abriria mostrando outra opção como se fosse
 * a do produto. Ele aparece desabilitado: continua sendo do produto, mas não
 * pode ser escolhido de novo.
 */
function opcoes(lista: CadastroSimples[], atualId: string | null) {
  return lista.filter((c) => c.active || c.id === atualId);
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
  categorias: CadastroSimples[];
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
          setErro("");
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
        {opcoes(categorias, categoriaId).map((c) => (
          <option key={c.id} value={c.id} disabled={!c.active}>
            {c.active ? c.name : `${c.name} (inativa)`}
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
 * Localização editável na linha, escolhida entre as cadastradas.
 *
 * O ganho não é editar um produto: é poder mudar de lugar todos os que estão
 * no mesmo local de uma vez ("Aplicar aos N"). O nome não é mais digitado aqui
 * — ele vem de Estoque → Localizações, e por isso não se multiplica em grafias.
 */
export function CelulaLocalizacao({
  produtoId,
  localId,
  local,
  locais,
  locaisUsados,
  editavel,
}: {
  produtoId: string;
  localId: string | null;
  local: string | null;
  /** Localizações cadastradas, com o status. */
  locais: CadastroSimples[];
  /** Locais em uso e quantos produtos há em cada um. */
  locaisUsados: { local: string; total: number }[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(localId ?? "");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  const quantosDividem =
    locaisUsados.find((l) => l.local === local)?.total ?? 0;
  const disponiveis = opcoes(locais, localId);
  const semAtivas = !locais.some((l) => l.active);

  function salvar(emTodos: boolean) {
    setErro("");
    if (!emTodos && valor === (localId ?? "")) {
      setEditando(false);
      return;
    }
    iniciar(async () => {
      const res = await definirLocalizacao(produtoId, valor || null, emTodos);
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
            ? `${quantosDividem} produtos neste local. Pressione para alterar — dá para mudar todos de uma vez.`
            : "Pressione para alterar a localização"
        }
      >
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            setValor(localId ?? "");
            setErro("");
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
      <select
        autoFocus
        value={valor}
        disabled={pendente}
        aria-label="Localização do produto"
        onChange={(e) => setValor(e.target.value)}
        className="w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]"
      >
        <option value="">Sem localização</option>
        {disponiveis.map((l) => (
          <option key={l.id} value={l.id} disabled={!l.active}>
            {l.active ? l.name : `${l.name} (inativa)`}
          </option>
        ))}
      </select>

      {semAtivas && (
        <p className="text-xs text-[var(--text-muted)]">
          Nenhuma localização ativa. Cadastre em Estoque → Localizações.
        </p>
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

        {/* Aparece quando o lugar é dividido: é o caso em que mudar só um
            deixaria os outros para trás. */}
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
 * Código do produto, só leitura.
 *
 * O código é gerado pelo banco no cadastro e não muda depois (gatilhos da
 * 042). Fica em pastilha estática — a mesma forma da linha, sem parecer botão.
 */
export function CelulaCodigo({ codigo }: { codigo: string }) {
  return <span className="neo-sit text-[var(--text)]">{codigo}</span>;
}
