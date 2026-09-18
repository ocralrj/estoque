"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  comentarTarefa,
  excluirTarefa,
  mudarStatusTarefa,
} from "@/app/actions/tarefas";
import {
  TAREFA_PRIORIDADE_LABELS,
  tarefaAtrasada,
  tarefaDiasDeAtraso,
  tarefaPrioridadeClass,
  tarefaVenceHoje,
  type Tarefa,
  type TarefaComentario,
  type TarefaStatus,
} from "@/types/modules/tarefas";

const COLUNAS: {
  status: TarefaStatus;
  titulo: string;
  subtitulo: string;
}[] = [
  { status: "aguardando", titulo: "Aguardando", subtitulo: "Chegou para o usuário iniciar." },
  { status: "em_andamento", titulo: "Em andamento", subtitulo: "Aprovada e designada. Alguém está executando." },
  { status: "confirmacao", titulo: "Confirmação", subtitulo: "Executada, falta quem pediu confirmar que resolveu." },
  { status: "concluida", titulo: "Concluída", subtitulo: "Confirmada por quem pediu." },
  { status: "cancelada", titulo: "Cancelada", subtitulo: "Recusada no encaminhamento ou desistência de quem pediu." },
];

interface DadosKanban {
  tarefas: Tarefa[];
  comentariosPorTarefa: Map<string, TarefaComentario[]>;
  meuId: string;
  ehSuperAdmin: boolean;
}

type Papel = "solicitante" | "executor" | "admin";

function papelDa(tarefa: Tarefa, meuId: string, ehSuperAdmin: boolean): Papel {
  if (ehSuperAdmin) return "admin";
  if (tarefa.created_by === meuId) return "solicitante";
  if (tarefa.assigned_to === meuId) return "executor";
  return "solicitante";
}

/** Ações rápidas contextuais por situação e papel. O banco é a barreira final. */
function acoesRapidas(
  tarefa: Tarefa,
  papel: Papel
): { rotulo: string; destino: TarefaStatus; classe: string; confirmar?: boolean }[] {
  switch (tarefa.status) {
    case "aguardando":
      if (papel === "executor" || papel === "admin")
        return [
          { rotulo: "Iniciar", destino: "em_andamento", classe: "neo-btn--primario" },
          { rotulo: "Recusar", destino: "cancelada", classe: "neo-btn--perigo", confirmar: true },
        ];
      return [{ rotulo: "Cancelar", destino: "cancelada", classe: "neo-btn--perigo", confirmar: true }];
    case "em_andamento":
      if (papel === "executor" || papel === "admin")
        return [
          { rotulo: "Marcar como feita", destino: "confirmacao", classe: "acaoLaranja" },
          { rotulo: "Devolver à Central", destino: "aguardando", classe: "acaoCinza" },
        ];
      return [{ rotulo: "Cancelar", destino: "cancelada", classe: "neo-btn--perigo", confirmar: true }];
    case "confirmacao":
      if (papel === "solicitante")
        return [
          { rotulo: "Confirmar conclusão", destino: "concluida", classe: "acaoVerde" },
          { rotulo: "Devolver à Central", destino: "aguardando", classe: "acaoCinza" },
          { rotulo: "Cancelar", destino: "cancelada", classe: "neo-btn--perigo", confirmar: true },
        ];
      if (papel === "admin")
        return [
          { rotulo: "Devolver à Central", destino: "aguardando", classe: "acaoCinza" },
          { rotulo: "Cancelar", destino: "cancelada", classe: "neo-btn--perigo", confirmar: true },
        ];
      return [{ rotulo: "Devolver à Central", destino: "em_andamento", classe: "acaoCinza" }];
    default:
      return [];
  }
}

function formatarDiaMes(data: string | null): string {
  if (!data) return "—";
  const d = new Date(data);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatoPrazo(data: string | null): string {
  if (!data) return "—";
  return formatarDiaMes(data);
}

interface PropsCard {
  tarefa: Tarefa;
  comentarios: TarefaComentario[];
  papel: Papel;
}

function CardTarefa({ tarefa, comentarios, papel }: PropsCard) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const detalhesRef = useRef<HTMLDetailsElement>(null);

  const diasAtraso = tarefaDiasDeAtraso(tarefa);
  const venceHoje = tarefaVenceHoje(tarefa);
  const atrasada = tarefaAtrasada(tarefa);
  const semAcao = tarefa.status === "concluida" || tarefa.status === "cancelada";
  const podeRemover = papel === "solicitante" || papel === "admin";
  const podeComentar = !tarefa.status.startsWith("conclui") && !tarefa.status.startsWith("cancela");

  function agir(destino: TarefaStatus, confirmar?: boolean) {
    if (confirmar && !window.confirm("Deseja mesmo aplicar esta mudança?")) return;
    iniciarTransicao(async () => {
      const resultado = await mudarStatusTarefa(tarefa.id, destino);
      if (!resultado.ok) setErro(resultado.message);
      else {
        setErro(null);
        router.refresh();
      }
    });
  }

  function enviarComentario() {
    if (!comentario.trim()) return;
    iniciarTransicao(async () => {
      const resultado = await comentarTarefa(tarefa.id, comentario.trim());
      if (!resultado.ok) setErro(resultado.message);
      else {
        setComentario("");
        setErro(null);
        router.refresh();
      }
    });
  }

  function remover() {
    if (!window.confirm("Remover a tarefa e todo o histórico? Esta ação não pode ser desfeita.")) return;
    iniciarTransicao(async () => {
      const resultado = await excluirTarefa(tarefa.id);
      if (!resultado.ok) setErro(resultado.message);
      else {
        setErro(null);
        router.refresh();
      }
    });
  }

  return (
    <article className="neo-flat p-4">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]" title={tarefa.titulo}>
          {tarefa.titulo}
        </h3>
        <span className={tarefaPrioridadeClass(tarefa.prioridade)}>
          {TAREFA_PRIORIDADE_LABELS[tarefa.prioridade] ?? tarefa.prioridade}
        </span>
      </header>

      {(venceHoje || atrasada) && (
        <p className="mb-2 flex flex-wrap gap-2">
          {venceHoje && <span className="neo-badge neo-badge--aviso">Prazo hoje</span>}
          {atrasada && diasAtraso !== null && (
            <span className="neo-badge neo-badge--erro">
              {diasAtraso === 1 ? "1 dia de atraso" : `${diasAtraso} dias de atraso`}
            </span>
          )}
        </p>
      )}

      <dl className="mb-3 space-y-1 text-xs text-[var(--text-muted)]">
        <div className="flex justify-between gap-2">
          <dt className="sr-only">Solicitante</dt>
          <dd className="truncate">Pediu: {tarefa.criada_por?.full_name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="sr-only">Executor</dt>
          <dd className="truncate">Executa: {tarefa.executor?.full_name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="sr-only">Prazo</dt>
          <dd className="shrink-0">Prazo: {formatoPrazo(tarefa.prazo)}</dd>
        </div>
      </dl>

      {!semAcao && (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {acoesRapidas(tarefa, papel).map((a) => (
              <button
                key={a.rotulo}
                type="button"
                disabled={pendente}
                onClick={() => agir(a.destino, a.confirmar)}
                className={`neo-btn !min-h-[36px] !px-3 !py-1.5 text-xs ${a.classe}`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          {podeComentar && (
            <div className="mb-2 flex gap-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enviarComentario();
                }}
                placeholder="Comentário rápido…"
                className="min-h-[38px] flex-1 rounded-[var(--r-md)] border border-[var(--neo-edge)] bg-[var(--neo-bg)] px-3 text-sm text-[var(--text)] shadow-[var(--afundado)] outline-none"
              />
              <button
                type="button"
                disabled={pendente || !comentario.trim()}
                onClick={enviarComentario}
                className="neo-btn neo-btn--primario !min-h-[38px] !px-3 !py-1.5 text-xs"
              >
                Enviar
              </button>
            </div>
          )}
        </>
      )}

      <footer className="flex items-center gap-2 border-t border-[var(--neo-edge)] pt-2">
        <details ref={detalhesRef} className="min-w-0 flex-1">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--primary)]">
            Histórico e edição ({comentarios.length})
          </summary>
          <div className="mt-2 space-y-2">
            {comentarios.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">Sem comentários ainda.</p>
            )}
            {comentarios.map((c) => (
              <div key={c.id} className="rounded-[var(--r-sm)] bg-[var(--neo-bg)] p-2 shadow-[var(--afundado-leve)]">
                <p className="text-[11px] font-semibold text-[var(--text)]">
                  {c.autor?.full_name ?? "Alguém"}{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    {new Date(c.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--text)]">{c.texto}</p>
              </div>
            ))}
          </div>
        </details>
        {podeRemover && (
          <button
            type="button"
            disabled={pendente}
            onClick={remover}
            className="neo-btn neo-btn--fantasma !min-h-[36px] !px-3 !py-1.5 text-xs !text-[var(--erro-fg)]"
          >
            Remover
          </button>
        )}
      </footer>

      {erro && <p className="neo-msg !opacity-100 mt-2">{erro}</p>}
    </article>
  );
}

export default function KanbanTarefas(dados: DadosKanban) {
  const { tarefas, comentariosPorTarefa, meuId, ehSuperAdmin } = dados;

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {COLUNAS.map((coluna) => {
          const itens = tarefas.filter((t) => t.status === coluna.status);
          return (
            <section key={coluna.status} className="w-[300px] shrink-0 sm:w-[320px]">
              <div className="mb-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                  {coluna.titulo}
                  <span className="neo-badge neo-badge--info">{itens.length}</span>
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{coluna.subtitulo}</p>
              </div>
              <div className="space-y-3">
                {itens.length === 0 && (
                  <div className="rounded-[var(--r-md)] border border-dashed border-[var(--neo-edge)] p-4 text-center text-xs text-[var(--text-disabled)]">
                    Nada por aqui
                  </div>
                )}
                {itens.map((t) => (
                  <CardTarefa
                    key={t.id}
                    tarefa={t}
                    comentarios={comentariosPorTarefa.get(t.id) ?? []}
                    papel={papelDa(t, meuId, ehSuperAdmin)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <style jsx>{`
        .acaoLaranja {
          color: white;
          background-image: linear-gradient(135deg, var(--aviso-solid), var(--aviso-fg));
        }
        .acaoCinza {
          color: var(--text-muted);
          background-color: var(--neo-flat);
        }
        .acaoVerde {
          color: white;
          background-image: linear-gradient(135deg, var(--ok-solid), var(--ok-fg));
        }
      `}</style>
    </div>
  );
}