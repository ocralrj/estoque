"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSuggestion, listMySuggestions } from "@/app/actions/suggestions";
import {
  clarifyImprovementIdea,
  summarizeImprovementIdea,
} from "@/app/actions/ai-suggest";
import type {
  ImprovementSuggestion,
  SuggestionMessage,
  SummaryResult,
} from "@/types/modules/suggestions";
import {
  SUGGESTION_PRIORITY_LABELS,
  SUGGESTION_STATUS_COLORS,
  SUGGESTION_STATUS_LABELS,
} from "@/types/modules/suggestions";
import { clsx } from "clsx";

type Tab = "nova" | "pedidos";
type Step = "chat" | "summary" | "success";

interface SuggestImprovementModalProps {
  open: boolean;
  onClose: () => void;
}

const WELCOME: SuggestionMessage = {
  role: "assistant",
  content:
    'Olá! Descreva a melhoria que você gostaria de ver no sistema. Eu te ajudo a deixar o pedido claro — foco no que você quer e no porquê. Quando estiver pronto, clique em "Gerar resumo".',
  at: new Date().toISOString(),
};

export default function SuggestImprovementModal({
  open,
  onClose,
}: SuggestImprovementModalProps) {
  const [tab, setTab] = useState<Tab>("nova");
  const [step, setStep] = useState<Step>("chat");
  const [messages, setMessages] = useState<SuggestionMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<string | null>(null);
  const [myList, setMyList] = useState<ImprovementSuggestion[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const resetChat = useCallback(() => {
    setMessages([{ ...WELCOME, at: new Date().toISOString() }]);
    setInput("");
    setStep("chat");
    setReady(false);
    setSummary(null);
    setError(null);
    setAiMeta(null);
    setSubmittedCode(null);
    setThinking(false);
  }, []);

  useEffect(() => {
    if (open) {
      setTab("nova");
      resetChat();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, resetChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step, thinking]);

  async function loadMySuggestions() {
    setLoadingList(true);
    const res = await listMySuggestions();
    if (res.ok) setMyList(res.data);
    setLoadingList(false);
  }

  useEffect(() => {
    if (open && tab === "pedidos") {
      loadMySuggestions();
    }
  }, [open, tab]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || thinking) return;

    const userMsg: SuggestionMessage = {
      role: "user",
      content: text,
      at: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setError(null);
    setThinking(true);

    try {
      const result = await clarifyImprovementIdea(next);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setMessages([
        ...next,
        {
          role: "assistant",
          content: result.reply,
          at: new Date().toISOString(),
        },
      ]);
      setReady(result.ready_for_summary);
      setAiMeta(
        result.source === "ai"
          ? "Sugestão gerada por IA — revise antes de enviar"
          : "Modo local (IA indisponível ou sem chave)"
      );
    } catch {
      setError("Não foi possível responder agora. Tente novamente.");
    } finally {
      setThinking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleGenerateSummary() {
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) {
      setError("Escreva sua ideia antes de gerar o resumo.");
      return;
    }

    setThinking(true);
    setError(null);

    try {
      const result = await summarizeImprovementIdea(messages);
      if (!result.ok) {
        setError(result.message);
        setThinking(false);
        return;
      }
      setSummary({
        title: result.title,
        summary: result.summary,
        what_wanted: result.what_wanted,
        why_wanted: result.why_wanted,
        priority: result.priority,
        module_hint: result.module_hint,
      });
      setAiMeta(
        result.source === "ai"
          ? `Resumo por IA${result.confianca ? ` (confiança: ${result.confianca})` : ""} — edite se precisar`
          : "Resumo local — edite se precisar"
      );
      setStep("summary");
    } catch {
      setError("Não foi possível gerar o resumo agora. Tente novamente.");
    } finally {
      setThinking(false);
    }
  }

  async function handleSubmit() {
    if (!summary) return;
    setSending(true);
    setError(null);

    const raw_idea = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n");

    const res = await createSuggestion({
      title: summary.title,
      raw_idea,
      summary: summary.summary,
      what_wanted: summary.what_wanted,
      why_wanted: summary.why_wanted,
      conversation: messages,
      priority: summary.priority,
      module_hint: summary.module_hint || undefined,
    });

    setSending(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setSubmittedCode(res.data.code);
    setStep("success");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-title"
        className="relative w-full max-w-lg bg-[var(--neo-bg)] rounded-2xl shadow-2xl border border-[var(--neo-line)] flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-[var(--neo-line)]">
          <div>
            <h2
              id="suggest-title"
              className="text-lg font-semibold text-[var(--text)] flex items-center gap-2"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--aviso-solid)] text-[var(--on-accent)]">
                <MagicIcon />
              </span>
              Sugerir uma melhoria
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Conte sua ideia — a IA ajuda só a deixar o texto claro, sem decidir
              como será feito.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-muted)] p-1 rounded-lg hover:bg-[var(--neo-flat-alt)]"
            aria-label="Fechar"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-3">
          <TabButton active={tab === "nova"} onClick={() => setTab("nova")}>
            Nova sugestão
          </TabButton>
          <TabButton
            active={tab === "pedidos"}
            onClick={() => setTab("pedidos")}
          >
            Meus pedidos
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[280px]">
          {tab === "pedidos" ? (
            <MySuggestionsList
              loading={loadingList}
              items={myList}
              onRefresh={loadMySuggestions}
            />
          ) : step === "success" ? (
            <SuccessView code={submittedCode} onNew={resetChat} onClose={onClose} />
          ) : step === "summary" && summary ? (
            <SummaryView
              summary={summary}
              onChange={setSummary}
              onBack={() => setStep("chat")}
              aiMeta={aiMeta}
            />
          ) : (
            <ChatView
              messages={messages}
              bottomRef={bottomRef}
              thinking={thinking}
            />
          )}
        </div>

        {/* Footer / input */}
        {tab === "nova" && step !== "success" && (
          <div className="border-t border-[var(--neo-line)] px-5 py-4 space-y-3">
            {error && (
              <p className="text-sm text-[var(--erro-solid)] bg-[var(--erro-bg)] rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {aiMeta && step === "chat" && (
              <p className="text-xs text-[var(--text-muted)]">{aiMeta}</p>
            )}

            {step === "chat" && (
              <>
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    disabled={thinking}
                    placeholder="Escreva sua ideia... (Enter envia, Shift+Enter quebra linha)"
                    className="flex-1 resize-none px-3 py-2 border border-[var(--neo-line)] rounded-xl focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent text-sm disabled:bg-[var(--neo-flat)]"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || thinking}
                    className="h-10 w-10 shrink-0 rounded-xl bg-[var(--primary)] text-[var(--on-accent)] flex items-center justify-center hover:brightness-110 disabled:opacity-50 transition-colors"
                    aria-label="Enviar"
                  >
                    <SendIcon />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={resetChat}
                    disabled={thinking}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1 disabled:opacity-50"
                  >
                    <RestartIcon />
                    Recomeçar
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={
                      thinking ||
                      messages.filter((m) => m.role === "user").length === 0
                    }
                    className={clsx(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      ready
                        ? "bg-[var(--primary)] text-[var(--on-accent)] hover:brightness-110"
                        : "bg-[var(--neo-flat-alt)] text-[var(--text)] hover:bg-[var(--neo-flat-alt)]",
                      "disabled:opacity-50"
                    )}
                  >
                    {thinking ? "Gerando..." : "Gerar resumo"}
                  </button>
                </div>
              </>
            )}

            {step === "summary" && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep("chat")}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--neo-flat-alt)] text-[var(--text)] hover:bg-[var(--neo-flat-alt)]"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={sending}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-[var(--on-accent)] hover:brightness-110 disabled:opacity-60"
                >
                  {sending ? "Enviando..." : "Enviar pedido"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
        active
          ? "bg-[var(--primary)] text-[var(--on-accent)]"
          : "bg-[var(--neo-flat-alt)] text-[var(--text)] hover:bg-[var(--neo-flat-alt)]"
      )}
    >
      {children}
    </button>
  );
}

function ChatView({
  messages,
  bottomRef,
  thinking,
}: {
  messages: SuggestionMessage[];
  bottomRef: React.RefObject<HTMLDivElement>;
  thinking?: boolean;
}) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <div
          key={`${m.at}-${i}`}
          className={clsx(
            "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
            m.role === "user"
              ? "ml-auto bg-[var(--primary)] text-[var(--on-accent)] rounded-br-md"
              : "mr-auto bg-[var(--info-bg)] text-[var(--info-fg)] border border-[var(--neo-line)] rounded-bl-md"
          )}
        >
          {m.content}
        </div>
      ))}
      {thinking && (
        <div className="mr-auto max-w-[90%] rounded-2xl rounded-bl-md px-4 py-3 text-sm bg-[var(--neo-flat-alt)] text-[var(--text-muted)] border border-[var(--neo-line)]">
          Organizando sua ideia...
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function SummaryView({
  summary,
  onChange,
  onBack,
  aiMeta,
}: {
  summary: SummaryResult;
  onChange: (s: SummaryResult) => void;
  onBack: () => void;
  aiMeta?: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Revise o resumo abaixo. Você pode editar antes de enviar. A equipe
        decide se e como implementar.
      </p>
      {aiMeta && (
        <p className="text-xs text-[var(--aviso-fg)] bg-[var(--aviso-bg)] border border-[var(--neo-line)] rounded-lg px-3 py-2">
          {aiMeta}. Conteúdo gerado por IA pode conter erros.
        </p>
      )}

      <Field label="Título">
        <input
          value={summary.title}
          onChange={(e) => onChange({ ...summary, title: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--ring)]"
        />
      </Field>

      <Field label="O que você quer">
        <textarea
          rows={3}
          value={summary.what_wanted}
          onChange={(e) =>
            onChange({ ...summary, what_wanted: e.target.value })
          }
          className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--ring)]"
        />
      </Field>

      <Field label="Por quê">
        <textarea
          rows={2}
          value={summary.why_wanted}
          onChange={(e) =>
            onChange({ ...summary, why_wanted: e.target.value })
          }
          className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--ring)]"
        />
      </Field>

      <Field label="Resumo completo">
        <textarea
          rows={4}
          value={summary.summary}
          onChange={(e) => onChange({ ...summary, summary: e.target.value })}
          className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--ring)]"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Prioridade sugerida">
          <select
            value={summary.priority}
            onChange={(e) =>
              onChange({
                ...summary,
                priority: e.target.value as SummaryResult["priority"],
              })
            }
            className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm"
          >
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </Field>
        <Field label="Módulo (opcional)">
          <input
            value={summary.module_hint || ""}
            onChange={(e) =>
              onChange({ ...summary, module_hint: e.target.value || null })
            }
            placeholder="Ex: Estoque"
            className="w-full px-3 py-2 border border-[var(--neo-line)] rounded-lg text-sm"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-[var(--primary)] hover:underline"
      >
        Continuar conversa
      </button>
    </div>
  );
}

function SuccessView({
  code,
  onNew,
  onClose,
}: {
  code: string | null;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ok-bg)] mb-4">
        <CheckIcon />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text)] mb-1">
        Pedido enviado!
      </h3>
      <p className="text-sm text-[var(--text-muted)] mb-2">
        Sua sugestão foi registrada
        {code ? (
          <>
            {" "}
            como <span className="font-mono font-semibold">{code}</span>
          </>
        ) : null}
        .
      </p>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Acompanhe o andamento em &quot;Meus pedidos&quot;.
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={onNew}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-[var(--on-accent)] hover:brightness-110"
        >
          Nova sugestão
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--neo-flat-alt)] text-[var(--text)] hover:bg-[var(--neo-flat-alt)]"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function MySuggestionsList({
  loading,
  items,
  onRefresh,
}: {
  loading: boolean;
  items: ImprovementSuggestion[];
  onRefresh: () => void;
}) {
  if (loading) {
    return <p className="text-sm text-[var(--text-muted)] text-center py-8">Carregando...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-[var(--text-muted)] mb-2">
          Você ainda não enviou nenhum pedido.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="text-sm text-[var(--primary)] hover:underline"
        >
          Atualizar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Atualizar
        </button>
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className="border border-[var(--neo-line)] rounded-xl p-4 hover:bg-[var(--neo-flat)]"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="text-xs font-mono text-[var(--text-muted)]">{item.code}</p>
              <h4 className="text-sm font-semibold text-[var(--text)]">
                {item.title}
              </h4>
            </div>
            <span
              className={clsx(
                "shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full",
                SUGGESTION_STATUS_COLORS[item.status]
              )}
            >
              {SUGGESTION_STATUS_LABELS[item.status]}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-1">
            {item.summary}
          </p>
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-[var(--text-muted)]">
            <span>
              {new Date(item.created_at).toLocaleString("pt-BR")}
            </span>
            <span>·</span>
            <span>
              Prioridade: {SUGGESTION_PRIORITY_LABELS[item.priority]}
            </span>
            {item.module_hint && (
              <>
                <span>·</span>
                <span>{item.module_hint}</span>
              </>
            )}
          </div>
          {item.admin_notes && (
            <p className="mt-2 text-xs bg-[var(--aviso-bg)] text-[var(--aviso-fg)] rounded-lg px-2 py-1">
              Resposta da equipe: {item.admin_notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function MagicIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.5 5.5L9 2l1.5 3.5L14 7l-3.5 1.5L9 12 7.5 8.5 4 7l3.5-1.5zM16 11l1 2.5L20 14.5 17 15.5 16 18l-1-2.5L12 14.5l3-1L16 11zM5 15l.8 2 2 .8-2 .8L5 21l-.8-2.2-2-.8 2-.8L5 15z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-7 h-7 text-[var(--ok-solid)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
