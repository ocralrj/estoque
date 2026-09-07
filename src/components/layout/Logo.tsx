import Image from "next/image";

/**
 * A marca da OCRAL.
 *
 * O arquivo é azul-escuro sobre fundo transparente, o que funciona no tema
 * claro e desaparece no escuro. Em vez de inverter as cores — o que mudaria a
 * marca — ela é apoiada numa placa clara arredondada quando o tema é escuro:
 * a marca continua sendo ela mesma, e ganha o fundo de que precisa.
 *
 * `priority` no login porque a marca é a primeira coisa que a tela mostra;
 * carregada por último, ela apareceria com um salto.
 */
export default function Logo({
  largura = 120,
  prioridade = false,
  className = "",
}: {
  largura?: number;
  prioridade?: boolean;
  className?: string;
}) {
  const altura = Math.round((largura * 110) / 139);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl p-2 dark:bg-white/90 ${className}`}
    >
      <Image
        src="/logo_ocral.png"
        alt="OCRAL"
        width={largura}
        height={altura}
        priority={prioridade}
        className="h-auto"
      />
    </span>
  );
}
