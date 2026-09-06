"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirDocumento, urlDeDownload } from "@/app/actions/ged";
import { restaurarArquivo } from "@/lib/ged/arquivos";
import type { Compressao } from "@/lib/ged/arquivos";

/**
 * Baixar e excluir um documento.
 *
 * O download não é um link direto: o bucket é privado, então o servidor assina
 * uma URL temporária. Arquivo guardado com gzip é descompactado no navegador
 * antes de chegar ao usuário — ele recebe o documento original, não um .gz.
 */
export default function AcoesDocumento({
  id,
  nome,
  storagePath,
  compressao,
  mimeType,
  podeExcluir,
}: {
  id: string;
  nome: string;
  storagePath: string | null;
  compressao?: Compressao | null;
  mimeType?: string | null;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    if (!storagePath) return;
    setErro(null);
    setBaixando(true);
    try {
      const res = await urlDeDownload(storagePath);
      if (!res.ok) {
        setErro(res.message);
        return;
      }

      const resposta = await fetch(res.data.url);
      if (!resposta.ok) throw new Error("falha ao buscar o arquivo");

      const original = await restaurarArquivo(
        await resposta.blob(),
        (compressao as Compressao) ?? "nenhuma"
      );

      const url = URL.createObjectURL(
        mimeType ? new Blob([original], { type: mimeType }) : original
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível baixar o arquivo.");
    } finally {
      setBaixando(false);
    }
  }

  function excluir() {
    if (!window.confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
    setErro(null);
    iniciar(async () => {
      const res = await excluirDocumento(id);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      router.push("/dashboard/ged/documentos");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {storagePath && (
        <button
          type="button"
          onClick={baixar}
          disabled={baixando}
          className="neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)] disabled:opacity-60"
        >
          {baixando ? "Preparando…" : "Baixar"}
        </button>
      )}

      {podeExcluir && (
        <button
          type="button"
          onClick={excluir}
          disabled={pendente}
          className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-bold text-[var(--text)] disabled:opacity-60"
        >
          {pendente ? "Excluindo…" : "Excluir"}
        </button>
      )}

      {erro && (
        <p className="w-full text-xs font-semibold text-[var(--danger)]">{erro}</p>
      )}
    </div>
  );
}
