"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import IconeMenu from "./IconesMenu";
import { funcoesPermitidas, usePermissoesDaNavegacao, type Funcao } from "./navegacao";

/** "Movimentações" e "movimentacoes" são a mesma busca: ninguém digita acento com pressa. */
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Quanto a função combina com a busca; zero é fora.
 *
 * Toda palavra digitada precisa aparecer em algum lugar — "nova mov" não pode
 * trazer "Novo protocolo". O nome pesa mais que os sinônimos, que pesam mais
 * que a descrição: quem digita "usu" quer Usuários, e não toda tela cuja dica
 * fala de usuários.
 */
function pontuar(funcao: Funcao, palavras: string[]): number {
  const nome = normalizar(funcao.label);
  const inicios = nome.split(/\s+/);
  const termos = funcao.termos.map(normalizar);
  const grupo = normalizar(funcao.grupo ?? "");
  const dica = normalizar(funcao.dica ?? "");

  let total = 0;
  for (const p of palavras) {
    if (nome.startsWith(p)) total += 100;
    else if (inicios.some((w) => w.startsWith(p))) total += 70;
    else if (nome.includes(p)) total += 40;
    else if (termos.some((t) => t.includes(p))) total += 30;
    else if (grupo.includes(p)) total += 20;
    else if (dica.includes(p)) total += 10;
    else return 0;
  }
  return total;
}

function Lupa({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/**
 * Pesquisa de funções do sistema, no cabeçalho.
 *
 * Só lista o que a sessão pode abrir — a mesma regra do menu. Não mostrar a
 * tela negada é deliberado: um resultado que leva a "acesso negado" é pior do
 * que nenhum, e a lista de telas restritas já diz mais do que devia. A barreira
 * real continua na página, que confere a permissão no servidor.
 *
 * Abre com Ctrl+K (⌘K no Mac) ou "/", como nos sistemas em que as pessoas já
 * aprenderam o atalho.
 */
export default function PesquisaDeFuncoes({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const permissoes = usePermissoesDaNavegacao();
  const funcoes = useMemo(() => funcoesPermitidas(role, permissoes), [role, permissoes]);

  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [atalho, setAtalho] = useState("Ctrl K");
  const focoAnterior = useRef<HTMLElement | null>(null);
  const listaId = useId();

  const resultados = useMemo(() => {
    const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return funcoes;
    return funcoes
      .map((funcao, ordem) => ({ funcao, ordem, pontos: pontuar(funcao, palavras) }))
      .filter((r) => r.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
      .map((r) => r.funcao);
  }, [busca, funcoes]);

  const abrir = useCallback(() => {
    focoAnterior.current = document.activeElement as HTMLElement | null;
    setBusca("");
    setAtivo(0);
    setAberta(true);
  }, []);

  const fechar = useCallback(() => {
    setAberta(false);
    focoAnterior.current?.focus();
  }, []);

  // O rótulo do atalho depende do sistema, que só se conhece no navegador.
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setAtalho("⌘ K");
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (aberta) fechar();
        else abrir();
        return;
      }
      // "/" só vale fora de campos: dentro de um, é o caractere que a pessoa quer.
      const alvo = e.target as HTMLElement;
      const digitando =
        alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName);
      if (e.key === "/" && !aberta && !digitando) {
        e.preventDefault();
        abrir();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta, abrir, fechar]);

  // Trava a rolagem do fundo enquanto a pesquisa está aberta.
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberta]);

  // Navegando pelas setas, o item destacado não pode sair da área visível.
  useEffect(() => {
    if (!aberta) return;
    document.getElementById(`${listaId}-${ativo}`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberta, listaId]);

  function ir(funcao: Funcao) {
    setAberta(false);
    if (funcao.href !== pathname) router.push(funcao.href);
  }

  function aoTeclarNoCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => (resultados.length ? (i + 1) % resultados.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => (resultados.length ? (i - 1 + resultados.length) % resultados.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const escolhida = resultados[ativo];
      if (escolhida) ir(escolhida);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Pesquisar funções"
        aria-keyshortcuts="Control+K Meta+K"
        title={`Pesquisar funções (${atalho})`}
        className="neo-button inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full text-[var(--muted)] transition-all hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 sm:w-full sm:max-w-sm sm:justify-start sm:px-4"
      >
        <Lupa className="h-5 w-5 shrink-0" />
        <span className="hidden flex-1 truncate text-left text-sm sm:inline">
          Pesquisar funções…
        </span>
        <kbd className="hidden rounded-md border border-[var(--stroke)] px-1.5 py-0.5 font-sans text-[11px] font-semibold md:inline">
          {atalho}
        </kbd>
      </button>

      {aberta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fechar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pesquisar funções"
            className="neo-raised w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-[var(--stroke)] px-4">
              <Lupa className="h-5 w-5 shrink-0 text-[var(--muted)]" />
              <input
                autoFocus
                type="text"
                role="combobox"
                aria-expanded={resultados.length > 0}
                aria-controls={listaId}
                aria-autocomplete="list"
                aria-activedescendant={resultados.length ? `${listaId}-${ativo}` : undefined}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setAtivo(0);
                }}
                onKeyDown={aoTeclarNoCampo}
                placeholder="Ex.: nova movimentação, usuários, certificados"
                // O globals.css dá fundo, borda e sombra a todo input, com
                // especificidade maior que a de uma classe. Aqui o campo é a
                // própria janela: sem o "!", ele virava uma caixa dentro dela.
                className="h-14 min-w-0 flex-1 !rounded-none !border-0 !bg-transparent px-0 text-[15px] text-[var(--text)] !shadow-none outline-none placeholder:text-[var(--muted)] focus:!shadow-none"
              />
              <button
                type="button"
                onClick={fechar}
                className="rounded-md border border-[var(--stroke)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                Esc
              </button>
            </div>

            {resultados.length > 0 ? (
              <ul
                id={listaId}
                role="listbox"
                aria-label="Funções encontradas"
                className="max-h-[60vh] space-y-1 overflow-y-auto bg-[var(--surface-soft)] p-2"
              >
                {resultados.map((funcao, i) => (
                  <li
                    key={funcao.href}
                    id={`${listaId}-${i}`}
                    role="option"
                    aria-selected={i === ativo}
                    onMouseMove={() => setAtivo(i)}
                    onClick={() => ir(funcao)}
                    className={clsx(
                      "flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors",
                      i === ativo
                        ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                        : "text-[var(--text)]"
                    )}
                  >
                    <IconeMenu nome={funcao.icone} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {funcao.grupo && (
                          <span className="font-semibold text-[var(--muted)]">
                            {funcao.grupo} ›{" "}
                          </span>
                        )}
                        {funcao.label}
                      </span>
                      {funcao.dica && (
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {funcao.dica}
                        </span>
                      )}
                    </span>
                    {funcao.href === pathname && (
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                        Você está aqui
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="bg-[var(--surface-soft)] px-6 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--text)]">
                  Nenhuma função encontrada para “{busca.trim()}”.
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  A pesquisa mostra só as telas que o seu acesso permite abrir. Se
                  precisar de outra, fale com a gestão do seu departamento.
                </p>
              </div>
            )}

            <div className="hidden items-center gap-4 border-t border-[var(--stroke)] px-4 py-2 text-[11px] text-[var(--muted)] sm:flex">
              <span>↑ ↓ navegar</span>
              <span>Enter abrir</span>
              <span>Esc fechar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
