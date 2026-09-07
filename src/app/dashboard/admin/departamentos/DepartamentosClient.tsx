"use client";

import { useConfirmacao } from "@/components/ui/Confirmacao";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarDepartamento,
  atualizarDepartamento,
  excluirDepartamento,
} from "@/app/actions/departamentos";
import { definirDepartamentoDaPessoa } from "@/app/actions/cargos";
import { formatDate, roleLabel } from "@/lib/labels";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import type { Departamento, MembroDepartamento } from "@/types/modules/admin";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

export default function DepartamentosClient({
  inicial,
  membros,
  ehAdmin,
  podeGerenciarPessoas,
}: {
  inicial: Departamento[];
  /** Pessoas de cada departamento, indexadas pelo nome. */
  membros: Record<string, MembroDepartamento[]>;
  ehAdmin: boolean;
  /** Quem pode mover pessoas entre departamentos. */
  podeGerenciarPessoas: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [equipeAberta, setEquipeAberta] = useState<Departamento | null>(null);
  const { confirmar, Dialogo } = useConfirmacao();

  const [novo, setNovo] = useState({ nome: "", descricao: "" });
  const [rascunho, setRascunho] = useState({
    nome: "",
    descricao: "",
    ativo: true,
    propagar: true,
  });

  function abrirEdicao(d: Departamento) {
    setEditando(d.id);
    setCriando(false);
    setAviso(null);
    setRascunho({
      nome: d.nome,
      descricao: d.descricao ?? "",
      ativo: d.ativo,
      propagar: true,
    });
  }

  function salvarNovo() {
    setAviso(null);
    iniciar(async () => {
      const res = await criarDepartamento(novo.nome, novo.descricao);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setNovo({ nome: "", descricao: "" });
      setCriando(false);
      setAviso({ tipo: "ok", texto: `Departamento "${res.data.nome}" criado.` });
      router.refresh();
    });
  }

  function salvarEdicao(id: string, nomeAtual: string) {
    setAviso(null);
    iniciar(async () => {
      const res = await atualizarDepartamento(
        id,
        rascunho.nome,
        rascunho.descricao,
        rascunho.ativo,
        rascunho.propagar
      );
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setEditando(null);
      setAviso({
        tipo: "ok",
        texto:
          res.data.registrosAtualizados > 0
            ? `Departamento atualizado e ${res.data.registrosAtualizados} registro(s) renomeado(s).`
            : nomeAtual !== rascunho.nome.trim()
              ? "Departamento renomeado. Os registros antigos mantiveram o nome anterior."
              : "Departamento atualizado.",
      });
      router.refresh();
    });
  }

  async function excluir(d: Departamento) {
    const ok = await confirmar({
      titulo: `Excluir o departamento "${d.nome}"?`,
      mensagem:
        "Documentos e pastas já gravados mantêm o nome antigo. Se o departamento só saiu de uso, desative-o em vez de excluir.",
      rotuloConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setAviso(null);
    iniciar(async () => {
      const res = await excluirDepartamento(d.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: "Departamento excluído." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {aviso && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--success)] text-[var(--text)]"
              : "bg-[var(--danger)] text-[var(--text)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <section className="neo-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">
              {inicial.length} departamento(s)
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Alimentam o campo &quot;Departamento de origem&quot; do GED.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCriando((c) => !c);
              setEditando(null);
            }}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] shadow-[10px_10px_18px_rgba(122,109,216,0.28)]"
          >
            {criando ? "Cancelar" : "Novo departamento"}
          </button>
        </div>

        {criando && (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Nome *</label>
              <input
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Ex.: Compras"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Descrição</label>
              <input
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                placeholder="O que este departamento arquiva"
                className={campo}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={salvarNovo}
                disabled={pendente}
                className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
              >
                {pendente ? "Salvando…" : "Criar"}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {inicial.map((d) => (
          <div key={d.id} className="neo-card p-5">
            {editando === d.id ? (
              <div className="space-y-3">
                <div>
                  <label className={rotulo}>Nome</label>
                  <input
                    value={rascunho.nome}
                    onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo}>Descrição</label>
                  <input
                    value={rascunho.descricao}
                    onChange={(e) =>
                      setRascunho({ ...rascunho, descricao: e.target.value })
                    }
                    className={campo}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={rascunho.ativo}
                    onChange={(e) => setRascunho({ ...rascunho, ativo: e.target.checked })}
                  />
                  Ativo (aparece nas listas do GED)
                </label>

                {rascunho.nome.trim() !== d.nome && (
                  <label className="flex items-start gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={rascunho.propagar}
                      onChange={(e) =>
                        setRascunho({ ...rascunho, propagar: e.target.checked })
                      }
                      className="mt-1"
                    />
                    <span>
                      Renomear também nos documentos e pastas já cadastrados.
                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Sem isso, o histórico continua com o nome antigo — o que pode
                        ser o desejado se o departamento mudou de nome ao longo do tempo.
                      </span>
                    </span>
                  </label>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => salvarEdicao(d.id, d.nome)}
                    disabled={pendente}
                    className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
                  >
                    {pendente ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-[var(--text)]">{d.nome}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      d.ativo
                        ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                        : "bg-[var(--surface-strong)] text-[var(--muted)]"
                    }`}
                  >
                    {d.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                {d.descricao && (
                  <p className="mt-2 text-sm text-[var(--muted)]">{d.descricao}</p>
                )}

                <FileiraDeAvatares
                  pessoas={membros[d.nome] ?? []}
                  aoAbrir={() => setEquipeAberta(d)}
                />

                <p className="mt-3 border-t border-[var(--stroke)] pt-3 text-xs text-[var(--muted)]">
                  Criado em {formatDate(d.created_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(d)}
                    className="neo-button rounded-full px-4 py-2 text-xs font-bold text-[var(--text)]"
                  >
                    Editar
                  </button>
                  {ehAdmin && (
                    <button
                      type="button"
                      onClick={() => excluir(d)}
                      disabled={pendente}
                      className="rounded-full bg-[var(--danger)] px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {inicial.length === 0 && (
        <p className="neo-card p-10 text-center text-sm text-[var(--muted)]">
          Nenhum departamento cadastrado. Crie o primeiro acima.
        </p>
      )}

      <Dialogo />

      {equipeAberta && (
        <PainelDaEquipe
          departamento={equipeAberta}
          pessoas={membros[equipeAberta.nome] ?? []}
          disponiveis={Object.entries(membros)
            .filter(([dep]) => dep !== equipeAberta.nome)
            .flatMap(([, lista]) => lista)}
          podeGerenciar={podeGerenciarPessoas}
          aoFechar={() => setEquipeAberta(null)}
        />
      )}
    </div>
  );
}

/**
 * As pessoas do departamento, em círculos sobrepostos.
 *
 * Mostra no máximo cinco e resume o resto num "+N": a fileira serve para
 * reconhecer de relance quem está ali, e passar de cinco rostos já não se lê de
 * relance. O nome vem na dica, e o painel completo abre no clique.
 */
function FileiraDeAvatares({
  pessoas,
  aoAbrir,
}: {
  pessoas: MembroDepartamento[];
  aoAbrir: () => void;
}) {
  if (pessoas.length === 0) {
    return (
      <p className="mt-3 text-xs text-[var(--muted)]">
        Ninguém lotado aqui ainda. O departamento é atribuído em Administração →
        Usuários.
      </p>
    );
  }

  const visiveis = pessoas.slice(0, 5);
  const restantes = pessoas.length - visiveis.length;

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="neo-pilha flex items-center">
        {visiveis.map((p) => (
          <Tooltip key={p.id} lado="cima" texto={`${p.nome} — ${roleLabel(p.role)}`}>
            <button
              type="button"
              onClick={aoAbrir}
              aria-label={`Ver a equipe de ${p.nome}`}
              className="relative rounded-full ring-2 ring-[var(--surface)] transition-transform hover:z-10 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] active:scale-95"
            >
              <Avatar nome={p.nome} email={p.email} url={p.avatar_url} tamanho={32} />
            </button>
          </Tooltip>
        ))}
      </div>

      <button
        type="button"
        onClick={aoAbrir}
        className="text-xs font-semibold text-[var(--primary)] hover:underline"
      >
        {restantes > 0
          ? `+${restantes} — ver todos`
          : `${pessoas.length} pessoa${pessoas.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

/**
 * Quem trabalha no departamento — e a porta para mudar isso.
 *
 * O cargo aparece ao lado do nome porque "quem é do Financeiro" e "quem faz o
 * quê no Financeiro" são perguntas diferentes, e a segunda é a que importa
 * quando alguém precisa falar com a pessoa certa.
 *
 * Mover alguém de departamento muda o que ela enxerga no GED: os documentos de
 * visibilidade "departamento" seguem esse campo. A tela diz isso, em vez de
 * deixar a descoberta para depois.
 */
function PainelDaEquipe({
  departamento,
  pessoas,
  disponiveis,
  podeGerenciar,
  aoFechar,
}: {
  departamento: Departamento;
  pessoas: MembroDepartamento[];
  /** Quem está em outro departamento, ou em nenhum. */
  disponiveis: MembroDepartamento[];
  podeGerenciar: boolean;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  function mover(userId: string, destino: string | null) {
    setErro("");
    iniciar(async () => {
      const res = await definirDepartamentoDaPessoa(userId, destino);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      router.refresh();
    });
  }

  const filtrados = busca.trim()
    ? disponiveis.filter((p) =>
        `${p.nome} ${p.email}`.toLowerCase().includes(busca.trim().toLowerCase())
      )
    : disponiveis;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Equipe de ${departamento.nome}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={aoFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neo-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[var(--text)]">
              {departamento.nome}
            </h3>
            <p className="text-sm text-[var(--muted)]">
              {pessoas.length} pessoa{pessoas.length === 1 ? "" : "s"} neste
              departamento
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="neo-button rounded-full px-3 py-1.5 text-sm font-bold text-[var(--text)]"
          >
            ✕
          </button>
        </div>

        {erro && (
          <p className="mt-3 rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm text-[var(--erro-fg)]">
            {erro}
          </p>
        )}

        {podeGerenciar && (
          <button
            type="button"
            onClick={() => setAdicionando((a) => !a)}
            className="mt-4 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--on-accent)]"
          >
            {adicionando ? "Cancelar" : "Acrescentar pessoas"}
          </button>
        )}

        {adicionando && podeGerenciar && (
          <div className="mt-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar por nome ou e-mail"
              className="w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]"
            />

            <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
              {filtrados.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--neo-bg)] p-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      nome={p.nome}
                      email={p.email}
                      url={p.avatar_url}
                      tamanho={32}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {p.nome}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {p.cargo ?? "Sem cargo"}
                        {p.departamentoAtual
                          ? ` · hoje em ${p.departamentoAtual}`
                          : " · sem departamento"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => mover(p.id, departamento.nome)}
                    className="neo-button rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)] disabled:opacity-50"
                  >
                    Acrescentar
                  </button>
                </li>
              ))}

              {filtrados.length === 0 && (
                <li className="py-2 text-sm text-[var(--muted)]">
                  Ninguém encontrado.
                </li>
              )}
            </ul>

            <p className="mt-2 text-xs text-[var(--muted)]">
              Cada pessoa fica em um departamento por vez, e é ele que decide quais
              documentos do GED ela enxerga.
            </p>
          </div>
        )}

        <ul className="mt-4 space-y-3">
          {pessoas.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  nome={p.nome}
                  email={p.email}
                  url={p.avatar_url}
                  tamanho={44}
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text)]">
                    {p.nome}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">{p.email}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--primary-strong)]">
                    {p.cargo ?? "Sem cargo definido"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {roleLabel(p.role)}
                    {!p.ativo && " · sem acesso"}
                  </p>
                </div>
              </div>

              {podeGerenciar && (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => mover(p.id, null)}
                  className="text-xs font-semibold text-[var(--erro-fg)] hover:underline disabled:opacity-50"
                >
                  Tirar do departamento
                </button>
              )}
            </li>
          ))}

          {pessoas.length === 0 && (
            <li className="rounded-2xl border border-dashed border-[var(--stroke)] p-6 text-center text-sm text-[var(--muted)]">
              Ninguém neste departamento ainda. Use &quot;Acrescentar pessoas&quot;.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
