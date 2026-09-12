"use client";

import { useState } from "react";
import { normalizarCor, textoSobre } from "@/lib/empresas";

// Sem a flag "u" (\p{L}): o tsconfig não define target e ela não compila.
const ALFANUMERICO = /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/;

/**
 * Logo da empresa, com as iniciais na cor da marca como reserva.
 *
 * O quadro da logo é sempre claro, nos dois temas: quase toda logo é desenhada
 * para fundo branco, e no tema escuro ele funciona como um selo. A imagem fica
 * no site da empresa; se ela sair do ar, as iniciais assumem sem quebrar o
 * cartão.
 */
export default function LogoDaEmpresa({
  nome,
  logoUrl,
  cor,
  tamanho = 56,
}: {
  nome: string;
  logoUrl?: string | null;
  cor?: string | null;
  tamanho?: number;
}) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const corDaMarca = normalizarCor(cor);

  if (logoUrl && falhou !== logoUrl) {
    return (
      <span
        style={{ width: tamanho, height: tamanho, borderColor: corDaMarca || undefined }}
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white p-1.5"
      >
        {/* next/image exigiria liberar em next.config o domínio de cada empresa. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={`Logo de ${nome}`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFalhou(logoUrl)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  const iniciais = nome
    .split(/\s+/)
    .filter((p) => ALFANUMERICO.test(p))
    .slice(0, 2)
    .map((p) => p.match(ALFANUMERICO)?.[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.max(12, tamanho * 0.36),
        ...(corDaMarca ? { background: corDaMarca, color: textoSobre(corDaMarca) } : {}),
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl font-bold ${
        corDaMarca ? "" : "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
      }`}
    >
      {iniciais || "?"}
    </span>
  );
}
