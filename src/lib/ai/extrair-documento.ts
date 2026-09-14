import { getAiConfig } from "./config";

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

const TIPOS_INLINE_GEMINI = [
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
];

const TIPOS_IMAGEM_OPENAI = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
];

const TAMANHO_MAXIMO = 4 * 1024 * 1024;

const INSTRUCAO = `Voce le docs empresariais BR e extrai dados para GED. JSON:
{"nome":string|null,"cliente":string|null,"cnpj":string|null,"tipo":string|null,"resumo":string|null,"data_documento":string|null,"validade":string|null,"periodo":string|null,"setor":string|null,"confianca":"alta"|"media"|"baixa"}
Regras: nome=titulo descritivo; cliente=empresa dona; cnpj=formato 00.000.000/0000-00; tipo=NF-e,Contrato...; resumo=1-3 frases pt-br; data_documento/validade=AAAA-MM-DD; periodo=AAAA-MM; setor=Fiscal,DP,Contabil,Juridico,Administrativo; null se duvidoso; confianca=alta,media,baixa`;

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

const SETORES = ["Fiscal", "DP", "Contabil", "Juridico", "Administrativo"];

function extrairJsonDaResposta(texto: string): Record<string, unknown> {
  try {
    return JSON.parse(texto) as Record<string, unknown>;
  } catch {
    const m = texto.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as Record<string, unknown>;
    throw new Error("resposta sem JSON");
  }
}

function montarResultado(bruto: Record<string, unknown>): DadosExtraidos {
  const setor = limparTexto(bruto.setor, 20);
  return {
    nome: limparTexto(bruto.nome, 200),
    cliente: limparTexto(bruto.cliente, 160),
    cnpj: limparTexto(bruto.cnpj, 18),
    tipo: limparTexto(bruto.tipo, 80),
    resumo: limparTexto(bruto.resumo, 2000),
    data_documento: limparData(bruto.data_documento),
    validade: limparData(bruto.validade),
    periodo: limparPeriodo(bruto.periodo),
    setor: setor && SETORES.includes(setor) ? setor : null,
    confianca: bruto.confianca === "alta" || bruto.confianca === "media" ? bruto.confianca : "baixa",
  };
}
async function extrairComGemini(
  base64: string | null, mimeType: string | null,
  textoConteudo: string | undefined,
  cfg: { baseUrl: string; model: string; apiKey: string; timeoutMs: number }
): Promise<ExtracaoResultado> {
  const model = cfg.model || "gemini-2.0-flash";
  const url = `${cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const partes: Record<string, unknown>[] = textoConteudo
      ? [{ text: `Extraia os dados do texto abaixo.\n\n${textoConteudo.slice(0, 30_000)}` }]
      : [{ inlineData: { mimeType: mimeType!, data: base64! } }, { text: "Extraia os dados." }];
    const resp = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: partes }],
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        generationConfig: { temperature: 0.1, maxOutputTokens: 900, responseMimeType: "application/json" },
      }),
    });
    if (!resp.ok) return { ok: false, code: "PROVIDER", message: "Nao foi possivel ler o documento agora. Preencha os campos a mao." };
    const json = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const texto = json.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "";
    if (!texto) return { ok: false, code: "VALIDACAO", message: "A leitura nao retornou dados." };
    return { ok: true, dados: montarResultado(extrairJsonDaResposta(texto)) };
  } catch {
    return { ok: false, code: "PROVIDER", message: "A leitura falhou. Preencha os campos a mao." };
  } finally { clearTimeout(timer); }
}

async function extrairComOpenAi(
  base64: string | null, mimeType: string | null,
  textoConteudo: string | undefined,
  cfg: { baseUrl: string; model: string; apiKey: string; timeoutMs: number }
): Promise<ExtracaoResultado> {
  const model = cfg.model || "gpt-4o-mini";
  const url = `${cfg.baseUrl}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const msgs: { role: string; content: unknown }[] = [{ role: "system", content: INSTRUCAO }];
    if (textoConteudo) {
      msgs.push({ role: "user", content: `Extraia os dados do texto abaixo.\n\n${textoConteudo.slice(0, 30_000)}` });
    } else {
      msgs.push({ role: "user", content: [
        { type: "text", text: "Extraia os dados." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ]});
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: ctrl.signal,
      body: JSON.stringify({ model, messages: msgs, temperature: 0.1, max_tokens: 900, response_format: { type: "json_object" } }),
    });
    if (!resp.ok) return { ok: false, code: "PROVIDER", message: "Nao foi possivel ler o documento agora. Preencha os campos a mao." };
    const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const texto = json.choices?.[0]?.message?.content ?? "";
    if (!texto) return { ok: false, code: "VALIDACAO", message: "A leitura nao retornou dados." };
    return { ok: true, dados: montarResultado(extrairJsonDaResposta(texto)) };
  } catch {
    return { ok: false, code: "PROVIDER", message: "A leitura falhou. Preencha os campos a mao." };
  } finally { clearTimeout(timer); }
}
export async function extrairDadosDoArquivo(
  base64: string | null,
  mimeType: string | null,
  tamanhoBytes: number,
  textoConteudo?: string
): Promise<ExtracaoResultado> {
  const config = getAiConfig();

  if (!config.enabled || !config.apiKey) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "A leitura automatica nao esta configurada. Defina AI_PROVIDER e a chave de API.",
    };
  }

  const porTexto = typeof textoConteudo === "string" && textoConteudo.length > 0;

  if (!porTexto) {
    const aceitos = config.provider === "gemini" ? TIPOS_INLINE_GEMINI : TIPOS_IMAGEM_OPENAI;
    if (!mimeType || !aceitos.includes(mimeType)) {
      const msg = config.provider === "gemini"
        ? "A leitura funciona com PDF e imagens. Preencha os campos a mao."
        : "A leitura funciona com imagens (JPEG, PNG, WebP). Para PDF use Gemini ou converta.";
      return { ok: false, code: "TIPO", message: msg };
    }
    if (tamanhoBytes > TAMANHO_MAXIMO) {
      return { ok: false, code: "TAMANHO", message: "Arquivo grande demais. Preencha os campos a mao." };
    }
  }

  if (!base64 && !porTexto) {
    return { ok: false, code: "VALIDACAO", message: "Nenhum dado para analisar." };
  }

  const params = { baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey, timeoutMs: config.timeoutMs };

  return config.provider === "gemini"
    ? extrairComGemini(base64, mimeType, textoConteudo, params)
    : extrairComOpenAi(base64, mimeType, textoConteudo, params);
}