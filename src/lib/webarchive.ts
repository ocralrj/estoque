import { normalizarSite, siteValido } from "@/lib/empresas";

/**
 * Consulta do histórico de um domínio na Wayback Machine (web.archive.org),
 * pelo CDX Server. Sempre roda no servidor.
 *
 * - A url do CDX recebe somente o domínio, já passado por `normalizarSite`:
 *   nada de caminho, protocolo, "www." ou porta. Instrumento de defesa
 *   idêntica à da busca de identidade visual — o domínio entra como chave de
 *   busca, nunca como destino de requisição.
 * - O requisito tem prazo total curto e devolve três estados que a tela trata
 *   separado: "encontrado", "nao_encontrado" e "erro". Misturar "não tem
 *   histórico" com "a consulta falhou" é o defeito que esta feature existe
 *   para corrigir.
 */

/** Uma linha do CDX já interpretada. `timestamp` vem em YYYYMMDDHHMMSS. */
export interface Captura {
  timestamp: string;
  statuscode: string;
  original: string;
  digest: string;
}

/**
 * Resultado da consulta, já resolvido.
 *
 * - `encontrado`: o arquivo respondeu e há capturas. Traz a primeira e a
 *   última (para a tela dizer "existe desde" e "última em"), o total e o
 *   domínio como o arquivo guarda.
 * - `nao_encontrado`: o arquivo respondeu e não havia captura alguma para o
 *   domínio. É um resultado legítimo, não uma falha.
 * - `erro`: a consulta não chegou a concluir (timeout, 403/429, 5xx, JSON
 *   estranho). NUNCA deve ser apresentado como "sem histórico" — a tela usa
 *   `motivo` para explicar o que ocorreu.
 */
export type ResultadoDoHistorico =
  | {
      estado: "encontrado";
      dominio: string;
      total: number;
      primeira: Captura;
      ultima: Captura;
    }
  | { estado: "nao_encontrado"; dominio: string }
  | { estado: "erro"; dominio: string; motivo: string };

const ENDERECO_DO_CDX = "https://web.archive.org/cdx/search/cdx";
const LIMITE_DE_RESULTADOS = 300; // cap: não precisamos do arquivo inteiro.
const PRAZO_DA_CONSULTA = 8_000; // cabe dentro dos 10s da Server Action.
const PROXY_AMIGAVEL = "Mozilla/5.0 (compatible; OCRAL/1.0; +https://ocral.vercel.app)";

/**
 * Consulta o histórico do domínio na Wayback e devolve o resultado
 * interpretado. Nunca lança: qualquer falha vira `{ estado: "erro" }` com a
 * explicação em `motivo`.
 */
export async function consultarHistorico(site: string): Promise<ResultadoDoHistorico> {
  const dominio = normalizarSite(site);
  if (!dominio || !siteValido(dominio)) {
    return { estado: "erro", dominio: site, motivo: "O endereço informado não é um domínio válido." };
  }

  const url = new URL(ENDERECO_DO_CDX);
  url.searchParams.set("url", dominio); // só o domínio, jamais o site inteiro.
  url.searchParams.set("output", "json");
  url.searchParams.set("fl", "timestamp,statuscode,original,digest");
  url.searchParams.set("filter", "statuscode:200");
  url.searchParams.set("collapse", "digest");
  url.searchParams.set("limit", String(LIMITE_DE_RESULTADOS));

  try {
    const resposta = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": PROXY_AMIGAVEL,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(PRAZO_DA_CONSULTA),
    });

    if (resposta.status === 403 || resposta.status === 429) {
      return { estado: "erro", dominio, motivo: "O arquivo recusou a consulta (limite de pedidos). Tente de novo daqui a pouco." };
    }
    if (!resposta.ok) {
      return { estado: "erro", dominio, motivo: `O arquivo respondeu com erro (HTTP ${resposta.status}).` };
    }

    const corpo = await resposta.json();
    const linhas = Array.isArray(corpo) ? (corpo as unknown[][]).slice(1) : [];

    const capturas: Captura[] = [];
    for (const linha of linhas) {
      if (!Array.isArray(linha)) continue;
      const [timestamp, statuscode, original, digest] = linha as string[];
      if (!/^\d{1,14}$/.test(timestamp ?? "")) continue; // linha malformada.
      capturas.push({ timestamp, statuscode, original, digest });
    }

    if (capturas.length === 0) {
      return { estado: "nao_encontrado", dominio };
    }

    // O CDX devolve em ordem cronológica (mais antiga primeiro).
    const primeira = capturas[0];
    const ultima = capturas[capturas.length - 1];

    return { estado: "encontrado", dominio, total: capturas.length, primeira, ultima };
  } catch (erro) {
    if (erro instanceof Error && erro.name === "TimeoutError") {
      return { estado: "erro", dominio, motivo: "A consulta demorou demais e não terminou a tempo." };
    }
    return { estado: "erro", dominio, motivo: "Não foi possível consultar o arquivo de histórico do momento." };
  }
}
