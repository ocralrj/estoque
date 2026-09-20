"use client";

import { useEffect, useRef, useState } from "react";
import { buscarProdutos, type ProdutoResumo } from "@/app/actions/produtos";

/**
 * Busca de produto por nome, com resultado enquanto digita.
 *
 * Cada tecla (com debounce de 250 ms) consulta o banco por correspondência
 * parcial, sem diferenciar maiúsculas, limitada a 10 linhas — a lista completa
 * não viaja para o navegador. Escolher preenche o id da linha do pedido pelo
 * fluxo que já existia; se o texto mudar depois da escolha, a seleção é
 * desfeita para o pedido nunca levar um produto diferente do exibido.
 */
export default function BuscaProduto({
  productId,
  onSelect,
  inputId,
}: {
  /** Id já escolhido nesta linha ("" = nenhum). */
  productId: string;
  onSelect: (id: string) => void;
  inputId: string;
}) {
  const [texto, setTexto] = useState("");
  const [aberta, setAberta] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<ProdutoResumo[]>([]);
  const [destaque, setDestaque] = useState(-1);
  const [escolhido, setEscolhido] = useState<ProdutoResumo | null>(null);
  const vez = useRef(0);

  // O pai limpa a linha (pedido enviado): volta ao vazio.
  useEffect(() => {
    if (!productId) {
      vez.current++;
      setTexto("");
      setResultados([]);
      setEscolhido(null);
      setAberta(false);
      setDestaque(-1);
    }
  }, [productId]);

  useEffect(() => {
    if (!texto.trim()) {
      setResultados([]);
      setCarregando(false);
      setDestaque(-1);
      return;
    }
    setCarregando(true);
    const timer = setTimeout(async () => {
      const minha = ++vez.current;
      const res = await buscarProdutos(texto);
      // Resposta velha (o usuário já digitou mais): descarta.
      if (vez.current !== minha) return;
      setCarregando(false);
      setResultados(res.ok ? res.data : []);
      setDestaque(-1);
      setAberta(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [texto]);

  function escolher(p: ProdutoResumo) {
    vez.current++;
    setEscolhido(p);
    setTexto(p.name);
    setResultados([]);
    setAberta(false);
    setDestaque(-1);
    onSelect(p.id);
  }

  function limpar() {
    vez.current++;
    setTexto("");
    setEscolhido(null);
    setResultados([]);
    setAberta(false);
    setDestaque(-1);
    onSelect("");
  }

  function aoDigitar(valor: string) {
    setTexto(valor);
    setAberta(true);
    if (escolhido && valor !== escolhido.name) {
      setEscolhido(null);
      onSelect("");
    }
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberta(true);
      setDestaque((d) => (resultados.length === 0 ? -1 : (d + 1) % resultados.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) =>
        resultados.length === 0 ? -1 : (d - 1 + resultados.length) % resultados.length
      );
    } else if (e.key === "Enter") {
      if (aberta && resultados.length > 0) {
        e.preventDefault();
        escolher(resultados[destaque >= 0 ? destaque : 0]);
      }
    } else if (e.key === "Escape") {
      setAberta(false);
    }
  }

  const listaId = `${inputId}-lista`;

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={aberta}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        value={texto}
        placeholder="Digite o nome do produto…"
        onChange={(e) => aoDigitar(e.target.value)}
        onFocus={() => {
          if (texto.trim() && resultados.length > 0) setAberta(true);
        }}
        onBlur={() => setTimeout(() => setAberta(false), 120)}
        onKeyDown={aoTeclar}
        className="mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 pr-8 text-sm text-[var(--text)]"
      />
      {texto && (
        <button
          type="button"
          onClick={limpar}
          aria-label="Limpar produto"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
        >
          ×
        </button>
      )}
      {aberta && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--stroke)] bg-[var(--neo-bg)] py-1 shadow-lg"
        >
          {carregando ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">Buscando…</li>
          ) : resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">
              Nenhum produto encontrado.
            </li>
          ) : (
            resultados.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === destaque}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(p);
                }}
                onMouseEnter={() => setDestaque(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === destaque
                    ? "bg-[var(--primary-soft)] text-[var(--text)]"
                    : "text-[var(--text)]"
                }`}
              >
                <span className="font-mono text-xs text-[var(--muted)]">{p.code}</span>{" "}
                — {p.name}{" "}
                <span className="text-xs text-[var(--muted)]">
                  ({p.quantity_current} {p.unit})
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
