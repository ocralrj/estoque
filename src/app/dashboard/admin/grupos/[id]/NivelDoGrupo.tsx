"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirNivelDoGrupo } from "@/app/actions/groups";
import { NIVEIS, nomeDoNivel } from "@/lib/catalogo-permissoes";

/**
 * Posição do grupo na hierarquia.
 *
 * O nível não é um rótulo: é ele que decide o papel de quem está no grupo, e o
 * papel é o que a segurança do banco consulta. Mudar aqui muda o acesso de
 * todas as pessoas do grupo, inclusive fora da aplicação — por isso a tela diz
 * isso em vez de deixar a pessoa descobrir depois.
 */
export default function NivelDoGrupo({
  grupoId,
  nivelAtual,
  fixo,
  podeEditar,
  quantidadeDeMembros,
}: {
  grupoId: string;
  nivelAtual: number;
  /** Grupo base da hierarquia: o nível ancora a projeção do papel. */
  fixo: boolean;
  podeEditar: boolean;
  quantidadeDeMembros: number;
}) {
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const [nivel, setNivel] = useState(nivelAtual);
  const [erro, setErro] = useState("");

  function salvar(novo: number) {
    setErro("");
    setNivel(novo);
    iniciar(async () => {
      const res = await definirNivelDoGrupo(grupoId, novo);
      if (!res.ok) {
        setErro(res.message);
        setNivel(nivelAtual);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="neo-card p-5">
      <h2 className="text-lg font-bold text-[var(--text)]">Posição na hierarquia</h2>

      {fixo ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Este é um dos grupos que sustentam a hierarquia, então o nível é fixo:{" "}
          <strong className="text-[var(--text)]">
            {nomeDoNivel(nivelAtual)} ({nivelAtual})
          </strong>
          . Para dar outro alcance a alguém, mova a pessoa para outro grupo.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">
            O nível define o alcance de quem está no grupo. Número menor significa
            mais poder.
          </p>

          <div className="mt-3 max-w-sm">
            <label
              htmlFor="nivel"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
            >
              Nível
            </label>
            <select
              id="nivel"
              value={nivel}
              disabled={!podeEditar || salvando}
              onChange={(e) => salvar(Number(e.target.value))}
              className="mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-60"
            >
              {NIVEIS.map((n) => (
                <option key={n.nivel} value={n.nivel}>
                  {n.nivel} — {n.nome}: {n.detalhe}
                </option>
              ))}
            </select>
          </div>

          {quantidadeDeMembros > 0 && (
            <p className="mt-3 rounded-2xl bg-[var(--aviso-bg)] px-4 py-3 text-sm text-[var(--aviso-fg)]">
              Mudar o nível altera o alcance de {quantidadeDeMembros} pessoa(s) deste
              grupo, inclusive na segurança do banco de dados.
            </p>
          )}
        </>
      )}

      {erro && (
        <p className="mt-3 rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm text-[var(--erro-fg)]">
          {erro}
        </p>
      )}
    </section>
  );
}
