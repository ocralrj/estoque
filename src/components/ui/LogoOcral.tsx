import Image from "next/image";

/**
 * Marca da OCRAL.
 *
 * O arquivo é um PNG quadrado com fundo transparente, então assenta nos dois
 * temas sem cartão branco atrás. Vem de `public/`, servido pelo próprio domínio
 * — carregar do CDN de origem deixaria a tela de login dependendo de um
 * terceiro para exibir a marca.
 */
export default function LogoOcral({
  tamanho = 56,
  comNome = true,
  className = "",
}: {
  /** Lado do quadrado, em pixels. */
  tamanho?: number;
  /** Exibe "OCRAL" ao lado — desligue quando o nome já estiver por perto. */
  comNome?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Image
        src="/logo-ocral.png"
        alt="OCRAL"
        width={tamanho}
        height={tamanho}
        priority
        className="shrink-0"
      />
      {comNome && (
        <span className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          OCRAL
        </span>
      )}
    </span>
  );
}
