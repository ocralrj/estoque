"use client";

import { useState, useTransition } from "react";
import { consultarHistoricoDoSite } from "@/app/actions/webarchive";
import type { ResultadoDoHistorico } from "@/lib/webarchive";

/**
 * Consulta e mostra o histórico do site desta empresa na Wayback Machine.
 *
 * A consulta só acontece quando o usuário pede — nunca ao abrir a tela (seriam
 * N chamadas à Wayback por visita, e cada empresa com site teria uma). O botão
 * "Ver histórico" dispara a Server Action e a resposta tem três estados que
 * esta tela trata separado:
 *
 * - encontrado     → mostra "existe desde", a última captura e o total.
 * - nao_encontrado → "sem histórico arquivado" — resultado legítimo.
 * - erro           → "a consulta falhou" + motivo, com botão de nova tentativa.
 *
 * "Não tem histórico" nunca se parece com "a consulta falhou".
 */
export default function HistoricoWebDaEmpresa({ site }: { site: string }) {
  const [pedindo, comecar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoDoHistorico | null>(null);
  const [jaPediu, setJaPediu] = useState(false);

  function consultar() {
    comecar(async () => {
      setJaPediu(true);
      setResultado(await consultarHistoricoDoSite(site));
    });
  }

  return (
    <div className="neo-card mt-3 border-t border-[var(--stroke)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Histórico web
          </p>
          <p className="text-xs text-[var(--muted)]">
            Capturas arquivadas do site na Wayback Machine (web.archive.org).
          </p>
        </div>
        {!jaPediu && (
          <button
            type="button"
            onClick={consultar}
            disabled={pedindo}
            className="neo-button shrink-0 rounded-full px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-60"
          >
            {pedindo ? "Consultando…" : "Ver histórico"}
          </button>
        )}
      </div>

      {jaPediu && !resultado && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {pedindo ? "Consultando o arquivo…" : "Consulta concluída."}
        </p>
      )}

      {resultado?.estado === "encontrado" && (
        <dl className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-semibold text-[var(--muted)]">Existe desde</dt>
            <dd className="text-sm text-[var(--text)]">{dataDoTimestamp(resultado.primeira.timestamp)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-semibold text-[var(--muted)]">Última captura</dt>
            <dd className="text-sm text-[var(--text)]">{dataDoTimestamp(resultado.ultima.timestamp)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-semibold text-[var(--muted)]">Capturas</dt>
            <dd className="text-sm text-[var(--text)]">{resultado.total}</dd>
          </div>
        </dl>
      )}

      {resultado?.estado === "nao_encontrado" && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sem histórico arquivado para este site.
        </p>
      )}

      {resultado?.estado === "erro" && (
        <div className="mt-2">
          <p className="text-sm font-semibold text-[var(--erro-fg)]">
            Não foi possível consultar o histórico.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{resultado.motivo}</p>
          <button
            type="button"
            onClick={consultar}
            disabled={pedindo}
            className="neo-button mt-3 rounded-full px-4 py-1.5 text-xs font-bold text-[var(--text)] disabled:opacity-60"
          >
            {pedindo ? "Consultando…" : "Tentar de novo"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Converte o timestamp do CDX (YYYYMMDDHHMMSS) numa data legível. */
function dataDoTimestamp(timestamp: string): string {
  const ano = Number(timestamp.slice(0, 4));
  const mes = Number(timestamp.slice(4, 6)) - 1;
  const dia = Number(timestamp.slice(6, 8));
  const hora = Number(timestamp.slice(8, 10));
  const minuto = Number(timestamp.slice(10, 12));
  const quando = new Date(ano, mes, dia, hora, minuto);
  if (Number.isNaN(quando.getTime())) return timestamp;
  return quando.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
