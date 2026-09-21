"use server";

import { consultarHistorico, type ResultadoDoHistorico } from "@/lib/webarchive";
import { exigirPermissao } from "@/lib/permissoes";

/**
 * Consulta o histórico do site de uma empresa na Wayback Machine.
 *
 * Esta é só a porta de entrada: valida permissão e repassa o trabalho para a
 * lib `@/lib/webarchive`. A tela recebe o `ResultadoDoHistorico` já resolvido
 * e trata cada estado separado — "não tem histórico" nunca se parece com
 * "a consulta falhou".
 */
export async function consultarHistoricoDoSite(site: string): Promise<ResultadoDoHistorico> {
  await exigirPermissao("certificados", "certificates", "read");
  return consultarHistorico(site);
}
