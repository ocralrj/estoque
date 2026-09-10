"use client";

import type { Cargo } from "@/types/modules/admin";
import { IconeEditar, IconeSuperAdmin } from "@/components/ui/IconesAcao";
import EditarUsuario from "./EditarUsuario";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  definirStatus,
  updateUserRole,
  promoverASuperAdmin,
  convidarUsuario,
  definirDepartamento,
} from "@/app/actions/users";
import { definirGrupoDoUsuario } from "@/app/actions/groups";
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
import SeletorDeFoto from "@/components/ui/SeletorDeFoto";
import { paraDataUrl, type AvatarPreparado } from "@/lib/imagens/avatar";
import type { Profile, StatusUsuario, UserRole } from "@/types";
import { SUPER_ADMIN_PRINCIPAL_EMAIL } from "@/lib/admin";

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
  currentEmail,
  meuId,
  departamentos,
  grupos,
  cargos,
}: {
  users: Profile[];
  currentRole: string;
  currentEmail: string;
  meuId: string;
  departamentos: string[];
  /** Grupos disponíveis, do mais alto ao mais baixo na hierarquia. */
  grupos: { id: string; nome: string; nivel: number }[];
  cargos: Cargo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [criando, setCriando] = useState(false);
  const [fotoNova, setFotoNova] = useState<AvatarPreparado | null>(null);
  const { confirmar, Dialogo } = useConfirmacao();
  const [editandoUsuario, setEditandoUsuario] = useState<Profile | null>(null);

  const [novo, setNovo] = useState({
    email: "",
    nome: "",
    papel: "requisitante" as UserRole,
    departamento: "",
    status: "ativo" as StatusUsuario,
    retorno: "",
    grupo: "",
  });

  // "Super Admin" não entra no seletor: conceder o papel máximo do sistema por
  // um clique distraído num dropdown, ao lado dos demais, é fácil demais.
  // A promoção tem botão próprio, com confirmação.
  const availableRoles: UserRole[] =
    currentRole === "super_admin"
      ? ["gestor", "almoxarife", "requisitante"]
      : ["almoxarife", "requisitante"];

  async function promover(u: Profile) {
    const nome = u.full_name || u.email;
    const ok = await confirmar({
      titulo: `Tornar "${nome}" um super admin?`,
      mensagem:
        "Ele passa a poder excluir documentos, gerenciar todos os usuários e conceder o mesmo papel a outras pessoas. Depois disso, só ele próprio poderá alterar seu papel.",
      rotuloConfirmar: "Tornar super admin",
    });
    if (!ok) return;
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
        fotoBase64: fotoNova ? await paraDataUrl(fotoNova.blob) : null,
        grupoId: novo.grupo || null,
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
          grupo: "",
        });
        setCriando(false);
        setFotoNova(null);
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
      <Dialogo />

      {editandoUsuario && (
        <EditarUsuario
          usuario={editandoUsuario}
          papeisDisponiveis={availableRoles}
          grupos={grupos}
          departamentos={departamentos}
          cargos={cargos}
          aoFechar={() => setEditandoUsuario(null)}
        />
      )}

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
              <label htmlFor="novo-grupo" className={rotulo}>
                Grupo
              </label>
              <select
                id="novo-grupo"
                value={novo.grupo}
                onChange={(e) => setNovo({ ...novo, grupo: e.target.value })}
                className={campo}
              >
                <option value="">Definir depois</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome} (nível {g.nivel})
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

          <div className="mt-4 border-t border-[var(--neo-line)] pt-4">
            <SeletorDeFoto
              nome={novo.nome}
              email={novo.email}
              rotulo="Foto"
              aoEscolher={setFotoNova}
            />
          </div>

          <button
            type="button"
            onClick={criar}
            disabled={pending || !novoValido}
            className="mt-4 rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
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
          <table className="w-full sm:min-w-[760px] text-sm tabela-mobile">
            <thead className="bg-[var(--neo-flat)] text-xs uppercase text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Nome / Email</th>
                <th className="px-4 py-3 text-left">Função</th>
                <th className="px-4 py-3 text-left">Grupo</th>
                <th className="px-4 py-3 text-left">Departamento</th>
                <th className="px-4 py-3 text-left">Situação</th>
                <th className="px-4 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--neo-line)]">
              {users.map((u) => {
                const ehSuperAdmin = u.role === "super_admin";
                const ehSuperAdminPrincipal =
                  currentEmail.trim().toLowerCase() === SUPER_ADMIN_PRINCIPAL_EMAIL;
                const podeAlterarFuncao =
                  u.id !== meuId &&
                  (currentRole === "super_admin" &&
                    (!ehSuperAdmin || ehSuperAdminPrincipal));
                // Os demais campos de um super admin continuam protegidos.
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
                    <td data-rotulo="Nome / Email" className="px-4 py-3">
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
                    <td data-rotulo="Função" className="px-4 py-3">
                      <SeletorEmBotao
                        rotulo={`Função de ${u.full_name || u.email}`}
                        valor={u.role}
                        texto={roleLabel(u.role)}
                        opcoes={availableRoles.map((r) => ({
                          valor: r,
                          texto: ROLE_LABELS[r],
                        }))}
                        editavel={podeAlterarFuncao || editable}
                        ocupado={busy}
                        aparencia={
                          ehSuperAdmin
                            ? "font-bold text-[var(--primary-strong)]"
                            : undefined
                        }
                        aoEscolher={(valor) =>
                          run(u.id, () => updateUserRole(u.id, valor as UserRole))
                        }
                      />
                    </td>
                    <td data-rotulo="Grupo" className="px-4 py-3">
                      <SeletorEmBotao
                        rotulo={`Grupo de ${u.full_name || u.email}`}
                        valor={u.group_id ?? ""}
                        texto={
                          grupos.find((g) => g.id === u.group_id)?.nome ??
                          "Sem grupo"
                        }
                        opcoes={[
                          { valor: "", texto: "Sem grupo" },
                          ...grupos.map((g) => ({
                            valor: g.id,
                            texto: `${g.nome} (nível ${g.nivel})`,
                          })),
                        ]}
                        editavel={editable}
                        ocupado={busy}
                        apagado={!u.group_id}
                        aoEscolher={(valor) =>
                          run(u.id, () => definirGrupoDoUsuario(u.id, valor || null))
                        }
                      />
                    </td>
                    <td data-rotulo="Departamento" className="px-4 py-3">
                      {/* A dica traz o cargo: o departamento diz onde a pessoa
                          trabalha, e a pergunta seguinte é sempre o que ela faz
                          ali — sem precisar de mais uma coluna na tabela. */}
                      <Tooltip
                        lado="cima"
                        texto={`${u.full_name || u.email} — ${
                          cargos.find((c) => c.id === u.cargo_id)?.nome ??
                          "sem cargo definido"
                        }`}
                      >
                      <SeletorEmBotao
                        rotulo={`Departamento de ${u.full_name || u.email}`}
                        valor={u.departamento ?? ""}
                        texto={u.departamento || "Sem departamento"}
                        opcoes={[
                          { valor: "", texto: "Sem departamento" },
                          ...departamentos.map((d) => ({ valor: d, texto: d })),
                        ]}
                        editavel={editable}
                        ocupado={busy}
                        apagado={!u.departamento}
                        aoEscolher={(valor) =>
                          run(u.id, () => definirDepartamento(u.id, valor || null))
                        }
                      />
                      </Tooltip>
                    </td>
                    <td data-rotulo="Situação" className="px-4 py-3">
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
                      {/* Ícones, e não texto repetido: "Editar" e "Tornar super
                          admin" em toda linha somam mais ruído que informação.
                          Cada um leva rótulo acessível e dica, porque ícone
                          sozinho é adivinhação. */}
                      <div className="flex items-center gap-1">
                        {editable && (
                          <Tooltip
                            lado="cima"
                            texto={`Editar ${u.full_name || u.email} — função, grupo, departamento, cargo e situação`}
                          >
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditandoUsuario(u)}
                              aria-label={`Editar ${u.full_name || u.email}`}
                              className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] disabled:opacity-50"
                            >
                              <IconeEditar />
                            </button>
                          </Tooltip>
                        )}

                        {!ehSuperAdmin &&
                          u.id !== meuId &&
                          currentRole === "super_admin" &&
                          situacao === "ativo" && (
                            <Tooltip
                              lado="cima"
                              texto="Tornar super admin — passa a poder excluir documentos e gerenciar todos os usuários"
                            >
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => promover(u)}
                                aria-label={`Tornar ${u.full_name || u.email} super admin`}
                                className="neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--primary-strong)] disabled:opacity-50"
                              >
                                <IconeSuperAdmin />
                              </button>
                            </Tooltip>
                          )}

                        {ehSuperAdmin && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {u.id === meuId ? "sua conta" : "protegido"}
                          </span>
                        )}
                        {!ehSuperAdmin && u.id === meuId && (
                          <span className="text-xs text-[var(--text-muted)]">
                            sua conta
                          </span>
                        )}
                      </div>
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
 * Um valor que vira seletor ao ser pressionado.
 *
 * Antes cada célula mostrava o seletor aberto o tempo todo, e a coluna de
 * situação mostrava seletor E pastilha, dizendo a mesma coisa duas vezes. Numa
 * tabela de vinte pessoas isso são sessenta caixas cinzas competindo com o
 * conteúdo, e a tela parece um formulário em vez de uma lista.
 *
 * Aqui o valor é só um valor até alguém querer mudá-lo. O seletor abre no
 * clique, já com o foco, e fecha ao escolher ou ao perder o foco — nenhuma
 * confirmação a mais do que já havia.
 */
function SeletorEmBotao({
  rotulo,
  valor,
  texto,
  opcoes,
  editavel,
  ocupado,
  aparencia,
  apagado,
  aoEscolher,
}: {
  rotulo: string;
  valor: string;
  texto: string;
  opcoes: { valor: string; texto: string }[];
  editavel: boolean;
  ocupado: boolean;
  /** Classes extras do rótulo em repouso. */
  aparencia?: string;
  /** Valor ausente: fica esmaecido, como um campo por preencher. */
  apagado?: boolean;
  aoEscolher: (valor: string) => void;
}) {
  const [editando, setEditando] = useState(false);

  if (!editavel) {
    return (
      <span className={aparencia ?? "text-sm text-[var(--text-muted)]"}>{texto}</span>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        disabled={ocupado}
        onClick={() => setEditando(true)}
        aria-label={`${rotulo}: ${texto}. Pressione para alterar`}
        className={`neo-button rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
          apagado ? "text-[var(--text-muted)]" : "text-[var(--text)]"
        } ${aparencia ?? ""}`}
      >
        {texto}
      </button>
    );
  }

  return (
    <select
      autoFocus
      value={valor}
      disabled={ocupado}
      aria-label={rotulo}
      onBlur={() => setEditando(false)}
      onChange={(e) => {
        setEditando(false);
        if (e.target.value !== valor) aoEscolher(e.target.value);
      }}
      className="rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
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
  const [editando, setEditando] = useState(false);
  const [pedindoData, setPedindoData] = useState(false);
  const [data, setData] = useState(perfil.retorno_previsto ?? "");

  const emFerias = situacao === "ferias" && perfil.retorno_previsto;

  const pastilha = (
    <span className={STATUS_CLASSES[situacao]}>{STATUS_LABELS[situacao]}</span>
  );

  const dica = emFerias
    ? `Volta prevista para ${formatDate(perfil.retorno_previsto!)}. A conta volta a Ativo sozinha no primeiro acesso a partir dessa data.`
    : null;

  // Sem permissão de alterar, a pastilha é só informação.
  if (!editavel) {
    return dica ? (
      <Tooltip lado="cima" texto={dica}>
        {pastilha}
      </Tooltip>
    ) : (
      pastilha
    );
  }

  // Escolher "Férias" exige a data de volta antes de salvar: o banco recusa
  // férias sem prazo, e é essa data que devolve a conta ao normal sozinha.
  if (pedindoData) {
    return (
      <div className="space-y-2">
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Retorno previsto
        </label>
        <input
          type="date"
          min={amanha()}
          value={data}
          autoFocus
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
    );
  }

  if (editando) {
    return (
      <select
        autoFocus
        value={situacao}
        disabled={ocupado}
        aria-label={`Situação de ${perfil.full_name || perfil.email}`}
        onBlur={() => setEditando(false)}
        onChange={(e) => {
          const escolha = e.target.value as StatusUsuario;
          setEditando(false);
          if (escolha === situacao) return;
          if (escolha === "ferias") {
            setData(perfil.retorno_previsto ?? "");
            setPedindoData(true);
            return;
          }
          aoSalvar(escolha, null);
        }}
        className="rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
      >
        <option value="ativo">Ativo</option>
        <option value="ferias">Férias</option>
        <option value="inativo">Inativo</option>
      </select>
    );
  }

  // Em repouso, a própria pastilha é o botão: um só elemento diz a situação e
  // oferece a mudança, em vez de a coluna repetir a mesma informação duas
  // vezes — uma no seletor e outra na pastilha ao lado.
  const botao = (
    <button
      type="button"
      disabled={ocupado}
      onClick={() => setEditando(true)}
      aria-label={`Situação: ${STATUS_LABELS[situacao]}. Pressione para alterar`}
      className="rounded-full disabled:opacity-50"
    >
      {pastilha}
    </button>
  );

  return (
    <div className="space-y-1">
      <Tooltip
        lado="cima"
        texto={dica ?? `${STATUS_LABELS[situacao]} — pressione para alterar`}
      >
        {botao}
      </Tooltip>

      {emFerias && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Volta em {formatDate(perfil.retorno_previsto!)}
        </p>
      )}
    </div>
  );
}

const campo =
  "mt-2 w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]";
