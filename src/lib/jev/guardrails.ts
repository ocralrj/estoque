/**
 * Guardrails de desenvolvimento com Jev — somente servidor.
 *
 * Piloto 0: dois julgamentos estreitos para o fluxo dev, com fallback
 * local quando não há chave ou SDK. O Jev decide; a heurística só
 * aproxima para não travar ninguém.
 *
 * Uso futuro (pilotos 1-4): os mesmos padrões via SDK oficial
 * (`npm install @typesafe-ai/sdk`, Node 20+). Nunca chamar `jev-code`
 * via shell a partir do código da aplicação.
 */
import { modeloJev, temChaveJev } from "./config";

export interface Candidato {
  id: string;
  texto: string;
}

export interface VereditoDiff {
  /** Verdadeiro quando o diff provavelmente toca área sensível. */
  sensivel: boolean;
  motivo: string;
  fonte: "jev" | "heuristica";
  probabilidade?: number;
}

// Sinais de área sensível neste projeto: auth, RLS, papéis, sessão.
const PADROES_SENSIVEIS: RegExp[] = [
  /get_user_role/i,
  /row\s*level\s*security|\brls\b/i,
  /create\s+policy|drop\s+policy|alter\s+policy/i,
  /profiles\s*\(/i,
  /service_role/i,
  /middleware/i,
  /cookies\(\)|getSession|requireSession|get_user_role/i,
  /permis[sãa]o|exigir\(|isManager|canManageStock/i,
  /\brole\b|papel|super_admin|almoxarife|requisitante/i,
];

function heuristicaDiffSensivel(diff: string): VereditoDiff {
  const trecho = diff.slice(0, 4000);
  const achou = PADROES_SENSIVEIS.find((re) => re.test(trecho));
  if (achou) {
    return {
      sensivel: true,
      motivo: `Heurística: padrão sensível (${achou.source.slice(0, 40)}…).`,
      fonte: "heuristica",
    };
  }
  return {
    sensivel: false,
    motivo: "Heurística: nenhum padrão de auth/RLS/papel encontrado.",
    fonte: "heuristica",
  };
}

/**
 * Verifica se um diff toca autenticação, RLS, papéis ou sessão.
 * Com chave + SDK, pergunta ao Jev; sem isso, usa a heurística acima.
 */
export async function verificaDiffSensivel(
  diff: string
): Promise<VereditoDiff> {
  if (!diff || !diff.trim()) {
    return {
      sensivel: false,
      motivo: "Diff vazio — nada a verificar.",
      fonte: "heuristica",
    };
  }
  if (!temChaveJev()) return heuristicaDiffSensivel(diff);

  try {
    // Import dinâmico por nome variável: não quebra o build sem o SDK
    // instalado (retorna any) e falha com graça no catch.
    const NOME_SDK = "@typesafe-ai/sdk";
    const sdk = (await import(NOME_SDK)) as {
      TypeSafeClient?: new () => {
        systemOne?: (args: unknown) => Promise<unknown>;
      };
      noul?: (instructions: string) => unknown;
    };
    if (!sdk?.TypeSafeClient || !sdk?.noul) {
      return heuristicaDiffSensivel(diff);
    }
    const client = new sdk.TypeSafeClient();
    if (typeof client.systemOne !== "function") {
      return heuristicaDiffSensivel(diff);
    }
    const resposta = (await client.systemOne({
      state: { diff: diff.slice(0, 4000) },
      questions: {
        toca_auth: sdk.noul(
          "Does `diff` touch authentication, authorization, RLS policies, roles, or session handling?"
        ),
      },
    })) as {
      answers?: { toca_auth?: { noul?: number } };
    };
    const p = resposta?.answers?.toca_auth?.noul;
    if (typeof p !== "number") return heuristicaDiffSensivel(diff);
    return {
      sensivel: p >= 0.5,
      motivo:
        p >= 0.75
          ? "Jev: diff toca área sensível."
          : p <= 0.25
            ? "Jev: diff não toca área sensível."
            : "Jev: incerto — revisar à mão.",
      fonte: "jev",
      probabilidade: p,
    };
  } catch {
    return heuristicaDiffSensivel(diff);
  }
}

function pontuaPorPalavraChave(query: string, texto: string): number {
  const termos = query
    .toLowerCase()
    .split(/[^a-z0-9à-ú]+/i)
    .filter((t) => t.length > 2);
  if (termos.length === 0) return 0;
  const alvo = texto.toLowerCase();
  let pontos = 0;
  for (const t of termos) {
    if (alvo.includes(t)) pontos += 1;
  }
  return pontos / termos.length;
}

/**
 * Ordena candidatos por relevância para a consulta.
 * Com chave + SDK usa o Jev (rank); sem isso, aproxima por palavra-chave.
 * Nunca confie no primeiro lugar se nada for relevante: confira o escore.
 */
export async function ranquearCandidatos(
  query: string,
  candidatos: Candidato[],
  topK = 3
): Promise<{ id: string; relevancia: number; fonte: "jev" | "heuristica" }[]> {
  const lista = candidatos.slice(0, 250);
  if (!temChaveJev()) {
    return lista
      .map((c) => ({
        id: c.id,
        relevancia: pontuaPorPalavraChave(query, `${c.id} ${c.texto}`),
        fonte: "heuristica" as const,
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, topK);
  }

  try {
    const NOME_SDK_RANK = "@typesafe-ai/sdk";
    const sdk = (await import(NOME_SDK_RANK)) as {
      TypeSafeClient?: new () => {
        systemOne?: (args: unknown) => Promise<unknown>;
      };
    };
    void modeloJev();
    // O rank do SDK precisa de página própria do primitive; enquanto o
    // mapeamento exato não for validado contra a versão instalada,
    // degradar para a heurística é o comportamento honesto.
    void sdk;
    return lista
      .map((c) => ({
        id: c.id,
        relevancia: pontuaPorPalavraChave(query, `${c.id} ${c.texto}`),
        fonte: "heuristica" as const,
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, topK);
  } catch {
    return lista
      .map((c) => ({
        id: c.id,
        relevancia: pontuaPorPalavraChave(query, `${c.id} ${c.texto}`),
        fonte: "heuristica" as const,
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, topK);
  }
}
