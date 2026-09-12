/**
 * Site, logo e cores de uma empresa, lidos da página dela.
 *
 * Só roda no servidor: busca páginas de terceiros e resolve DNS. Nada aqui
 * devolve o conteúdo baixado — só o domínio, o endereço da logo e as cores.
 *
 * Quem cadastra escolhe o domínio, então toda busca passa por `baixar()`, que
 * recusa endereço interno (localhost, rede privada, metadados de nuvem) em
 * cada salto de redirecionamento.
 *
 * Cada operação tem um prazo total, e não só por requisição: são dezenas de
 * buscas, e a Server Action tem tempo limitado na Vercel.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { nomeComparavel, normalizarSite, siteValido } from "@/lib/empresas";

export interface IdentidadeVisual {
  site: string;
  logoUrl: string | null;
  corPrimaria: string | null;
  corSecundaria: string | null;
}

// Um navegador de verdade no começo: há sites que devolvem página vazia a quem
// não se parece com um. O resto identifica o sistema (ver ocral-consulta-cnpj).
const USER_AGENT = "Mozilla/5.0 (compatible; OCRAL/1.0; +https://ocral.vercel.app)";
const LIMITE_HTML = 600_000;
const LIMITE_CSS = 400_000;
const MAX_REDIRECIONAMENTOS = 4;
const PRAZO_DA_BUSCA_MS = 7000;
const PRAZO_DA_LEITURA_MS = 8000;

// ------------------------------------------------------------
// Busca segura
// ------------------------------------------------------------

function ipInterno(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function hostPublico(host: string): Promise<boolean> {
  if (isIP(host) || !siteValido(host.replace(/^www\./, ""))) return false;
  try {
    const enderecos = await lookup(host, { all: true });
    return enderecos.length > 0 && enderecos.every((e) => !ipInterno(e.address));
  } catch {
    return false;
  }
}

export interface PaginaBaixada {
  url: URL;
  tipo: string;
  corpo: string;
}

/**
 * GET que segue redirecionamentos um a um, conferindo cada destino, e para de
 * ler depois de `limite` caracteres. `null` quando não responde, recusa ou o
 * `prazo` (instante absoluto, em ms) acaba.
 */
async function baixar(
  endereco: string | URL,
  { limite, prazo, soCabecalho = false }: { limite: number; prazo: number; soCabecalho?: boolean }
): Promise<PaginaBaixada | null> {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return null;
  }

  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
    if (!/^https?:$/.test(url.protocol) || (url.port && !["80", "443"].includes(url.port))) return null;
    if (!(await hostPublico(url.hostname))) return null;

    const restante = prazo - Date.now();
    if (restante < 300) return null;

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(restante),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/css,image/*;q=0.9,*/*;q=0.5" },
      });
    } catch {
      return null;
    }

    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get("location");
      await resposta.body?.cancel().catch(() => undefined);
      if (!destino) return null;
      try {
        url = new URL(destino, url);
      } catch {
        return null;
      }
      continue;
    }
    const tipo = resposta.headers.get("content-type")?.toLowerCase() ?? "";
    if (!resposta.ok || soCabecalho) {
      await resposta.body?.cancel().catch(() => undefined);
      return resposta.ok ? { url, tipo, corpo: "" } : null;
    }
    return { url, tipo, corpo: await lerAte(resposta, limite) };
  }
  return null;
}

async function lerAte(resposta: Response, limite: number): Promise<string> {
  const leitor = resposta.body?.getReader();
  if (!leitor) return "";
  const decodificador = new TextDecoder();
  let texto = "";
  try {
    while (texto.length < limite) {
      const { done, value } = await leitor.read();
      if (done) break;
      texto += decodificador.decode(value, { stream: true });
    }
  } catch {
    // Corte por tempo no meio do corpo: o que chegou já serve.
  } finally {
    await leitor.cancel().catch(() => undefined);
  }
  return texto.slice(0, limite);
}

async function baixarPagina(site: string, prazo: number): Promise<PaginaBaixada | null> {
  for (const endereco of [`https://${site}/`, `https://www.${site}/`, `http://${site}/`]) {
    const pagina = await baixar(endereco, { limite: LIMITE_HTML, prazo });
    if (pagina && /html/.test(pagina.tipo) && pagina.corpo.length > 0) return pagina;
  }
  return null;
}

// ------------------------------------------------------------
// Leitura de HTML (sem biblioteca: só as marcações de que precisamos)
// ------------------------------------------------------------

type Atributos = Record<string, string>;

// Array.from: o tsconfig não define target, e iterar matchAll direto não compila.
const todas = (texto: string, padrao: RegExp) => Array.from(texto.matchAll(padrao));

function decodificarEntidades(v: string): string {
  return v
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function marcacoes(html: string, nome: string): Atributos[] {
  const lista: Atributos[] = [];
  for (const m of todas(html, new RegExp(`<${nome}\\b([^>]*)>`, "gi"))) {
    const atributos: Atributos = {};
    for (const a of todas(m[1], /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      atributos[a[1].toLowerCase()] = decodificarEntidades(a[3] ?? a[4] ?? a[5] ?? "");
    }
    lista.push(atributos);
  }
  return lista;
}

function metas(html: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of marcacoes(html, "meta")) {
    const chave = (m.name || m.property || "").toLowerCase();
    if (chave && m.content && !mapa.has(chave)) mapa.set(chave, m.content.trim());
  }
  return mapa;
}

function textoVisivel(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

// ------------------------------------------------------------
// Descoberta do site
// ------------------------------------------------------------

// E-mail nesses domínios não diz nada sobre o site da empresa.
const PROVEDORES_DE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br",
  "live.com", "msn.com", "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "uol.com.br",
  "bol.com.br", "terra.com.br", "ig.com.br", "globo.com", "globomail.com", "r7.com", "zipmail.com.br",
  "protonmail.com", "proton.me", "aol.com", "gmx.com", "yandex.com", "zoho.com",
]);

const PARADO =
  /(dom[ií]nio|domain)[^.]{0,60}(venda|for sale|dispon[ií]vel|is available|expirad|expired)|parked|parking|sedoparking|hugedomains|this domain|em constru[çc][ãa]o/i;

/**
 * Domínios que valem tentar, na ordem de confiança: o do e-mail, depois o
 * nome fantasia e, se for curta, a razão social, em .com.br e .com.
 */
function candidatos(p: { razaoSocial: string; nomeFantasia: string; email: string }): string[] {
  const lista: string[] = [];
  const dominioDoEmail = normalizarSite(p.email.split("@")[1] ?? "");
  if (dominioDoEmail && !PROVEDORES_DE_EMAIL.has(dominioDoEmail)) lista.push(dominioDoEmail);

  const nomes = [p.nomeFantasia, p.razaoSocial]
    .map((n) => nomeComparavel(n).toLowerCase().split(" ").filter(Boolean))
    // Razão social longa ("J OLIVER SERVICOS DE INFORMATICA TI") não vira domínio.
    .filter((partes) => partes.length > 0 && partes.length <= 3);

  for (const partes of nomes) {
    const juntos = partes.join("");
    if (juntos.length < 3) continue;
    const formas = partes.length > 1 ? [juntos, partes.join("-")] : [juntos];
    for (const forma of formas) {
      lista.push(`${forma}.com.br`, `${forma}.com`);
    }
  }
  return Array.from(new Set(lista.filter(siteValido))).slice(0, 8);
}

/**
 * A página é da empresa? Ela precisa citar o CNPJ ou trazer o nome como
 * palavras inteiras — "J OLIVER" não casa com "J. Oliveira Imóveis". Nem o
 * domínio do e-mail passa sem isso: o e-mail na Receita costuma ser o do
 * contador.
 */
function motivoParaAceitar(
  html: string,
  p: { razaoSocial: string; nomeFantasia: string; cnpj: string }
): string | null {
  const meta = metas(html);
  const titulo = html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "";
  const texto = [titulo, meta.get("og:site_name"), meta.get("description"), textoVisivel(html)].join(" ");
  if (PARADO.test(titulo) || PARADO.test(texto.slice(0, 3000))) return null;

  if (p.cnpj && texto.replace(/[^0-9A-Za-z]/g, "").toUpperCase().includes(p.cnpj)) {
    return "o site cita o CNPJ da empresa";
  }
  const comparavel = ` ${nomeComparavel(texto)} `;
  for (const nome of [p.nomeFantasia, p.razaoSocial]) {
    const n = nomeComparavel(nome);
    if (n.replace(/ /g, "").length >= 3 && comparavel.includes(` ${n} `)) {
      return `o site traz o nome "${nome.trim()}"`;
    }
  }
  return null;
}

/**
 * O site da empresa, ou `null` quando nenhum candidato respondeu com uma
 * página que a cite. A página vem junto para a leitura da identidade não
 * baixá-la de novo.
 */
export async function procurarSite(p: {
  razaoSocial: string;
  nomeFantasia: string;
  email: string;
  cnpj: string;
}): Promise<{ site: string; motivo: string; pagina: PaginaBaixada } | null> {
  const prazo = Date.now() + PRAZO_DA_BUSCA_MS;
  const tentativas = await Promise.all(
    candidatos(p).map(async (site) => {
      const pagina = await baixarPagina(site, prazo);
      const motivo = pagina ? motivoParaAceitar(pagina.corpo, p) : null;
      return motivo && pagina ? { site, motivo, pagina } : null;
    })
  );
  return tentativas.find((t) => t !== null) ?? null;
}

// ------------------------------------------------------------
// Logo
// ------------------------------------------------------------

function maiorLado(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return 512;
  return Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.split(/x/i)[0]) || 0));
}

// Imagens com "logo" no nome que não são a da empresa.
const NAO_E_A_LOGO =
  /footer|rodape|rodapé|parceir|partner|client|pagamento|payment|selo|seal|whatsapp|facebook|instagram|linkedin|youtube|twitter|google|apple|play-?store|app-?store|desenvolvid|developed|webmarketing/i;

/** Endereços possíveis da logo, do mais para o menos adequado ao cartão. */
function candidatosDeLogo(html: string, base: URL): string[] {
  const lista: string[] = [];
  const links = marcacoes(html, "link").filter((l) => l.href);
  const rel = (l: Atributos) => (l.rel ?? "").toLowerCase();

  // Ícones quadrados cabem no quadro do cartão; o apple-touch-icon costuma ser
  // a marca com fundo próprio.
  for (const l of links.filter((l) => rel(l).includes("apple-touch-icon"))) lista.push(l.href);
  const icones = links.filter((l) => /(^|\s)icon(\s|$)/.test(rel(l)));
  for (const l of icones.filter((l) => /svg/.test(l.type ?? "") || /\.svg(\?|$)/i.test(l.href))) lista.push(l.href);
  for (const l of icones.filter((l) => maiorLado(l.sizes) >= 96).sort((a, b) => maiorLado(b.sizes) - maiorLado(a.sizes))) {
    lista.push(l.href);
  }

  for (const img of marcacoes(html, "img")) {
    const src = img.src || img["data-src"] || img.srcset?.split(",")[0]?.trim().split(/\s+/)[0] || "";
    if (!src || src.startsWith("data:")) continue;
    const pistas = [img.class, img.id, img.alt, img.title, src].join(" ");
    if (/logo|brand|marca/i.test(pistas) && !NAO_E_A_LOGO.test(pistas)) lista.push(src);
  }

  for (const m of todas(html, /"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"url"\s*:\s*"([^"]+)")/g)) {
    lista.push(m[1] ?? m[2]);
  }

  lista.push("/apple-touch-icon.png");
  for (const l of icones.filter((l) => maiorLado(l.sizes) >= 32 && !/\.ico(\?|$)/i.test(l.href))) lista.push(l.href);

  const absolutos: string[] = [];
  for (const endereco of lista) {
    try {
      const url = new URL(endereco.replace(/\\\//g, "/"), base);
      if (url.protocol === "http:" && url.hostname === base.hostname) url.protocol = "https:";
      if (url.protocol === "https:" && !absolutos.includes(url.href)) absolutos.push(url.href);
    } catch {
      // endereço malformado na página
    }
  }
  return absolutos.slice(0, 10);
}

/**
 * A primeira da lista que responde como imagem. Testa todas ao mesmo tempo e
 * guarda a URL, não o arquivo. De SVG vem também o conteúdo, para as cores.
 */
async function escolherLogo(html: string, base: URL, prazo: number): Promise<{ url: string; svg: string } | null> {
  const respostas = await Promise.all(
    candidatosDeLogo(html, base).map(async (candidata) => {
      const ehSvg = /\.svg(\?|$)/i.test(candidata);
      const r = await baixar(candidata, { limite: 150_000, prazo, soCabecalho: !ehSvg });
      if (!r || !r.tipo.startsWith("image/") || r.url.protocol !== "https:") return null;
      return { url: r.url.href, svg: r.tipo.includes("svg") ? r.corpo : "" };
    })
  );
  return respostas.find((r) => r !== null) ?? null;
}

// ------------------------------------------------------------
// Cores
// ------------------------------------------------------------

type Rgb = [number, number, number];

function paraRgb(valor: string): Rgb | null {
  const v = valor.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split("").map((c) => parseInt(c + c, 16)) as Rgb;
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) {
    const hex = m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  }
  m = v.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (m) return [m[1], m[2], m[3]].map((c) => Math.min(255, Number(c))) as Rgb;
  return null;
}

const paraHex = (c: Rgb) => `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;

function hsl([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60 : max === gg ? ((bb - rr) / d + 2) * 60 : ((rr - gg) / d + 4) * 60;
  return { h, s, l };
}

/** Branco, preto e cinza estão em todo site; não caracterizam ninguém. */
function neutra(c: Rgb): boolean {
  const { s, l } = hsl(c);
  return s < 0.22 || l > 0.93 || l < 0.1;
}

const distancia = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const COR_NO_CSS = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d{1,3}[\s,]+\d{1,3}[\s,]+\d{1,3}[^)]*\)/g;

// Folhas de estilo de biblioteca trazem a paleta inteira da biblioteca.
const CSS_DE_BIBLIOTECA =
  /bootstrap|font-?awesome|jquery|swiper|slick|owl\.|animate|aos\.|wp-includes|block-library|woocommerce|elementor\/assets\/lib|fonts\.googleapis|cookie|flatpickr|select2|lightbox|fancybox/i;

class Votacao {
  private votos: { cor: Rgb; peso: number }[] = [];

  votar(valor: string | undefined, peso: number) {
    const cor = valor ? paraRgb(valor) : null;
    if (!cor || neutra(cor)) return;
    const parecida = this.votos.find((v) => distancia(v.cor, cor) < 38);
    if (parecida) parecida.peso += peso;
    else this.votos.push({ cor, peso });
  }

  /** A mais votada e, depois, a mais votada que se distingue dela. */
  resultado(): { primaria: string | null; secundaria: string | null } {
    const ordem = [...this.votos].sort((a, b) => b.peso - a.peso);
    const primeira = ordem[0];
    if (!primeira) return { primaria: null, secundaria: null };
    const p = hsl(primeira.cor);
    const segunda = ordem.slice(1).find((v) => {
      const o = hsl(v.cor);
      const diferencaDeMatiz = Math.min(Math.abs(o.h - p.h), 360 - Math.abs(o.h - p.h));
      return diferencaDeMatiz > 18 || Math.abs(o.l - p.l) > 0.22;
    });
    return { primaria: paraHex(primeira.cor), secundaria: segunda ? paraHex(segunda.cor) : null };
  }
}

function votarNoCss(votacao: Votacao, css: string) {
  // Variáveis com nome de marca valem mais que uma cor solta.
  for (const m of todas(css, /--([\w-]+)\s*:\s*([^;}]+)/g)) {
    const nome = m[1].toLowerCase();
    if (/^wp--preset|^bs-(blue|indigo|purple|pink|red|orange|yellow|green|teal|cyan|gray|white|black|dark|light)/.test(nome)) continue;
    const valor = m[2].match(COR_NO_CSS)?.[0];
    if (/primary|primaria|brand|marca|main|theme/.test(nome)) votacao.votar(valor, 6);
    else if (/secondary|secundaria|accent|destaque/.test(nome)) votacao.votar(valor, 4);
  }
  const contagem = new Map<string, number>();
  for (const m of todas(css, COR_NO_CSS)) {
    const valor = m[0].toLowerCase();
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  // Raiz da contagem: uma cor repetida cem vezes num reset não abafa o resto.
  for (const [valor, vezes] of Array.from(contagem)) votacao.votar(valor, Math.sqrt(vezes));
}

async function lerCores(html: string, base: URL, svgDaLogo: string, prazo: number) {
  const votacao = new Votacao();
  const meta = metas(html);
  votacao.votar(meta.get("theme-color"), 8);
  votacao.votar(meta.get("msapplication-tilecolor"), 5);

  // A logo é a fonte mais fiel das cores da marca.
  for (const m of todas(svgDaLogo, COR_NO_CSS)) votacao.votar(m[0], 3);
  for (const m of todas(html, /<svg\b[^>]*(?:logo|brand|marca)[^>]*>[\s\S]*?<\/svg>/gi)) {
    for (const c of todas(m[0], COR_NO_CSS)) votacao.votar(c[0], 3);
  }

  const estilosNaPagina = Array.from(todas(html, /<style\b[^>]*>([\s\S]*?)<\/style>/gi), (m) => m[1]).join("\n");
  const atributosStyle = Array.from(todas(html, /\sstyle\s*=\s*"([^"]*)"/gi), (m) => m[1]).join(";");
  votarNoCss(votacao, `${estilosNaPagina};${atributosStyle}`);

  const folhas = marcacoes(html, "link")
    .filter((l) => /stylesheet/i.test(l.rel ?? "") && l.href && !CSS_DE_BIBLIOTECA.test(l.href))
    .slice(0, 3);
  const baixadas = await Promise.all(
    folhas.map((l) => {
      try {
        return baixar(new URL(l.href, base), { limite: LIMITE_CSS, prazo });
      } catch {
        return null;
      }
    })
  );
  for (const folha of baixadas) {
    if (folha && /css|text\/plain/.test(folha.tipo)) votarNoCss(votacao, folha.corpo);
  }

  return votacao.resultado();
}

// ------------------------------------------------------------
// Ponto de entrada
// ------------------------------------------------------------

/**
 * Logo e cores do site. `null` quando o site não responde; com a página no ar
 * mas sem logo ou cor reconhecível, os campos vêm nulos.
 */
export async function lerIdentidade(site: string, paginaJaBaixada?: PaginaBaixada): Promise<IdentidadeVisual | null> {
  const dominio = normalizarSite(site);
  if (!siteValido(dominio)) return null;

  const prazo = Date.now() + PRAZO_DA_LEITURA_MS;
  const pagina = paginaJaBaixada ?? (await baixarPagina(dominio, prazo));
  if (!pagina) return null;

  const logo = await escolherLogo(pagina.corpo, pagina.url, prazo);
  const cores = await lerCores(pagina.corpo, pagina.url, logo?.svg ?? "", prazo);
  return {
    site: dominio,
    logoUrl: logo?.url ?? null,
    corPrimaria: cores.primaria,
    corSecundaria: cores.secundaria,
  };
}
