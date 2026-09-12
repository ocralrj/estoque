"use server";

import * as cadastro from "@/lib/estoque/cadastros-servidor";
import type { DadosDoCadastro } from "@/lib/estoque/cadastros";

/**
 * Categorias de produto (Estoque → Categorias).
 *
 * As regras — nome único, inativa fora das escolhas, em uso não se exclui —
 * são as mesmas das localizações e vivem em `cadastros-servidor.ts`.
 */

export async function listarCategorias(somenteAtivas = false) {
  return cadastro.listar("categoria", somenteAtivas);
}

export async function listarCategoriasComUso() {
  return cadastro.listarComUso("categoria");
}

export async function criarCategoria(dados: DadosDoCadastro) {
  return cadastro.criar("categoria", dados);
}

export async function atualizarCategoria(id: string, dados: DadosDoCadastro) {
  return cadastro.atualizar("categoria", id, dados);
}

export async function definirStatusDaCategoria(id: string, ativa: boolean) {
  return cadastro.definirStatus("categoria", id, ativa);
}

export async function excluirCategoria(id: string) {
  return cadastro.excluir("categoria", id);
}
