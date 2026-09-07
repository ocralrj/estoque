"use client";

import { useEffect, useState } from "react";
import { listarUsuariosParaAcesso } from "@/app/actions/ged";

export type Nivel = "leitura" | "edicao";
export type Visibilidade = "todos" | "departamento" | "restrito";

export interface Acesso {
  user_id: string;
  nivel: Nivel;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

/**
 * Quem enxerga o documento.
 *
 * O modo padrão é o departamento do próprio documento — a maioria do acervo
 * interessa a quem trabalha na área que o arquivou, e exigir uma lista nominal
 * em todo cadastro levaria a deixar tudo aberto por preguiça.
 *
 * O compartilhamento nominal continua disponível, mas some da tela até ser
 * pedido: é a exceção, não a regra.
 */
export default function SeletorAcesso({
  visibilidade,
  acessos,
  departamentoDoDocumento,
  onVisibilidade,
  onAcessos,
}: {
  visibilidade: Visibilidade;
  acessos: Acesso[];
  departamentoDoDocumento: string;
  onVisibilidade: (v: Visibilidade) => void;
  onAcessos: (a: Acesso[]) => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  // Já veio com gente indicada (edição): a lista abre junto.
  const [compartilhando, setCompartilhando] = useState(acessos.length > 0);

  const precisaLista = compartilhando || visibilidade === "restrito";

  useEffect(() => {
    if (!precisaLista || usuarios.length > 0) return;
    setCarregando(true);
    listarUsuariosParaAcesso()
      .then((res) => {
        if (res.ok) setUsuarios(res.data);
      })
      .finally(() => setCarregando(false));
  }, [precisaLista, usuarios.length]);

  useEffect(() => {
    if (acessos.length > 0) setCompartilhando(true);
  }, [acessos.length]);

  function nivelDe(userId: string): Nivel | null {
    return acessos.find((a) => a.user_id === userId)?.nivel ?? null;
  }

  function definir(userId: string, nivel: Nivel | null) {
    const semEste = acessos.filter((a) => a.user_id !== userId);
    onAcessos(nivel ? [...semEste, { user_id: userId, nivel }] : semEste);
  }

  const filtrados = busca.trim()
    ? usuarios.filter((u) =>
        `${u.nome} ${u.email}`.toLowerCase().includes(busca.trim().toLowerCase())
      )
    : usuarios;

  return (
    <section className="neo-card p-5">
      <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Quem pode ver</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Você e a gestão sempre têm acesso, qualquer que seja a escolha.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Opcao
          ativa={visibilidade === "departamento"}
          onClick={() => onVisibilidade("departamento")}
          titulo={departamentoDoDocumento || "Departamento do documento"}
          detalhe={
            departamentoDoDocumento
              ? `Quem trabalha em ${departamentoDoDocumento}`
              : "Escolha o departamento de origem acima"
          }
        />
        <Opcao
          ativa={visibilidade === "todos"}
          onClick={() => onVisibilidade("todos")}
          titulo="Todos da empresa"
          detalhe="Qualquer pessoa com acesso ao sistema"
        />
        <Opcao
          ativa={visibilidade === "restrito"}
          onClick={() => onVisibilidade("restrito")}
          titulo="Ninguém, só eu"
          detalhe="Nem o departamento vê, a menos que você compartilhe"
        />
      </div>

      <div className="mt-4 border-t border-[var(--stroke)] pt-4">
        {!precisaLista ? (
          <button
            type="button"
            onClick={() => setCompartilhando(true)}
            className="text-sm font-semibold text-[var(--primary)] hover:underline"
          >
            + Compartilhar com pessoas específicas
          </button>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">
                Compartilhar com pessoas específicas
              </p>
              {visibilidade !== "restrito" && (
                <button
                  type="button"
                  onClick={() => {
                    setCompartilhando(false);
                    onAcessos([]);
                  }}
                  className="text-xs font-semibold text-[var(--muted)] hover:underline"
                >
                  Remover todos
                </button>
              )}
            </div>

            <p className="mb-3 text-xs text-[var(--muted)]">
              Estas pessoas veem o documento além de quem já vê pela escolha acima.
              &quot;Ler e alterar&quot; é o único jeito de dar edição a quem não é gestor.
            </p>

            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar por nome ou e-mail"
              className="w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
            />

            {carregando && (
              <p className="mt-3 text-sm text-[var(--muted)]">Carregando usuários…</p>
            )}

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {filtrados.map((u) => {
                const nivel = nivelDe(u.id);
                return (
                  <div
                    key={u.id}
                    className="flex flex-col gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--text)]">{u.nome}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Pill ativo={nivel === null} onClick={() => definir(u.id, null)}>
                        Sem acesso
                      </Pill>
                      <Pill
                        ativo={nivel === "leitura"}
                        onClick={() => definir(u.id, "leitura")}
                      >
                        Ler
                      </Pill>
                      <Pill
                        ativo={nivel === "edicao"}
                        onClick={() => definir(u.id, "edicao")}
                      >
                        Ler e alterar
                      </Pill>
                    </div>
                  </div>
                );
              })}

              {!carregando && filtrados.length === 0 && (
                <p className="text-sm text-[var(--muted)]">Nenhum usuário encontrado.</p>
              )}
            </div>

            {acessos.length > 0 && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                {acessos.length} pessoa(s) compartilhada(s).
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Opcao({
  ativa,
  onClick,
  titulo,
  detalhe,
}: {
  ativa: boolean;
  onClick: () => void;
  titulo: string;
  detalhe: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={`rounded-2xl border p-3 text-left transition ${
        ativa
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--stroke)] bg-[var(--surface)] hover:border-[var(--primary-soft)]"
      }`}
    >
      <span className="block truncate font-bold text-[var(--text)]">{titulo}</span>
      <span className="block text-xs text-[var(--muted)]">{detalhe}</span>
    </button>
  );
}

function Pill({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
        ativo
          ? "bg-[var(--primary)] text-[var(--on-accent)]"
          : "border border-[var(--stroke)] text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}
