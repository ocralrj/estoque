"use server";

import * as cadastro from "@/lib/estoque/cadastros-servidor";
import type { DadosDoCadastro } from "@/lib/estoque/cadastros";

/**
 * Localizações de produto (Estoque → Localizações).
 *
 * As regras — nome único, inativa fora das escolhas, em uso não se exclui —
 * são as mesmas das categorias e vivem em `cadastros-servidor.ts`.
 */

export async function listarLocalizacoes(somenteAtivas = false) {
  return cadastro.listar("localizacao", somenteAtivas);
}

export async function listarLocalizacoesComUso() {
  return cadastro.listarComUso("localizacao");
}

export async function criarLocalizacao(dados: DadosDoCadastro) {
  return cadastro.criar("localizacao", dados);
}

export async function atualizarLocalizacao(id: string, dados: DadosDoCadastro) {
  return cadastro.atualizar("localizacao", id, dados);
}

export async function definirStatusDaLocalizacao(id: string, ativa: boolean) {
  return cadastro.definirStatus("localizacao", id, ativa);
}

export async function excluirLocalizacao(id: string) {
  return cadastro.excluir("localizacao", id);
}
