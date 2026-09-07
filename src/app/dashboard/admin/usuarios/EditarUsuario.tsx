"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirStatus, updateUserRole, definirDepartamento } from "@/app/actions/users";
import { definirGrupoDoUsuario } from "@/app/actions/groups";
import { definirCargo } from "@/app/actions/cargos";
import Avatar from "@/components/ui/Avatar";
import { ROLE_LABELS, STATUS_LABELS, statusDoPerfil } from "@/lib/labels";
import type { Cargo } from "@/types/modules/admin";
import type { Profile, StatusUsuario, UserRole } from "@/types";

/** Amanhã no fuso da empresa: o mínimo aceitável para uma volta de férias. */
function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Edita a pessoa inteira em um lugar só.
 *
 * A lista já permitia mudar campo a campo, e isso resolve o ajuste avulso. Mas
 * quando alguém muda de área — cargo novo, outro departamento, outro grupo — a
 * edição na linha vira quatro salvamentos separados, cada um recarregando a
 * tabela, e a pessoa fica em estado intermediário entre eles. Aqui as mudanças
 * são reunidas e aplicadas de uma vez.
 */
export default function EditarUsuario({
  usuario,
  papeisDisponiveis,
  grupos,
  departamentos,
  cargos,
  aoFechar,
}: {
  usuario: Profile;
  papeisDisponiveis: UserRole[];
  grupos: { id: string; nome: string; nivel: number }[];
  departamentos: string[];
  cargos: Cargo[];
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  const situacaoAtual = statusDoPerfil(usuario);
  const [form, setForm] = useState({
    papel: usuario.role as UserRole,
    grupo: usuario.group_id ?? "",
    departamento: usuario.departamento ?? "",
    cargo: usuario.cargo_id ?? "",
    status: situacaoAtual as StatusUsuario,
    retorno: usuario.retorno_previsto ?? "",
  });

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const feriasSemData = form.status === "ferias" && form.retorno.length !== 10;

  function salvar() {
    if (feriasSemData) {
      setErro("Escolha a data prevista de retorno.");
      return;
    }
    setErro("");

    iniciar(async () => {
      // Cada mudança é uma ação própria, com sua própria checagem no servidor:
      // agrupá-las numa só faria a tela decidir o que pode ser mudado, e essa
      // decisão não pode morar aqui. O que a tela faz é parar na primeira que
      // for recusada, em vez de seguir e deixar a pessoa pela metade.
      const passos: [string, () => Promise<{ ok: boolean; message?: string }>][] = [];

      if (form.papel !== usuario.role) {
        passos.push(["função", () => updateUserRole(usuario.id, form.papel)]);
      }
      if (form.grupo !== (usuario.group_id ?? "")) {
        passos.push([
          "grupo",
          () => definirGrupoDoUsuario(usuario.id, form.grupo || null),
        ]);
      }
      if (form.departamento !== (usuario.departamento ?? "")) {
        passos.push([
          "departamento",
          () => definirDepartamento(usuario.id, form.departamento || null),
        ]);
      }
      if (form.cargo !== (usuario.cargo_id ?? "")) {
        passos.push(["cargo", () => definirCargo(usuario.id, form.cargo || null)]);
      }
      if (
        form.status !== situacaoAtual ||
        (form.status === "ferias" && form.retorno !== (usuario.retorno_previsto ?? ""))
      ) {
        passos.push([
          "situação",
          () =>
            definirStatus(
              usuario.id,
              form.status,
              form.status === "ferias" ? form.retorno : null
            ),
        ]);
      }

      for (const [nome, executar] of passos) {
        const res = await executar();
        if (!res.ok) {
          setErro(`Não foi possível alterar ${nome}: ${res.message ?? "erro"}`);
          router.refresh();
          return;
        }
      }

      router.refresh();
      aoFechar();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar ${usuario.full_name || usuario.email}`}
      onClick={aoFechar}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neo-card max-h-[85vh] w-full max-w-md overflow-y-auto p-6"
      >
        <div className="flex items-center gap-3">
          <Avatar
            nome={usuario.full_name}
            email={usuario.email}
            url={usuario.avatar_url}
            tamanho={48}
          />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-[var(--text)]">
              {usuario.full_name || "Sem nome definido"}
            </h2>
            <p className="truncate text-xs text-[var(--muted)]">{usuario.email}</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className={rotulo}>Função</label>
            <select
              value={form.papel}
              onChange={(e) => setForm({ ...form, papel: e.target.value as UserRole })}
              className={campo}
            >
              {papeisDisponiveis.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo}>Grupo</label>
            <select
              value={form.grupo}
              onChange={(e) => setForm({ ...form, grupo: e.target.value })}
              className={campo}
            >
              <option value="">Sem grupo</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome} (nível {g.nivel})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              É o grupo que decide o que a pessoa pode fazer no sistema.
            </p>
          </div>

          <div>
            <label className={rotulo}>Departamento</label>
            <select
              value={form.departamento}
              onChange={(e) => setForm({ ...form, departamento: e.target.value })}
              className={campo}
            >
              <option value="">Sem departamento</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Decide quais documentos do GED ela enxerga.
            </p>
          </div>

          <div>
            <label className={rotulo}>Cargo</label>
            <select
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              className={campo}
            >
              <option value="">Sem cargo</option>
              {cargos
                .filter((c) => c.ativo || c.id === usuario.cargo_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              O que ela faz. Não concede acesso nenhum.
            </p>
          </div>

          <div>
            <label className={rotulo}>Situação</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as StatusUsuario,
                  retorno: e.target.value === "ferias" ? form.retorno : "",
                })
              }
              className={campo}
            >
              {(["ativo", "ferias", "inativo"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {form.status === "ferias" && (
            <div>
              <label className={rotulo}>Retorno previsto *</label>
              <input
                type="date"
                min={amanha()}
                value={form.retorno}
                onChange={(e) => setForm({ ...form, retorno: e.target.value })}
                className={campo}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                A conta volta a Ativo sozinha no primeiro acesso a partir desta data.
              </p>
            </div>
          )}
        </div>

        {erro && (
          <p className="mt-4 rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm text-[var(--erro-fg)]">
            {erro}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={aoFechar}
            className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={pendente || feriasSemData}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-50"
          >
            {pendente ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
