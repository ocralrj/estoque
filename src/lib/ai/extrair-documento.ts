import { getAiConfig } from "./config";

/**
 * Leitura de um documento pelo Gemini para pré-preencher o cadastro do GED.
 *
 * Diferente do resto de `lib/ai`, que só troca texto, aqui o próprio arquivo é
 * enviado ao modelo (`inlineData`), que faz OCR e interpretação em uma passada.
 *
 * O resultado é sempre um rascunho: quem cadastra revisa e corrige antes de
 * salvar. Nada é gravado a partir daqui.
 */

export interface DadosExtraidos {
  nome: string | null;
  cliente: string | null;
  cnpj: string | null;
  tipo: string | null;
  resumo: string | null;
  data_documento: string | null;
  validade: string | null;
  periodo: string | null;
  setor: string | null;
  confianca: "alta" | "media" | "baixa";
}

export type ExtracaoResultado =
  | { ok: true; dados: DadosExtraidos }
  | { ok: false; code: "NOT_CONFIGURED" | "TIPO" | "TAMANHO" | "PROVIDER" | "VALIDACAO"; message: string };

/** O que o Gemini aceita como anexo direto. */
const TIPOS_ACEITOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Acima disso a requisição fica lenta e cara para pouco ganho. */
const TAMANHO_MAXIMO = 4 * 1024 * 1024;

const INSTRUCAO = `Você lê documentos empresariais brasileiros e extrai dados para um sistema de arquivo (GED).

Responda SOMENTE com JSON no formato:
{
  "nome": string|null,
  "cliente": string|null,
  "cnpj": string|null,
  "tipo": string|null,
  "resumo": string|null,
  "data_documento": string|null,
  "validade": string|null,
  "periodo": string|null,
  "setor": string|null,
  "confianca": "alta"|"media"|"baixa"
}

Regras:
- "nome": título curto e descritivo, como uma pessoa arquivaria. Ex.: "NF-e 4321 - Fornecedor X - 08/2026".
- "cliente": a empresa a quem o documento pertence ou se refere. Se houver emitente e destinatário, prefira o destinatário.
- "cnpj": apenas se estiver legível no documento, no formato 00.000.000/0000-00. Nunca invente.
- "tipo": categoria curta. Ex.: NF-e, Contrato, Holerite, Recibo, Certidão, Balancete, Guia.
- "resumo": 1 a 3 frases sobre o conteúdo e a finalidade, em português do Brasil.
- "data_documento" e "validade": formato AAAA-MM-DD. Só preencha se a data estiver explícita.
- "periodo": competência no formato AAAA-MM, quando o documento se referir a um mês.
- "setor": um entre Fiscal, DP, Contábil, Jurídico, Administrativo — o que melhor couber.
- Campo que você não conseguir ler com segurança deve vir null. É melhor null do que um palpite.
- "confianca": sua avaliação geral da leitura.`;

function limparTexto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t.slice(0, max);
}

function limparData(v: unknown): string | null {
  const t = limparTexto(v, 10);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function limparPeriodo(v: unknown): string | null {
  const t = limparTexto(v, 7);
  return t && /^\d{4}-\d{2}$/.test(t) ? t : null;
}

const SETORES = ["Fiscal", "DP", "Contábil", "Jurídico", "Administrativo"];

export async function extrairDadosDoArquivo(
  base64: string,
  mimeType: string,
  tamanhoBytes: number
): Promise<ExtracaoResultado> {
  const config = getAiConfig();

  if (!config.enabled || !config.apiKey || config.provider !== "gemini") {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "A leitura automática exige o Gemini configurado (AI_PROVIDER=gemini e GEMINI_API_KEY).",
    };
  }
  if (!TIPOS_ACEITOS.includes(mimeType)) {
    return {
      ok: false,
      code: "TIPO",
      message: "A leitura automática funciona com PDF e imagens. Preencha os campos à mão.",
    };
  }
  if (tamanhoBytes > TAMANHO_MAXIMO) {
    return {
      ok: false,
      code: "TAMANHO",
      message: "Arquivo grande demais para a leitura automática. Preencha os campos à mão.",
    };
  }

  const model = config.model || "gemini-2.0-flash";
  const url = `${config.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: "Extraia os dados deste documento." },
            ],
          },
        ],
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        generationConfig: {
          temperature: 0.1, // extração pede literalidade, não criatividade
          maxOutputTokens: 900,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!resposta.ok) {
      return {
        ok: false,
        code: "PROVIDER",
        message: "Não foi possível ler o documento agora. Preencha os campos à mão.",
      };
    }

    const json = (await resposta.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const texto = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    if (!texto) {
      return { ok: false, code: "VALIDACAO", message: "A leitura não retornou dados." };
    }

    const bruto = JSON.parse(texto) as Record<string, unknown>;
    const setor = limparTexto(bruto.setor, 20);

    return {
      ok: true,
      dados: {
        nome: limparTexto(bruto.nome, 200),
        cliente: limparTexto(bruto.cliente, 160),
        cnpj: limparTexto(bruto.cnpj, 18),
        tipo: limparTexto(bruto.tipo, 80),
        resumo: limparTexto(bruto.resumo, 2000),
        data_documento: limparData(bruto.data_documento),
        validade: limparData(bruto.validade),
        periodo: limparPeriodo(bruto.periodo),
        setor: setor && SETORES.includes(setor) ? setor : null,
        confianca:
          bruto.confianca === "alta" || bruto.confianca === "media" ? bruto.confianca : "baixa",
      },
    };
  } catch {
    return {
      ok: false,
      code: "PROVIDER",
      message: "A leitura demorou demais ou falhou. Preencha os campos à mão.",
    };
  } finally {
    clearTimeout(timer);
  }
}
