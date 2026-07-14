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
          "inline-flex items-center gap-1.5 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50",
          variant === "inline"
            ? "text-xs text-amber-700 hover:text-amber-900"
            : "px-2.5 py-1.5 rounded-lg text-xs bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
        )}
        title="Gerar sugestão com IA (você revisa antes de usar)"
      >
        <SparkIcon className={loading ? "animate-pulse" : ""} />
        {loading ? "Gerando..." : label}
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-[min(100vw-2rem,22rem)] left-0 sm:left-auto sm:right-0 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <SparkIcon />
                Sugestões por IA
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Preview — aceite, edite no campo ou descarte. Não grava sozinho.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDiscard}
              className="text-gray-400 hover:text-gray-600 p-0.5"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {loading && (
            <p className="text-sm text-gray-500 py-4 text-center">
              Gerando sugestões...
            </p>
          )}

          {error && !loading && (
            <div className="space-y-2">
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
              <button
                type="button"
                onClick={runSuggest}
                className="text-xs text-primary-600 hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <>
              {(aviso || source === "fallback") && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
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
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      <p className="text-sm text-gray-900">{item.texto}</p>
                      {item.justificativa && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          {item.justificativa}
                        </p>
                      )}
                      <span
                        className={clsx(
                          "inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
                          item.confianca === "alta" && "bg-green-100 text-green-800",
                          item.confianca === "media" && "bg-yellow-100 text-yellow-800",
                          item.confianca === "baixa" && "bg-gray-100 text-gray-700"
                        )}
                      >
                        confiança: {item.confianca}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 min-w-[6rem] px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700"
                >
                  Usar esta
                </button>
                <button
                  type="button"
                  onClick={runSuggest}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Regenerar
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700"
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
      className={clsx("w-3.5 h-3.5 text-amber-600", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M7.5 5.5L9 2l1.5 3.5L14 7l-3.5 1.5L9 12 7.5 8.5 4 7l3.5-1.5zM16 11l1 2.5L20 14.5 17 15.5 16 18l-1-2.5L12 14.5l3-1L16 11zM5 15l.8 2 2 .8-2 .8L5 21l-.8-2.2-2-.8 2-.8L5 15z" />
    </svg>
  );
}
