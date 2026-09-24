/**
 * Rodapé padrão de todos os relatórios impressos do sistema.
 *
 * Regra: todo relatório impresso (papel/PDF) termina com a assinatura
 * "Desenvolvido por www.icardcase.com.br | (21) 98878-5170" e o contador de
 * páginas. Na impressão, o rodapé é fixo no fim de cada página e o contador
 * é preenchido pelo navegador; em tela, aparece só a assinatura.
 */
export default function RodapeRelatorio() {
  return (
    <footer className="rodape-impressao mt-6 border-t border-[var(--stroke)] pt-2 text-center text-xs text-[var(--muted)]">
      <span className="pagina" aria-hidden />
      <span>
        {" "}
        · Desenvolvido por www.icardcase.com.br | (21) 98878-5170
      </span>
    </footer>
  );
}
