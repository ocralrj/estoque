"use client";

import { useEffect, useState } from "react";
import { listarUsuariosParaAcesso } from "@/app/actions/ged";

export type Nivel = "leitura" | "edicao";
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
 * Quem lê e quem edita o documento.
 *
 * Com visibilidade "todos", qualquer usuário autenticado consulta e a lista
 * fica oculta — é o comportamento padrão, e o mais comum num acervo interno.
 * "Restrito" abre a escolha nominal.
 *
 * Gestores e o super admin enxergam tudo de qualquer forma (regra do RLS), e a
 * tela diz isso em vez de dar a impressão de que a lista os limita.
 */
export default function SeletorAcesso({
  visibilidade,
  acessos,
  onVisibilidade,
  onAcessos,
}: {
  visibilidade: "todos" | "restrito";
  acessos: Acesso[];
  onVisibilidade: (v: "todos" | "restrito") => void;
  onAcessos: (a: Acesso[]) => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (visibilidade !== "restrito" || usuarios.length > 0) return;
    setCarregando(true);
    listarUsuariosParaAcesso()
      .then((res) => {
        if (res.ok) setUsuarios(res.data);
      })
      .finally(() => setCarregando(false));
  }, [visibilidade, usuarios.length]);

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
      <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Quem pode acessar</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Gestores e o administrador sempre têm acesso, independente desta escolha.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label
          className={`flex-1 cursor-pointer rounded-2xl border p-3 transition ${
            visibilidade === "todos"
              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : "border-[var(--stroke)] bg-[var(--surface)]"
          }`}
        >
          <input
            type="radio"
            name="visibilidade"
            className="sr-only"
            checked={visibilidade === "todos"}
            onChange={() => onVisibilidade("todos")}
          />
          <span className="block font-bold text-[var(--text)]">Todos da equipe</span>
          <span className="block text-xs text-[var(--muted)]">
            Qualquer usuário do sistema pode consultar
          </span>
        </label>

        <label
          className={`flex-1 cursor-pointer rounded-2xl border p-3 transition ${
            visibilidade === "restrito"
              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : "border-[var(--stroke)] bg-[var(--surface)]"
          }`}
        >
          <input
            type="radio"
            name="visibilidade"
            className="sr-only"
            checked={visibilidade === "restrito"}
            onChange={() => onVisibilidade("restrito")}
          />
          <span className="block font-bold text-[var(--text)]">Somente escolhidos</span>
          <span className="block text-xs text-[var(--muted)]">
            Você indica quem lê e quem pode alterar
          </span>
        </label>
      </div>

      {visibilidade === "restrito" && (
        <div className="mt-4">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por nome ou e-mail"
            className="w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
          />

          {carregando && (
            <p className="mt-3 text-sm text-[var(--muted)]">Carregando usuários…</p>
          )}

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
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
                    <Opcao ativo={nivel === null} onClick={() => definir(u.id, null)}>
                      Sem acesso
                    </Opcao>
                    <Opcao ativo={nivel === "leitura"} onClick={() => definir(u.id, "leitura")}>
                      Ler
                    </Opcao>
                    <Opcao ativo={nivel === "edicao"} onClick={() => definir(u.id, "edicao")}>
                      Ler e alterar
                    </Opcao>
                  </div>
                </div>
              );
            })}

            {!carregando && filtrados.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Nenhum usuário encontrado.</p>
            )}
          </div>

          <p className="mt-3 text-xs text-[var(--muted)]">
            {acessos.length === 0
              ? "Ninguém indicado ainda — só você, gestores e o administrador verão o documento."
              : `${acessos.length} pessoa(s) com acesso.`}
          </p>
        </div>
      )}
    </section>
  );
}

function Opcao({
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
