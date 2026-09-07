"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirPermissoesDoGrupo } from "@/app/actions/groups";
import Tooltip from "@/components/ui/Tooltip";
import {
  EXPLICACAO_DA_ACAO,
  ORDEM_DAS_ACOES,
  nomeDaAcao,
  nomeDoModulo,
  nomeDoRecurso,
} from "@/lib/catalogo-permissoes";

export interface PermissaoDoCatalogo {
  id: string;
  module: string;
  resource: string;
  action: string;
  description: string | null;
}

/**
 * O que o grupo pode fazer, em uma matriz de recursos por ações.
 *
 * A tela anterior era uma pastilha por permissão, cada uma dentro do seu
 * próprio formulário: cada clique recarregava a página, e marcar as trinta
 * permissões de um perfil novo custava trinta recarregamentos. Aqui as
 * alterações ficam na tela até a pessoa salvar, e vão ao servidor de uma vez —
 * o que também evita deixar o grupo pela metade se uma das gravações falhar.
 *
 * As linhas são os recursos e as colunas as ações, porque a pergunta de quem
 * administra é sempre "o que este grupo faz com produtos?", e não "quem pode
 * criar?". Uma célula vazia significa que a ação não existe para aquele
 * recurso — imprimir um alerta não é uma coisa que exista para desmarcar.
 */
export default function MatrizDePermissoes({
  grupoId,
  catalogo,
  concedidas,
  podeEditar,
}: {
  grupoId: string;
  catalogo: PermissaoDoCatalogo[];
  concedidas: string[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(concedidas));
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const salvo = useMemo(() => new Set(concedidas), [concedidas]);
  const alterado =
    marcadas.size !== salvo.size || Array.from(marcadas).some((id) => !salvo.has(id));

  // Agrupa o catálogo em módulo → recurso → ação, e descobre quais colunas
  // existem de fato: mostrar as dez ações possíveis em todos os recursos
  // encheria a tela de células vazias.
  const { modulos, acoesUsadas } = useMemo(() => {
    const mapa = new Map<string, Map<string, Map<string, PermissaoDoCatalogo>>>();
    const acoes = new Set<string>();

    for (const p of catalogo) {
      acoes.add(p.action);
      if (!mapa.has(p.module)) mapa.set(p.module, new Map());
      const recursos = mapa.get(p.module)!;
      if (!recursos.has(p.resource)) recursos.set(p.resource, new Map());
      recursos.get(p.resource)!.set(p.action, p);
    }

    const ordenadas = ORDEM_DAS_ACOES.filter((a) => acoes.has(a)).concat(
      Array.from(acoes).filter((a) => !ORDEM_DAS_ACOES.includes(a)).sort()
    );

    return { modulos: mapa, acoesUsadas: ordenadas };
  }, [catalogo]);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function definirVarias(ids: string[], ligar: boolean) {
    setMarcadas((atual) => {
      const proximo = new Set(atual);
      for (const id of ids) {
        if (ligar) proximo.add(id);
        else proximo.delete(id);
      }
      return proximo;
    });
  }

  function idsDoModulo(modulo: string): string[] {
    const recursos = modulos.get(modulo);
    if (!recursos) return [];
    return Array.from(recursos.values()).flatMap((acoes) =>
      Array.from(acoes.values()).map((p) => p.id)
    );
  }

  function salvar() {
    setAviso(null);
    iniciar(async () => {
      const res = await definirPermissoesDoGrupo(grupoId, Array.from(marcadas));
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({
        tipo: "ok",
        texto:
          res.total === 0
            ? "Grupo salvo sem nenhuma permissão. Quem estiver nele não verá as telas do sistema."
            : `${res.total} permissão(ões) salvas. Quem está no grupo passa a ver isto no próximo carregamento.`,
      });
      router.refresh();
    });
  }

  const todosOsIds = catalogo.map((p) => p.id);

  return (
    <section className="neo-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">O que este grupo pode fazer</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {marcadas.size} de {catalogo.length} permissões marcadas. Quem não tem a
            permissão não vê a opção na tela — e a ação é recusada também no servidor.
          </p>
        </div>

        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => definirVarias(todosOsIds, true)}
              className="neo-button rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)]"
            >
              Marcar todas
            </button>
            <button
              type="button"
              onClick={() => definirVarias(todosOsIds, false)}
              className="neo-button rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)]"
            >
              Desmarcar todas
            </button>
          </div>
        )}
      </div>

      {aviso && (
        <p
          className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-5 space-y-6">
        {Array.from(modulos.entries()).map(([modulo, recursos]) => {
          const ids = idsDoModulo(modulo);
          const marcadasNoModulo = ids.filter((id) => marcadas.has(id)).length;

          return (
            <div key={modulo}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--primary-strong)]">
                  {nomeDoModulo(modulo)}
                  <span className="ml-2 font-semibold normal-case tracking-normal text-[var(--muted)]">
                    {marcadasNoModulo}/{ids.length}
                  </span>
                </h3>

                {podeEditar && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => definirVarias(ids, true)}
                      className="text-xs font-semibold text-[var(--primary)] hover:underline"
                    >
                      Marcar módulo
                    </button>
                    <button
                      type="button"
                      onClick={() => definirVarias(ids, false)}
                      className="text-xs font-semibold text-[var(--muted)] hover:underline"
                    >
                      Limpar módulo
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[var(--stroke)]">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-[var(--surface)] text-[var(--muted)]">
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider">
                        Recurso
                      </th>
                      {acoesUsadas.map((acao) => (
                        <th key={acao} className="px-2 py-2 text-center text-xs font-bold">
                          <Tooltip lado="cima" texto={EXPLICACAO_DA_ACAO[acao] ?? acao}>
                            <span className="cursor-help border-b border-dotted border-[var(--muted)]">
                              {nomeDaAcao(acao)}
                            </span>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--stroke)]">
                    {Array.from(recursos.entries()).map(([recurso, acoes]) => (
                      <tr key={recurso}>
                        <td className="px-3 py-2 font-semibold text-[var(--text)]">
                          {nomeDoRecurso(recurso)}
                        </td>
                        {acoesUsadas.map((acao) => {
                          const permissao = acoes.get(acao);
                          if (!permissao) {
                            return (
                              <td
                                key={acao}
                                className="px-2 py-2 text-center text-[var(--muted)]"
                              >
                                <span aria-label="não se aplica">–</span>
                              </td>
                            );
                          }
                          const marcada = marcadas.has(permissao.id);
                          return (
                            <td key={acao} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={marcada}
                                disabled={!podeEditar}
                                onChange={() => alternar(permissao.id)}
                                aria-label={`${nomeDaAcao(acao)} ${nomeDoRecurso(recurso)}`}
                                className="h-4 w-4 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {podeEditar && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--stroke)] pt-4">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !alterado}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar permissões"}
          </button>

          {alterado && !salvando && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMarcadas(new Set(concedidas));
                  setAviso(null);
                }}
                className="text-sm font-semibold text-[var(--muted)] hover:underline"
              >
                Descartar alterações
              </button>
              <span className="text-xs text-[var(--muted)]">
                Há alterações não salvas.
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
