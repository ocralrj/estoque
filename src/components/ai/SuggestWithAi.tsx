"use client";

import { useState } from "react";
import { suggestWithAi } from "@/app/actions/ai-suggest";
import type { AiSuggestionItem } from "@/lib/ai/types";
import { clsx } from "clsx";

export interface SuggestWithAiProps {
  /** Identificador do campo (prompt system) */
  fieldType: string;
  /** O que a IA deve sugerir */
  whatToSuggest: string;
  /** Contexto mínimo do formulário */
  context: Record<string, unknown>;
  /** Texto atual do campo (opcional) */
  currentValue?: string;
  /** Domínio do produto */
  domain?: string;
  /** Quantidade de opções */
  count?: number;
  /** Aplica a sugestão escolhida no campo (não grava no banco) */
  onAccept: (text: string) => void;
  /** Variante visual */
  variant?: "button" | "inline";
  /** Label do botão */
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Botão reutilizável "Sugira com IA".
 * Pipeline no servidor; preview com aceitar / regenerar / descartar.
 * Nunca grava sozinho — human-in-the-loop.
 */
export default function SuggestWithAi({
  fieldType,
  whatToSuggest,
  context,
  currentValue,
  domain = "ERP OCRAL - Estoque e Almoxarifado",
  count = 3,
  onAccept,
  variant = "button",
  label = "Sugira com IA",
  className,
  disabled,
}: SuggestWithAiProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AiSuggestionItem[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [selected, setSelected] = useState(0);

  async function runSuggest() {
    setLoading(true);
    setError(null);
    setOpen(true);

    try {
      const result = await suggestWithAi({
        tipo_campo: fieldType,
        dominio: domain,
        n: count,
        o_que_sugerir: whatToSuggest,
        idioma: "português (Brasil)",
        tom: "profissional e objetivo",
        limite: "até 300 caracteres por sugestão",
        contexto: context,
        entrada_usuario: currentValue?.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.message);
        setItems([]);
        setSource(null);
        return;
      }

      setItems(result.data.sugestoes);
      setAviso(result.data.aviso);
      setSource(result.source);
      setSelected(0);
    } catch {
      setError("Não foi possível gerar sugestões. Tente novamente.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    const text = items[selected]?.texto;
    if (!text) return;
    onAccept(text);
    setOpen(false);
  }

  function handleDiscard() {
    setOpen(false);
    setError(null);
  }

  return (
    <div className={clsx("relative inline-flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={runSuggest}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center gap-1.5 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-1 dark:focus:ring-offset-gray-900 disabled:opacity-50",
          variant === "inline"
            ? "text-xs text-[var(--aviso-fg)] hover:text-[var(--aviso-fg)]"
            : "px-2.5 py-1.5 rounded-lg text-xs bg-[var(--aviso-bg)] text-[var(--aviso-fg)] border border-[var(--neo-line)] hover:bg-[var(--aviso-bg)]"
        )}
        title="Gerar descrição com IA (você revisa antes de usar)"
      >
        <SparkIcon className={loading ? "animate-pulse" : ""} />
        {loading ? "Gerando..." : label}
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-[min(100vw-2rem,22rem)] left-0 sm:left-auto sm:right-0 bg-[var(--neo-bg)] border border-[var(--neo-line)] rounded-xl shadow-xl p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                <SparkIcon />
                Sugestões por IA
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Preview — aceite, edite no campo ou descarte. Não grava sozinho.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDiscard}
              className="text-[var(--text-muted)] hover:text-[var(--text-muted)] p-0.5"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {loading && (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">
              Gerando sugestões...
            </p>
          )}

          {error && !loading && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--erro-solid)] bg-[var(--erro-bg)] rounded-lg px-3 py-2">
                {error}
              </p>
              <button
                type="button"
                onClick={runSuggest}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <>
              {(aviso || source === "fallback") && (
                <p className="text-[11px] text-[var(--aviso-fg)] bg-[var(--aviso-bg)] border border-[var(--neo-line)] rounded-lg px-2 py-1.5">
                  {aviso ||
                    "Modo local (IA sem chave ou indisponível). Conteúdo pode ser genérico."}
                </p>
              )}

              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {items.map((item, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => setSelected(idx)}
                      className={clsx(
                        "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                        selected === idx
                          ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                          : "border-[var(--neo-line)] hover:border-[var(--neo-line)] bg-[var(--neo-bg)]"
                      )}
                    >
                      <p className="text-sm text-[var(--text)]">{item.texto}</p>
                      {item.justificativa && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                          {item.justificativa}
                        </p>
                      )}
                      <span
                        className={clsx(
                          "inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
                          item.confianca === "alta" && "bg-[var(--ok-bg)] text-[var(--ok-fg)]",
                          item.confianca === "media" && "bg-[var(--aviso-bg)] text-[var(--aviso-fg)]",
                          item.confianca === "baixa" && "bg-[var(--neo-flat-alt)] text-[var(--text)]"
                        )}
                      >
                        confiança: {item.confianca}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--neo-line)]">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 min-w-[6rem] px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-[var(--on-accent)] hover:brightness-110"
                >
                  Usar esta
                </button>
                <button
                  type="button"
                  onClick={runSuggest}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--neo-flat-alt)] text-[var(--text)] hover:bg-[var(--neo-flat-alt)]"
                >
                  Regenerar
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Descartar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("w-3.5 h-3.5 text-[var(--aviso-solid)]", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M7.5 5.5L9 2l1.5 3.5L14 7l-3.5 1.5L9 12 7.5 8.5 4 7l3.5-1.5zM16 11l1 2.5L20 14.5 17 15.5 16 18l-1-2.5L12 14.5l3-1L16 11zM5 15l.8 2 2 .8-2 .8L5 21l-.8-2.2-2-.8 2-.8L5 15z" />
    </svg>
  );
}
