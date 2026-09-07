"use client";

import { useConfirmacao } from "@/components/ui/Confirmacao";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirGrupoDoUsuario } from "@/app/actions/groups";
import Avatar from "@/components/ui/Avatar";
import { roleLabel } from "@/lib/labels";

export interface PessoaDoGrupo {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
  grupoAtual: string | null;
}

/**
 * Quem pertence ao grupo.
 *
 * A associação é `profiles.group_id`: um grupo por pessoa. A tabela
 * `group_members`, de muitos-para-muitos, existia antes da hierarquia e deixou
 * de decidir qualquer coisa — com duas associações não haveria resposta única
 * para "qual é o nível desta pessoa", e é o nível que projeta o papel que a
 * segurança do banco consulta.
 *
 * Entrar num grupo é receber as permissões dele na hora: por isso a tela diz
 * de onde a pessoa está saindo antes de movê-la.
 */
export default function MembrosDoGrupo({
  grupoId,
  nomeDoGrupo,
  membros,
  candidatos,
  podeEditar,
}: {
  grupoId: string;
  nomeDoGrupo: string;
  membros: PessoaDoGrupo[];
  /** Pessoas de outros grupos, que podem ser trazidas para este. */
  candidatos: PessoaDoGrupo[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const { confirmar, Dialogo } = useConfirmacao();

  function mover(userId: string, destino: string | null) {
    setErro("");
    iniciar(async () => {
      const res = await definirGrupoDoUsuario(userId, destino);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      router.refresh();
    });
  }

  const filtrados = busca.trim()
    ? candidatos.filter((p) =>
        `${p.full_name ?? ""} ${p.email}`
          .toLowerCase()
          .includes(busca.trim().toLowerCase())
      )
    : candidatos;

  return (
    <section className="neo-card p-5">
      <Dialogo />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">Membros</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {membros.length === 0
              ? "Ninguém neste grupo ainda."
              : `${membros.length} pessoa(s) com as permissões deste grupo.`}
          </p>
        </div>

        {podeEditar && candidatos.length > 0 && (
          <button
            type="button"
            onClick={() => setAdicionando((a) => !a)}
            className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)]"
          >
            {adicionando ? "Cancelar" : "Adicionar pessoas"}
          </button>
        )}
      </div>

      {erro && (
        <p className="mt-3 rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm text-[var(--erro-fg)]">
          {erro}
        </p>
      )}

      {adicionando && podeEditar && (
        <div className="mt-4 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por nome ou e-mail"
            className="w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]"
          />

          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {filtrados.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--neo-bg)] p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    nome={p.full_name}
                    email={p.email}
                    url={p.avatar_url}
                    tamanho={36}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text)]">
                      {p.full_name || p.email}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {p.grupoAtual
                        ? `Hoje em ${p.grupoAtual}`
                        : "Sem grupo definido"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => mover(p.id, grupoId)}
                  className="neo-button rounded-full px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-50"
                >
                  Trazer para {nomeDoGrupo}
                </button>
              </li>
            ))}

            {filtrados.length === 0 && (
              <li className="py-3 text-sm text-[var(--muted)]">
                Ninguém encontrado com esse filtro.
              </li>
            )}
          </ul>

          <p className="mt-3 text-xs text-[var(--muted)]">
            Cada pessoa pertence a um grupo de cada vez. Trazê-la para cá a tira do
            grupo em que está, e ela passa a ter as permissões daqui imediatamente.
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {membros.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                nome={p.full_name}
                email={p.email}
                url={p.avatar_url}
                tamanho={40}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text)]">
                  {p.full_name || "Sem nome definido"}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">{p.email}</p>
                <p className="text-xs text-[var(--muted)]">{roleLabel(p.role)}</p>
              </div>
            </div>

            {podeEditar && p.role !== "super_admin" && (
              <button
                type="button"
                disabled={pendente}
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: `Tirar ${p.full_name || p.email} do grupo ${nomeDoGrupo}?`,
                    mensagem:
                      "A pessoa fica sem grupo e perde as permissões que vinham daqui, até ser colocada em outro.",
                    rotuloConfirmar: "Remover do grupo",
                    perigo: true,
                  });
                  if (ok) mover(p.id, null);
                }}
                className="text-xs font-semibold text-[var(--erro-fg)] hover:underline disabled:opacity-50"
              >
                Remover do grupo
              </button>
            )}
          </li>
        ))}

        {membros.length === 0 && (
          <li className="rounded-2xl border border-dashed border-[var(--stroke)] p-6 text-center text-sm text-[var(--muted)]">
            Um grupo sem ninguém não tem efeito. Use &quot;Adicionar pessoas&quot; para
            trazer alguém — as permissões marcadas abaixo passam a valer para quem
            entrar.
          </li>
        )}
      </ul>
    </section>
  );
}
