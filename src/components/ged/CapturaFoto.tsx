"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepararFoto, RESTRICOES_CAMERA, formatarBytes } from "@/lib/ged/arquivos";
import type { ArquivoPreparado } from "@/lib/ged/arquivos";

/**
 * Captura pela câmera do aparelho.
 *
 * A câmera é aberta pedindo a maior resolução que o periférico oferecer: mais
 * pixels na origem significam texto mais legível depois da redução. O quadro
 * capturado, porém, passa pelo mesmo reamostramento das demais imagens antes de
 * virar arquivo — o que vai para o banco é sempre a versão reduzida.
 */
export default function CapturaFoto({
  onCapturar,
  onFechar,
}: {
  onCapturar: (arquivo: ArquivoPreparado) => void;
  onFechar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resolucao, setResolucao] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const encerrar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function abrir() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este navegador não dá acesso à câmera. Use o envio de arquivo.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia(RESTRICOES_CAMERA);
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const t = stream.getVideoTracks()[0]?.getSettings();
        if (t?.width && t?.height) setResolucao(`${t.width} × ${t.height}`);
      } catch (e) {
        const nome = e instanceof DOMException ? e.name : "";
        setErro(
          nome === "NotAllowedError"
            ? "Permissão de câmera negada. Autorize no navegador e tente de novo."
            : nome === "NotFoundError"
              ? "Nenhuma câmera encontrada neste aparelho."
              : "Não foi possível abrir a câmera."
        );
      }
    }

    abrir();
    return () => {
      cancelado = true;
      encerrar();
    };
  }, [encerrar]);

  async function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setProcessando(true);
    try {
      // Quadro no tamanho nativo do sensor; a redução vem depois.
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);

      const bruto = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95)
      );
      if (!bruto) throw new Error("falha ao capturar");

      const arquivo = await prepararFoto(bruto);
      encerrar();
      onCapturar(arquivo);
    } catch {
      setErro("Não foi possível capturar a foto. Tente novamente.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="neo-card w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-3">
          <div>
            <p className="font-bold text-[var(--text)]">Tirar foto do documento</p>
            <p className="text-xs text-[var(--muted)]">
              {resolucao
                ? `Câmera em ${resolucao} — a imagem é reduzida antes de ser guardada`
                : "Abrindo a câmera…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              encerrar();
              onFechar();
            }}
            className="neo-button h-9 w-9 rounded-full text-[var(--muted)]"
            aria-label="Fechar câmera"
          >
            ×
          </button>
        </div>

        {erro ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--danger)]">{erro}</p>
            <button
              type="button"
              onClick={() => {
                encerrar();
                onFechar();
              }}
              className="neo-button mt-4 rounded-full px-4 py-2 text-sm font-bold"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-h-[60vh] w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-center gap-3 px-5 py-4">
              <button
                type="button"
                onClick={capturar}
                disabled={processando}
                className="rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white shadow-[10px_10px_18px_rgba(122,109,216,0.28)] disabled:opacity-60"
              >
                {processando ? "Processando…" : "Capturar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  encerrar();
                  onFechar();
                }}
                className="rounded-full border border-[var(--stroke)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Resumo do que a compactação economizou, para exibir ao usuário. */
export function ResumoCompressao({ arquivo }: { arquivo: ArquivoPreparado }) {
  const ganho =
    arquivo.tamanhoOriginal > 0
      ? Math.round((1 - arquivo.tamanhoFinal / arquivo.tamanhoOriginal) * 100)
      : 0;

  return (
    <p className="text-xs text-[var(--muted)]">
      {formatarBytes(arquivo.tamanhoFinal)}
      {arquivo.compressao !== "nenhuma" && ganho > 0 && (
        <>
          {" "}
          — {ganho}% menor que o original ({formatarBytes(arquivo.tamanhoOriginal)}),{" "}
          {arquivo.compressao === "imagem" ? "imagem reamostrada" : "compactado com gzip"}
        </>
      )}
      {arquivo.compressao === "nenhuma" && " — guardado sem alteração"}
    </p>
  );
}
