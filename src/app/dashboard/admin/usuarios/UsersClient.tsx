"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  definirStatus,
  updateUserRole,
  promoverASuperAdmin,
  convidarUsuario,
  definirDepartamento,
} from "@/app/actions/users";
import {
  ROLE_LABELS,
  roleLabel,
  formatDate,
  STATUS_CLASSES,
  STATUS_LABELS,
  statusDoPerfil,
} from "@/lib/labels";
import Tooltip from "@/components/ui/Tooltip";
import Avatar from "@/components/ui/Avatar";
import type { Profile, StatusUsuario, UserRole } from "@/types";

type Feedback = { kind: "ok" | "erro"; text: string } | null;

/** Amanhã, no fuso da empresa: o mínimo aceitável para uma volta de férias. */
function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export default function UsersClient({
  users,
  currentRole,
  meuId,
  departamentos,
}: {
  users: Profile[];
  currentRole: string;
  meuId: string;
  departamentos: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [criando, setCriando] = useState(false);

  const [novo, setNovo] = useState({
    email: "",
    nome: "",
    papel: "requisitante" as UserRole,
    departamento: "",
    status: "ativo" as StatusUsuario,
    retorno: "",
  });

  // "Super Admin" não entra no seletor: conceder o papel máximo do sistema por
  // um clique distraído num dropdown, ao lado dos demais, é fácil demais.
  // A promoção tem botão próprio, com confirmação.
  const availableRoles: UserRole[] =
    currentRole === "super_admin"
      ? ["gestor", "almoxarife", "requisitante"]
      : ["almoxarife", "requisitante"];

  function promover(u: Profile) {
    const nome = u.full_name || u.email;
    if (
      !window.confirm(
        `Tornar "${nome}" um super admin?

Ele passa a poder excluir documentos, gerenciar todos os usuários e conceder o mesmo papel a outras pessoas. Depois disso, só ele próprio poderá alterar seu papel.`
      )
    ) {
      return;
    }
    run(u.id, () => promoverASuperAdmin(u.id));
  }

  function run(userId: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusyId(userId);
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setFeedback({ kind: "ok", text: "Usuário atualizado." });
        router.refresh();
      } else {
        setFeedback({ kind: "erro", text: result.message ?? "Erro ao atualizar." });
      }
      setBusyId(null);
    });
  }

  const novoValido =
    novo.email.trim().length > 3 &&
    (novo.status !== "ferias" || novo.retorno.length === 10);

  function criar() {
    if (!novoValido) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await convidarUsuario({
        email: novo.email.trim(),
        nome: novo.nome,
        papel: novo.papel,
        departamento: novo.departamento || null,
        status: novo.status,
        retornoPrevisto: novo.retorno || null,
      });
      if (res.ok) {
        const email = novo.email.trim();
        setNovo({
          email: "",
          nome: "",
          papel: "requisitante",
          departamento: "",
          status: "ativo",
          retorno: "",
        });
        setCriando(false);
        setFeedback({
          kind: "ok",
          text: `Acesso criado para ${email}. Senha inicial: ${res.senha} — informe à pessoa. Ela será obrigada a trocá-la no primeiro acesso.`,
        });
        router.refresh();
      } else {
        setFeedback({ kind: "erro", text: res.message });
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)]">Usuários</h1>
        <button
          type="button"
          onClick={() => setCriando((c) => !c)}
          className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
        >
          {criando ? "Cancelar" : "Novo usuário"}
        </button>
      </div>

      {criando && (
        <div className="mb-6 rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="novo-nome" className={rotulo}>
                Nome completo
              </label>
              <input
                id="novo-nome"
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Como a pessoa aparece no sistema"
                className={campo}
              />
            </div>
            <div>
              <label htmlFor="novo-email" className={rotulo}>
                E-mail de acesso *
              </label>
              <input
                id="novo-email"
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
                placeholder="pessoa@empresa.com.br"
                className={campo}
              />
            </div>
            <div>
              <label htmlFor="novo-papel" className={rotulo}>
                Função
              </label>
              <select
                id="novo-papel"
                value={novo.papel}
                onChange={(e) =>
                  setNovo({ ...novo, papel: e.target.value as UserRole })
                }
                className={campo}
              >
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="novo-depto" className={rotulo}>
                Departamento
              </label>
              <select
                id="novo-depto"
                value={novo.departamento}
                onChange={(e) => setNovo({ ...novo, departamento: e.target.value })}
                className={campo}
              >
                <option value="">Definir depois</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="novo-status" className={rotulo}>
                Situação
              </label>
              <select
                id="novo-status"
                value={novo.status}
                onChange={(e) =>
                  setNovo({
                    ...novo,
                    status: e.target.value as StatusUsuario,
                    retorno: e.target.value === "ferias" ? novo.retorno : "",
                  })
                }
                className={campo}
              >
                <option value="ativo">Ativo</option>
                <option value="ferias">Férias</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            {novo.status === "ferias" && (
              <div>
                <label htmlFor="novo-retorno" className={rotulo}>
                  Retorno previsto *
                </label>
                <input
                  id="novo-retorno"
                  type="date"
                  min={amanha()}
                  value={novo.retorno}
                  onChange={(e) => setNovo({ ...novo, retorno: e.target.value })}
                  className={campo}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={criar}
            disabled={pending || !novoValido}
            className="mt-3 rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
          >
            {pending ? "Criando…" : "Criar acesso"}
          </button>

          <p className="mt-2 text-xs text-[var(--text-muted)]">
            A pessoa entra com a senha provisória{" "}
            <strong className="font-mono">Mudar@123</strong> e é obrigada a trocá-la no
            primeiro acesso. O departamento define quais documentos do GED ela enxerga.
          </p>
        </div>
      )}

      {feedback && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            feedback.kind === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {feedback.text}
        </p>
      )}

      <div className="overflow-hidden rounded-xl bg-[var(--neo-bg)] shadow-sm">
        <div className="neo-flat overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[var(--neo-flat)] text-xs uppercase text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Nome / Email</th>
                <th className="px-4 py-3 text-left">Função</th>
                <th className="px-4 py-3 text-left">Departamento</th>
                <th className="px-4 py-3 text-left">Situação</th>
                <th className="px-4 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--neo-line)]">
              {users.map((u) => {
                const ehSuperAdmin = u.role === "super_admin";
                // Super admin é intocável por terceiros: nem papel, nem situação.
                const editable =
                  !ehSuperAdmin &&
                  u.id !== meuId &&
                  (currentRole === "super_admin" ||
                    u.role === "requisitante" ||
                    u.role === "almoxarife");
                const busy = pending && busyId === u.id;
                const situacao = statusDoPerfil(u);

                return (
                  <tr key={u.id} className="hover:bg-[var(--neo-flat)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          nome={u.full_name}
                          email={u.email}
                          url={u.avatar_url}
                          tamanho={36}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--text)]">
                            {u.full_name || "Sem nome definido"}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <select
                          value={u.role}
                          disabled={busy}
                          aria-label={`Função de ${u.full_name || u.email}`}
                          onChange={(e) =>
                            run(u.id, () =>
                              updateUserRole(u.id, e.target.value as UserRole)
                            )
                          }
                          className="rounded border border-[var(--neo-line)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--ring)] disabled:opacity-50"
                        >
                          {availableRoles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={
                            ehSuperAdmin
                              ? "font-semibold text-[var(--primary-strong)]"
                              : "text-[var(--text-muted)]"
                          }
                        >
                          {roleLabel(u.role)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.departamento ?? ""}
                        disabled={busy}
                        aria-label={`Departamento de ${u.full_name || u.email}`}
                        onChange={(e) =>
                          run(u.id, () =>
                            definirDepartamento(u.id, e.target.value || null)
                          )
                        }
                        className="rounded border border-[var(--neo-line)] bg-[var(--neo-bg)] px-2 py-1 text-xs text-[var(--text)] disabled:opacity-50"
                      >
                        <option value="">Sem departamento</option>
                        {departamentos.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <CelulaSituacao
                        perfil={u}
                        situacao={situacao}
                        editavel={editable}
                        ocupado={busy}
                        aoSalvar={(status, retorno) =>
                          run(u.id, () => definirStatus(u.id, status, retorno))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      {ehSuperAdmin ? (
                        <span className="text-xs text-[var(--text-muted)]">
                          {u.id === meuId ? "sua conta" : "protegido"}
                        </span>
                      ) : u.id === meuId ? (
                        <span className="text-xs text-[var(--text-muted)]">sua conta</span>
                      ) : (
                        currentRole === "super_admin" &&
                        situacao === "ativo" && (
                          <button
                            disabled={busy}
                            onClick={() => promover(u)}
                            className="text-xs text-[var(--primary-strong)] hover:underline disabled:opacity-50"
                          >
                            Tornar super admin
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Situação da conta, editável na própria célula.
 *
 * Escolher "Férias" abre a data de retorno e só então salva: o banco recusa
 * férias sem prazo, e é essa data que faz a conta voltar sozinha ao normal no
 * primeiro acesso depois dela.
 */
function CelulaSituacao({
  perfil,
  situacao,
  editavel,
  ocupado,
  aoSalvar,
}: {
  perfil: Profile;
  situacao: "ativo" | "ferias" | "inativo";
  editavel: boolean;
  ocupado: boolean;
  aoSalvar: (status: StatusUsuario, retorno: string | null) => void;
}) {
  const [pedindoData, setPedindoData] = useState(false);
  const [data, setData] = useState(perfil.retorno_previsto ?? "");

  const pastilha = (
    <span className={STATUS_CLASSES[situacao]}>{STATUS_LABELS[situacao]}</span>
  );

  const emFerias = situacao === "ferias" && perfil.retorno_previsto;

  if (!editavel) {
    return (
      <div className="space-y-1">
        {emFerias ? (
          <Tooltip
            lado="cima"
            texto={`Volta prevista para ${formatDate(perfil.retorno_previsto!)}. A conta volta a Ativo sozinha no primeiro acesso a partir dessa data.`}
          >
            {pastilha}
          </Tooltip>
        ) : (
          pastilha
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pedindoData ? (
        <div className="space-y-2">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Retorno previsto
          </label>
          <input
            type="date"
            min={amanha()}
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded border border-[var(--neo-line)] bg-[var(--neo-bg)] px-2 py-1 text-xs text-[var(--text)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ocupado || data.length !== 10}
              onClick={() => {
                aoSalvar("ferias", data);
                setPedindoData(false);
              }}
              className="rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-bold text-[var(--on-accent)] disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setPedindoData(false)}
              className="text-[11px] font-semibold text-[var(--text-muted)] hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <select
            value={situacao}
            disabled={ocupado}
            aria-label={`Situação de ${perfil.full_name || perfil.email}`}
            onChange={(e) => {
              const escolha = e.target.value as StatusUsuario;
              if (escolha === "ferias") {
                setData(perfil.retorno_previsto ?? "");
                setPedindoData(true);
                return;
              }
              aoSalvar(escolha, null);
            }}
            className="rounded border border-[var(--neo-line)] bg-[var(--neo-bg)] px-2 py-1 text-xs text-[var(--text)] disabled:opacity-50"
          >
            <option value="ativo">Ativo</option>
            <option value="ferias">Férias</option>
            <option value="inativo">Inativo</option>
          </select>

          {emFerias ? (
            <Tooltip
              lado="cima"
              className="block"
              texto="A conta volta a Ativo sozinha no primeiro acesso a partir desta data, e o registro de férias é apagado."
            >
              <span className="text-[11px] text-[var(--text-muted)]">
                Volta em {formatDate(perfil.retorno_previsto!)}
              </span>
            </Tooltip>
          ) : (
            pastilha
          )}
        </>
      )}
    </div>
  );
}

const campo =
  "mt-2 w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]";
