"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarEmpresa,
  definirAcessosDaEmpresa,
  type Empresa,
} from "@/app/actions/certificados";
import Avatar from "@/components/ui/Avatar";
import { formatDate } from "@/lib/labels";

export interface PessoaSimples {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  cargo: string | null;
  /** true quando a pessoa alcança TODAS as empresas por permissão de grupo. */
  vetodas: boolean;
}

/**
 * Empresas e quem cuida de cada uma.
 *
 * São dois caminhos de acesso, e a distinção importa: quem cuida de empresas
 * específicas é marcado aqui, uma a uma; quem responde pelo assunto inteiro
 * recebe a permissão "Administrar" no grupo e alcança todas sem aparecer em
 * lista nenhuma. Misturar os dois faria a lista de uma empresa crescer com
 * gente que não cuida dela em particular.
 */
export default function EmpresasClient({
  empresas,
  pessoas,
  acessosPorEmpresa,
  certificadosPorEmpresa,
  podeAdministrar,
}: {
  empresas: Empresa[];
  pessoas: PessoaSimples[];
  acessosPorEmpresa: Record<string, string[]>;
  certificadosPorEmpresa: Record<string, number>;
  podeAdministrar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ razaoSocial: "", nomeFantasia: "", cnpj: "" });

  const [editando, setEditando] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);

  const semRestricao = pessoas.filter((p) => p.vetodas);
  const restritas = pessoas.filter((p) => !p.vetodas);

  const podeCriar =
    nova.razaoSocial.trim().length >= 2 &&
    (nova.cnpj.replace(/\D/g, "").length === 0 ||
      nova.cnpj.replace(/\D/g, "").length === 14);

  function salvarNova() {
    setAviso(null);
    iniciar(async () => {
      const res = await criarEmpresa({
        razaoSocial: nova.razaoSocial,
        nomeFantasia: nova.nomeFantasia,
        cnpj: nova.cnpj,
      });
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setNova({ razaoSocial: "", nomeFantasia: "", cnpj: "" });
      setCriando(false);
      setAviso({ tipo: "ok", texto: `Empresa "${res.data.razao_social}" cadastrada.` });
      router.refresh();
    });
  }

  function salvarAcessos(empresaId: string) {
    setAviso(null);
    iniciar(async () => {
      const res = await definirAcessosDaEmpresa(empresaId, marcados);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setEditando(null);
      setAviso({
        tipo: "ok",
        texto:
          marcados.length === 0
            ? "Nenhuma pessoa marcada. Só quem administra todos os certificados alcança esta empresa."
            : `${marcados.length} pessoa(s) passam a alcançar os certificados desta empresa.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {aviso && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {semRestricao.length > 0 && (
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)]">
            Quem alcança todas as empresas
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Por terem &quot;Administrar&quot; em Certificados no grupo. Não precisam
            ser marcados empresa por empresa.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {semRestricao.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1.5"
              >
                <Avatar nome={p.nome} email={p.email} url={p.avatar_url} tamanho={24} />
                <span className="text-sm text-[var(--text)]">{p.nome}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeAdministrar && (
        <section className="neo-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">
                {empresas.length} empresa(s)
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Cada uma com quem cuida dela. É essa lista que abre o certificado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCriando((c) => !c)}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              {criando ? "Cancelar" : "Nova empresa"}
            </button>
          </div>

          {criando && (
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={rotulo}>Razão social *</label>
                <input
                  value={nova.razaoSocial}
                  onChange={(e) => setNova({ ...nova, razaoSocial: e.target.value })}
                  placeholder="Como consta no CNPJ"
                  className={campo}
                />
              </div>
              <div>
                <label className={rotulo}>CNPJ</label>
                <input
                  value={nova.cnpj}
                  onChange={(e) => setNova({ ...nova, cnpj: e.target.value })}
                  placeholder="Só números"
                  className={campo}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={rotulo}>Nome fantasia</label>
                <input
                  value={nova.nomeFantasia}
                  onChange={(e) => setNova({ ...nova, nomeFantasia: e.target.value })}
                  className={campo}
                />
              </div>
              <div className="flex items-end">
                {podeCriar ? (
                  <button
                    type="button"
                    onClick={salvarNova}
                    disabled={pendente}
                    className="w-full rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
                  >
                    {pendente ? "Salvando…" : "Cadastrar"}
                  </button>
                ) : (
                  <p className="w-full rounded-full bg-[var(--neo-bg)] px-4 py-2.5 text-center text-xs text-[var(--muted)]">
                    {nova.razaoSocial.trim().length < 2
                      ? "Informe a razão social"
                      : "O CNPJ deve ter 14 dígitos"}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {empresas.map((e) => {
          const cuidam = acessosPorEmpresa[e.id] ?? [];
          return (
            <div key={e.id} className="neo-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-[var(--text)]">
                    {e.razao_social}
                  </h3>
                  {e.nome_fantasia && (
                    <p className="truncate text-sm text-[var(--muted)]">
                      {e.nome_fantasia}
                    </p>
                  )}
                  {e.cnpj && (
                    <p className="font-mono text-xs text-[var(--muted)]">{e.cnpj}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--primary-strong)]">
                  {certificadosPorEmpresa[e.id] ?? 0} certificado(s)
                </span>
              </div>

              <div className="mt-3 border-t border-[var(--stroke)] pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Cuidam desta empresa
                </p>

                {editando === e.id ? (
                  <>
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                      {restritas.map((p) => (
                        <li key={p.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--text)] hover:bg-[var(--surface)]">
                            <input
                              type="checkbox"
                              checked={marcados.includes(p.id)}
                              onChange={() =>
                                setMarcados((atual) =>
                                  atual.includes(p.id)
                                    ? atual.filter((x) => x !== p.id)
                                    : [...atual, p.id]
                                )
                              }
                            />
                            <Avatar
                              nome={p.nome}
                              email={p.email}
                              url={p.avatar_url}
                              tamanho={26}
                            />
                            <span className="truncate">
                              {p.nome}
                              {p.cargo && (
                                <span className="text-[var(--muted)]"> · {p.cargo}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                      {restritas.length === 0 && (
                        <li className="py-2 text-sm text-[var(--muted)]">
                          Todo mundo já alcança todas as empresas pelo grupo.
                        </li>
                      )}
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => salvarAcessos(e.id)}
                        disabled={pendente}
                        className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--on-accent)] disabled:opacity-60"
                      >
                        {pendente ? "Salvando…" : "Salvar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        className="text-xs font-semibold text-[var(--muted)] hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {cuidam.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {cuidam.map((id) => {
                          const p = pessoas.find((x) => x.id === id);
                          if (!p) return null;
                          return (
                            <li
                              key={id}
                              className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-2.5 py-1"
                            >
                              <Avatar
                                nome={p.nome}
                                email={p.email}
                                url={p.avatar_url}
                                tamanho={22}
                              />
                              <span className="text-xs text-[var(--text)]">{p.nome}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        Ninguém em particular. Só quem administra todos os
                        certificados alcança esta empresa.
                      </p>
                    )}

                    {podeAdministrar && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(e.id);
                          setMarcados(cuidam);
                        }}
                        className="neo-button mt-3 rounded-full px-4 py-2 text-xs font-bold text-[var(--text)]"
                      >
                        Definir quem cuida
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {empresas.length === 0 && (
        <p className="neo-card p-10 text-center text-sm text-[var(--muted)]">
          Nenhuma empresa cadastrada. Ela também é criada sozinha quando um
          certificado é enviado para uma empresa que ainda não existe.
        </p>
      )}
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
