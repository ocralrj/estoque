import Image from "next/image";

/**
 * Fundo das telas de acesso: a parede clara com a luz entrando de lado.
 *
 * A foto não é ornamento solto — as sombras diagonais dela são a mesma luz que
 * o sistema de design usa para esculpir os relevos, então o cartão do
 * formulário parece apoiado na parede em vez de colado sobre uma imagem.
 *
 * `fixed` e não `absolute`: assim a parede ocupa a viewport inteira, sem
 * depender da altura do container que envolve o formulário.
 *
 * No tema claro não há véu. A primeira versão tinha um, e ele apagava a foto:
 * a parede é cinza-clara e o véu era da mesma cor, então cobri-la com ela
 * mesma não deixava nada para ver. O contraste do formulário já vem do cartão,
 * que é opaco. No escuro o véu volta, e forte — uma parede clara ocupando a
 * tela inteira anularia o tema.
 *
 * Decorativa de propósito (`alt=""`): não há informação aqui que um leitor de
 * tela precise anunciar.
 */
export default function FundoAutenticacao() {
  return (
    <div aria-hidden className="fixed inset-0 z-0 overflow-hidden">
      <Image
        src="/fundo-login.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-transparent dark:bg-[#0a0c0f]/85" />
    </div>
  );
}
