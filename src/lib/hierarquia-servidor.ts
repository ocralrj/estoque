import type { SupabaseClient } from "@supabase/supabase-js";
import { motivoDoBloqueio, type LadoDaComparacao } from "@/lib/hierarquia";

/**
 * A regra de "quem edita quem", com os níveis vindos do banco.
 *
 * `hierarquia.ts` sabe comparar dois lados; aqui é onde os dois lados são
 * montados. A diferença importa: comparar pelo papel bastaria enquanto só
 * existissem as quatro funções originais, mas com funções cadastradas a
 * comparação precisa do nível de cada uma — senão um Coordenador e um
 * Supervisor, ambos herdando "requisitante", ficariam empatados e nenhum
 * poderia editar o outro.
 */

type Lado = LadoDaComparacao;

async function carregarLado(
  supabase: SupabaseClient,
  userId: string
): Promise<Lado | null> {
  // A FK precisa ser nomeada: `funcoes.created_by` também aponta para
  // `profiles`, e um `funcoes(nivel)` sem ela é ambíguo (PGRST201) — a consulta
  // inteira falha e todo mundo, até o Super Admin, cai no bloqueio.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, departamento, funcao_id, funcoes!profiles_funcao_id_fkey(nivel)")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("[hierarquia] falha ao carregar perfil", userId, error);
  }
  if (!data) return null;

  // `funcoes` vem como objeto ou lista conforme o formato do embed; sem função
  // atribuída, vem nulo — e aí o nível cai no equivalente ao papel.
  const bruto = (data as { funcoes?: unknown }).funcoes;
  const relacao = Array.isArray(bruto) ? bruto[0] : bruto;
  const nivel =
    relacao && typeof (relacao as { nivel?: unknown }).nivel === "number"
      ? ((relacao as { nivel: number }).nivel as number)
      : null;

  return {
    id: data.id as string,
    role: (data.role as string) ?? null,
    departamento: (data.departamento as string) ?? null,
    nivel,
  };
}

/**
 * Devolve a mensagem de bloqueio, ou `null` quando a alteração é permitida.
 *
 * Falha fechada: se qualquer um dos dois lados não puder ser lido, bloqueia.
 * Uma comparação de hierarquia com um lado ausente não é uma comparação.
 */
export async function bloqueioDeEdicao(
  supabase: SupabaseClient,
  editorId: string,
  alvoId: string
): Promise<string | null> {
  if (editorId === alvoId) return null;

  const [editor, alvo] = await Promise.all([
    carregarLado(supabase, editorId),
    carregarLado(supabase, alvoId),
  ]);

  if (!editor || !alvo) {
    return "Acesso não autorizado: não foi possível conferir a hierarquia.";
  }

  return motivoDoBloqueio(editor, alvo);
}
