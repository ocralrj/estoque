"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BuscaProduto from "@/components/estoque/BuscaProduto";

/**
 * Pesquisa por nome na lista de produtos.
 *
 * Reutiliza o autocomplete dos pedidos: sugere enquanto digita e, ao confirmar
 * (seleção, Enter ou limpeza), navega para a lista filtrada — a tabela em si
 * continua renderizada no servidor, sem mudar nada nela.
 */
export default function PesquisaProduto({
  busca,
  ordem,
  direcao,
  hrefLimpar,
}: {
  busca: string;
  ordem: string;
  direcao: string;
  hrefLimpar: string;
}) {
  const router = useRouter();

  function confirmar(texto: string) {
    const params = new URLSearchParams();
    params.set("ordem", ordem);
    params.set("direcao", direcao);
    if (texto) params.set("busca", texto);
    router.push(`/dashboard/estoque/produtos?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="busca-produto" className="sr-only">
        Pesquisar por nome do produto
      </label>
      <div className="w-56">
        <BuscaProduto
          inputId="busca-produto"
          textoInicial={busca}
          placeholder="Pesquisar por nome…"
          aoConfirmar={confirmar}
        />
      </div>
      {busca && (
        <Link
          href={hrefLimpar}
          className="text-sm font-semibold text-[var(--text-muted)] hover:underline"
        >
          Limpar
        </Link>
      )}
    </div>
  );
}
