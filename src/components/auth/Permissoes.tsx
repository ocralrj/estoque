"use client";

import { createContext, useContext, useMemo } from "react";
import type { Chave } from "@/lib/permissoes";

/**
 * As permissões da sessão, disponíveis para os componentes de cliente.
 *
 * Elas são calculadas no servidor e descem prontas: o navegador nunca decide
 * quem pode o quê, apenas desenha o que já foi decidido. Esconder um botão aqui
 * é conveniência — a barreira de verdade está na Server Action e na rota, que
 * repetem a mesma checagem contra o banco.
 */
const ContextoPermissoes = createContext<Set<string>>(new Set());

export function ProvedorDePermissoes({
  permissoes,
  children,
}: {
  permissoes: Chave[];
  children: React.ReactNode;
}) {
  const conjunto = useMemo(() => new Set<string>(permissoes), [permissoes]);
  return (
    <ContextoPermissoes.Provider value={conjunto}>
      {children}
    </ContextoPermissoes.Provider>
  );
}

/**
 * `pode("ged", "documents", "delete")` dentro de um componente de cliente.
 *
 * Devolve uma função, e não um booleano, para que um mesmo componente possa
 * perguntar por vários recursos sem uma chamada de hook para cada.
 */
export function usePode() {
  const permissoes = useContext(ContextoPermissoes);
  return useMemo(
    () =>
      (modulo: string, recurso: string, acao: string) =>
        permissoes.has(`${modulo}:${recurso}:${acao}`),
    [permissoes]
  );
}

/** Mostra os filhos apenas com a permissão exigida. */
export function Se({
  modulo,
  recurso,
  acao,
  children,
}: {
  modulo: string;
  recurso: string;
  acao: string;
  children: React.ReactNode;
}) {
  const pode = usePode();
  if (!pode(modulo, recurso, acao)) return null;
  return <>{children}</>;
}
