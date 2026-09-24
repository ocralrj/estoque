import {
  getChaveOpenRouter,
  getChavesGemini,
  getModelosOpenRouter,
  getPreferenciaIA,
  type AiConfig,
} from "./config";
import {
  chatCompletion,
  type ChatMessage,
  type ProviderResult,
} from "./providers/openai-compatible";
import { geminiChatCompletion } from "./providers/gemini";

export type { ChatMessage, ProviderResult };

/**
 * Orquestrador de provedores com fallback automático (docs/IA_ROTACAO_GUIA.md).
 *
 * O chamador nunca escolhe modelo: tenta Gemini (rotação de chaves),
 * OpenRouter (rotação de modelos) e o caminho legado OpenAI-compatível,
 * na ordem da preferência. Erro 429/401/402/403/404 pune o alvo
 * (15 min / 24 h); timeout, rede e resposta vazia são transientes e o
 * próximo é tentado na hora. Quem está de castigo vai para o fim da
 * fila, mas continua sendo tentado; sucesso limpa o castigo.
 *
 * Estado em memória por instância (mesma limitação documentada do
 * rate-limit no serverless): o comportamento correto — tentar o
 * próximo — não depende dele. Roda só no servidor; nunca loga chaves
 * nem conteúdo de prompts.
 */

export type TarefaIA = "texto" | "visao";

interface Candidato {
  id: string;
  rotulo: string;
  executar: () => Promise<ProviderResult>;
}

interface Castigo {
  ate: number;
  motivo: "sem-cota" | "conta-chave" | "modelo-fora-do-ar";
  rotulo: string;
}

export interface EventoRotacao {
  hora: string;
  tarefa: TarefaIA;
  modelo: string;
  ok: boolean;
  motivo: string | null;
  duracaoMs: number;
}

export interface EstadoModelo {
  modelo: string;
  chamadas: number;
  acertos: number;
  castigo: string | null;
  voltaEmMin: number | null;
}

const SEM_COTA_MS = 15 * 60 * 1000;
const CONTA_CHAVE_MS = 24 * 60 * 60 * 1000;
const BASE_OPENROUTER = "https://openrouter.ai/api/v1";
const LOG_MAXIMO = 30;

const castigos = new Map<string, Castigo>();
const anel: EventoRotacao[] = [];
const estatisticas = new Map<string, { chamadas: number; acertos: number }>();

/** Classifica pelos sinais reais do provedor. null = transiente. */
function classificarFalha(msg: string): { ms: number; motivo: Castigo["motivo"] } | null {
  if (/HTTP 429/.test(msg)) return { ms: SEM_COTA_MS, motivo: "sem-cota" };
  if (/HTTP 40[123]/.test(msg)) return { ms: CONTA_CHAVE_MS, motivo: "conta-chave" };
  if (/HTTP 404/.test(msg)) return { ms: CONTA_CHAVE_MS, motivo: "modelo-fora-do-ar" };
  return null;
}

function deCastigo(id: string, agora: number): boolean {
  const c = castigos.get(id);
  if (!c) return false;
  if (c.ate <= agora) {
    castigos.delete(id);
    return false;
  }
  return true;
}

function montarCandidatos(
  config: AiConfig,
  messages: ChatMessage[],
  tarefa: TarefaIA
): Candidato[] {
  // maxRetries 0: a resiliência vem da rotação entre alternativas,
  // não de repetir no mesmo alvo.
  const chavesGemini = getChavesGemini();
  const modeloGemini =
    config.provider === "gemini" ? config.model || "gemini-2.0-flash" : "gemini-2.0-flash";
  const gemini: Candidato[] = chavesGemini.map((chave, i) => ({
    id: `gemini:${i}`,
    rotulo: `gemini/${modeloGemini}`,
    executar: () =>
      geminiChatCompletion(
        { ...config, apiKey: chave, model: modeloGemini, maxRetries: 0 },
        messages
      ),
  }));

  const chaveOR = getChaveOpenRouter();
  const openrouter: Candidato[] = chaveOR
    ? getModelosOpenRouter(tarefa).map((modelo) => ({
        id: `openrouter:${modelo}`,
        rotulo: `openrouter/${modelo}`,
        executar: () =>
          chatCompletion(
            {
              ...config,
              apiKey: chaveOR,
              baseUrl: BASE_OPENROUTER,
              model: modelo,
              maxRetries: 0,
            },
            messages
          ),
      }))
    : [];

  // Caminho legado OpenAI-compatível (Groq etc.): só entra se foi o
  // escolhido ou se é a única chave — preserva o comportamento anterior.
  const legado: Candidato[] =
    config.apiKey &&
    (config.provider === "openai" || (chavesGemini.length === 0 && openrouter.length === 0))
      ? [
          {
            id: "openai-legado",
            rotulo: `legado/${config.model}`,
            executar: () => chatCompletion({ ...config, maxRetries: 0 }, messages),
          },
        ]
      : [];

  const pref = getPreferenciaIA();
  if (pref === "openrouter") return [...openrouter, ...gemini, ...legado];
  if (pref === "openai") return [...legado, ...gemini, ...openrouter];
  return [...gemini, ...openrouter, ...legado];
}

export async function gerarTextoComRotacao(
  config: AiConfig,
  messages: ChatMessage[],
  tarefa: TarefaIA = "texto"
): Promise<ProviderResult> {
  const candidatos = montarCandidatos(config, messages, tarefa);
  if (candidatos.length === 0) throw new Error("SEM_CHAVE");

  const agora = Date.now();
  const ordem = [...candidatos].sort(
    (a, b) => Number(deCastigo(a.id, agora)) - Number(deCastigo(b.id, agora))
  );

  let ultimoErro: Error | null = null;
  for (const c of ordem) {
    const inicio = Date.now();
    try {
      const res = await c.executar();
      if (!res.content?.trim()) throw new Error("Provedor retornou resposta vazia");
      castigos.delete(c.id);
      const est = estatisticas.get(c.rotulo) ?? { chamadas: 0, acertos: 0 };
      est.chamadas++;
      est.acertos++;
      estatisticas.set(c.rotulo, est);
      anotar({
        hora: new Date().toISOString(),
        tarefa,
        modelo: res.model || c.rotulo,
        ok: true,
        motivo: null,
        duracaoMs: Date.now() - inicio,
      });
      return { content: res.content, model: res.model || c.rotulo };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ultimoErro = err instanceof Error ? err : new Error(msg);
      const pena = classificarFalha(msg);
      const est = estatisticas.get(c.rotulo) ?? { chamadas: 0, acertos: 0 };
      est.chamadas++;
      estatisticas.set(c.rotulo, est);
      anotar({
        hora: new Date().toISOString(),
        tarefa,
        modelo: c.rotulo,
        ok: false,
        motivo: pena ? pena.motivo : "transiente",
        duracaoMs: Date.now() - inicio,
      });
      if (pena) castigos.set(c.id, { ate: Date.now() + pena.ms, motivo: pena.motivo, rotulo: c.rotulo });
    }
  }
  throw ultimoErro ?? new Error("Nenhum provedor respondeu");
}

function anotar(ev: EventoRotacao): void {
  anel.push(ev);
  if (anel.length > LOG_MAXIMO) anel.splice(0, anel.length - LOG_MAXIMO);
}

/** Últimos eventos (sem segredos, sem prompts) — base da futura tela de status admin. */
export function lerLogRotacao(): EventoRotacao[] {
  return [...anel];
}

/** Situação por modelo: chamadas, acertos, castigo e volta estimada. */
export function lerEstadoRotacao(): EstadoModelo[] {
  const agora = Date.now();
  const mapa = new Map<string, EstadoModelo>();
  estatisticas.forEach((e, rotulo) => {
    mapa.set(rotulo, {
      modelo: rotulo,
      chamadas: e.chamadas,
      acertos: e.acertos,
      castigo: null,
      voltaEmMin: null,
    });
  });
  castigos.forEach((c) => {
    const atual = mapa.get(c.rotulo) ?? {
      modelo: c.rotulo,
      chamadas: 0,
      acertos: 0,
      castigo: null as string | null,
      voltaEmMin: null as number | null,
    };
    if (c.ate > agora) {
      atual.castigo = c.motivo;
      atual.voltaEmMin = Math.ceil((c.ate - agora) / 60000);
    }
    mapa.set(c.rotulo, atual);
  });
  return Array.from(mapa.values());
}
