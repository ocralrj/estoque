import Image from "next/image";

/**
 * Fundo das telas de acesso: a parede clara com a luz entrando de lado.
 *
 * A foto não é ornamento solto — as sombras diagonais dela são a mesma luz que
 * o sistema de design usa para esculpir os relevos, então o cartão do
 * formulário parece apoiado na parede em vez de colado sobre uma imagem.
 *
 * O véu por cima existe para o contraste: sem ele, a foto no claro competiria
 * com o cartão, e no escuro uma parede cinza-clara ocupando a tela inteira
 * anularia o tema. Ele escurece no dark mode até a foto virar textura.
 *
 * Decorativa de propósito (`alt=""`): não há informação aqui que um leitor de
 * tela precise anunciar.
 */
export default function FundoAutenticacao() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <Image
        src="/fundo-login.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-[var(--neo-flat)]/55 dark:bg-[#0a0c0f]/85" />
    </div>
  );
}
