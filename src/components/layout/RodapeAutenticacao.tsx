// Crédito de quem desenvolveu, comum às telas de autenticação. Telefone como
// link tel: — no celular, que é onde a maioria vê estas telas, tocar no número
// disca.
// Preto, e não a cor de destaque: o rodapé fica sobre a foto da parede, onde o
// roxo do sistema quase desaparecia. No tema escuro o fundo é escuro, então a
// mesma lógica inverte para branco.
// Os links ficam sublinhados apenas ao passar o ponteiro: em um rodapé de três
// elementos, o sublinhado permanente pesa mais do que ajuda.
export default function RodapeAutenticacao() {
  return (
    <footer className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs font-semibold text-black dark:text-white">
      <span>
        Desenvolvido por{" "}
        <a
          href="https://www.icardcase.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          www.icardcase.com.br
        </a>
      </span>
      <span aria-hidden>|</span>
      <a href="tel:+5521988785170" className="hover:underline">
        (21) 98878-5170
      </a>
    </footer>
  );
}
