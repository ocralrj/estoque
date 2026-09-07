"use client";

import { useRef, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import {
  formatarTamanho,
  prepararAvatar,
  type AvatarPreparado,
} from "@/lib/imagens/avatar";

/**
 * Escolha da foto de perfil, com o tratamento acontecendo na hora.
 *
 * A imagem é reduzida antes de sair do navegador, e o resultado aparece na
 * tela: a pessoa vê o recorte que será gravado e o quanto o arquivo encolheu.
 * Mostrar isso não é enfeite — é o que explica por que a foto de 4 MB que ela
 * escolheu virou 30 kB, em vez de parecer que o sistema perdeu qualidade sem
 * avisar.
 *
 * A foto é sempre opcional: sem ela, o Avatar mostra as iniciais.
 */
export default function SeletorDeFoto({
  nome,
  email,
  urlAtual,
  aoEscolher,
  rotulo = "Foto",
}: {
  nome?: string | null;
  email?: string | null;
  /** Foto já gravada, exibida enquanto nenhuma nova for escolhida. */
  urlAtual?: string | null;
  aoEscolher: (foto: AvatarPreparado | null) => void;
  rotulo?: string;
}) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [info, setInfo] = useState<AvatarPreparado | null>(null);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErro("");
    setProcessando(true);
    try {
      const preparada = await prepararAvatar(file);
      // A prévia anterior deixa de ser referenciada: sem revogar, o blob fica
      // preso na memória da aba até a navegação.
      if (previa) URL.revokeObjectURL(previa);
      setPrevia(URL.createObjectURL(preparada.blob));
      setInfo(preparada);
      aoEscolher(preparada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível ler a imagem.");
      limpar();
    } finally {
      setProcessando(false);
    }
  }

  function limpar() {
    if (previa) URL.revokeObjectURL(previa);
    setPrevia(null);
    setInfo(null);
    setErro("");
    aoEscolher(null);
    if (entradaRef.current) entradaRef.current.value = "";
  }

  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {rotulo} <span className="normal-case tracking-normal">(opcional)</span>
      </span>

      <div className="mt-2 flex items-center gap-4">
        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previa}
            alt="Prévia da foto escolhida"
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar nome={nome} email={email} url={urlAtual} tamanho={64} />
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => entradaRef.current?.click()}
              disabled={processando}
              className="neo-button rounded-full px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-60"
            >
              {processando
                ? "Tratando…"
                : previa || urlAtual
                  ? "Trocar imagem"
                  : "Escolher imagem"}
            </button>

            {previa && (
              <button
                type="button"
                onClick={limpar}
                className="rounded-full px-3 py-2 text-xs font-semibold text-[var(--text-muted)] hover:underline"
              >
                Remover
              </button>
            )}
          </div>

          {info ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {formatarTamanho(info.tamanhoOriginal)} →{" "}
              <strong className="font-semibold text-[var(--text)]">
                {formatarTamanho(info.tamanhoFinal)}
              </strong>{" "}
              · recortada em quadrado
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              JPG, PNG ou WebP. É reduzida automaticamente antes de subir.
            </p>
          )}

          {erro && <p className="mt-1 text-xs text-[var(--erro-fg)]">{erro}</p>}
        </div>
      </div>

      <input
        ref={entradaRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={escolher}
        className="sr-only"
      />
    </div>
  );
}
