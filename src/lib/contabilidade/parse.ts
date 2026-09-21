"use client";

/**
 * Parse de balancetes no navegador (CSV, XLSX/XLS, PDF).
 *
 * O arquivo original nunca sai daqui: esta biblioteca extrai as linhas de
 * contas e devolve dados estruturados. PDF é best-effort — cada contabilidade
 * gera um layout — e quando a extração falha a mensagem diz para usar XLSX/CSV.
 */

import type { BalanceteExtraido, ContaExtraida, NaturezaConta } from "./tipos";

const MAX_LINHAS = 5000;
const MAX_BYTES = 10 * 1024 * 1024;

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehColunaDe(cab: string, chaves: string[]): boolean {
  const n = semAcento(cab);
  return chaves.some((c) => n.includes(c));
}

/** "1.234,56" → 1234.56 · "(1.234,56)" → -1234.56 · "" / "-" → 0. */
export function parseNumeroBr(texto: string): number {
  let t = texto.trim().replace(/^R\$\s?/, "");
  if (!t || t === "-") return 0;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/\s/g, "");
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return negativo ? -n : n;
}

function naturezaDe(texto: string): NaturezaConta {
  const n = semAcento(texto.trim());
  if (!n) return "";
  if (/^(d|deb|devedor)/.test(n)) return "devedora";
  if (/^(c|cred|cre)/.test(n) && !/crescer/.test(n)) return "credora";
  return "";
}

/** CSV com aspas (suficiente para exportações de contabilidade). */
function parseCSV(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, "");
  // O separador é o mais frequente na primeira linha (; , ou tab).
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const candidatos = [";", ",", "\t"].map((s) => ({
    s,
    n: primeira.split(s).length,
  }));
  const sep = candidatos.sort((a, b) => b.n - a.n)[0].s;
  const saida: string[][] = [];
  let atual: string[] = [];
  let atualCampo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length && saida.length < MAX_LINHAS; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          atualCampo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        atualCampo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      atual.push(atualCampo);
      atualCampo = "";
    } else if (c === "\n") {
      atual.push(atualCampo);
      saida.push(atual);
      atual = [];
      atualCampo = "";
    } else if (c === "\r") {
      continue;
    } else {
      atualCampo += c;
    }
  }
  if (atualCampo !== "" || atual.length > 0) {
    atual.push(atualCampo);
    saida.push(atual);
  }
  return saida.map((l) => l.map((x) => x.trim())).filter((l) => l.some((x) => x !== ""));
}

/** Localiza a linha de cabeçalho (código/conta/descrição/débito/crédito/saldo). */
function acharCabecalho(linhas: string[][]): number {
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const cols = linhas[i];
    let pontos = 0;
    if (cols.some((c) => ehColunaDe(c, ["codigo", "cod.", "cod", "conta", "classifica"]))) pontos++;
    if (cols.some((c) => ehColunaDe(c, ["descricao", "descri", "nome", "historico"]))) pontos++;
    if (cols.some((c) => ehColunaDe(c, ["debito"]))) pontos++;
    if (cols.some((c) => ehColunaDe(c, ["credito"]))) pontos++;
    if (cols.some((c) => ehColunaDe(c, ["saldo", "valor"]))) pontos++;
    if (pontos >= 3) return i;
  }
  return -1;
}

function mapearColunas(cols: string[]): {
  codigo: number;
  descricao: number;
  debitos: number;
  creditos: number;
  saldo: number;
  natureza: number;
} {
  const idx = (chaves: string[]) => cols.findIndex((c) => ehColunaDe(c, chaves));
  return {
    codigo: idx(["codigo", "cod.", "cod", "conta", "classifica"]),
    descricao: idx(["descricao", "descri", "nome", "historico"]),
    debitos: idx(["debito"]),
    creditos: idx(["credito"]),
    saldo: idx(["saldo final", "saldo atual", "saldo"]),
    natureza: idx(["natureza", "d/c", "d_c", "tipo de saldo"]),
  };
}

function ehLinhaDeTotal(descricao: string): boolean {
  return /^\s*totais?\s*(geral|gerais)?\s*$/i.test(descricao);
}

/** Datas dd/mm/aaaa no topo: menor e maior viram o período identificado. */
function acharPeriodo(linhas: string[][]): { inicio: string; fim: string } | null {
  const achadas: string[] = [];
  for (const linha of linhas.slice(0, 20)) {
    for (const cel of linha) {
      const m = cel.match(/(\d{2})\/(\d{2})\/(\d{4})/g);
      if (m) achadas.push(...m);
    }
  }
  if (achadas.length === 0) return null;
  const iso = achadas
    .map((d) => {
      const [dd, mm, aa] = d.split("/");
      return `${aa}-${mm}-${dd}`;
    })
    .sort();
  return { inicio: iso[0], fim: iso[iso.length - 1] };
}

/** Tabela crua → contas. Colunas ausentes viram 0/"". */
function extrairContas(
  linhas: string[][],
  origem: BalanceteExtraido["origem"]
): { contas: ContaExtraida[]; avisos: string[]; periodoDoc: BalanceteExtraido["periodoDoc"] } {
  const avisos: string[] = [];
  const periodoDoc = acharPeriodo(linhas);
  const h = acharCabecalho(linhas);
  if (h < 0) {
    throw new Error(
      "Não encontrei o cabeçalho da tabela (código, descrição, débitos, créditos, saldos). Confira se o arquivo é um balancete ou use XLSX/CSV."
    );
  }
  const mapa = mapearColunas(linhas[h]);
  if (mapa.descricao < 0) {
    throw new Error("Achei o cabeçalho, mas não a coluna de descrição das contas.");
  }
  const contas: ContaExtraida[] = [];
  for (const linha of linhas.slice(h + 1)) {
    const cel = (i: number) => (i >= 0 ? (linha[i] ?? "").trim() : "");
    const descricao = cel(mapa.descricao);
    if (!descricao || ehLinhaDeTotal(descricao)) continue;
    const codigo = cel(mapa.codigo);
    const debitos = mapa.debitos >= 0 ? parseNumeroBr(cel(mapa.debitos)) : 0;
    const creditos = mapa.creditos >= 0 ? parseNumeroBr(cel(mapa.creditos)) : 0;
    if (Number.isNaN(debitos) || Number.isNaN(creditos)) {
      avisos.push(`Linha ignorada (valor inválido): ${codigo} ${descricao}`.slice(0, 120));
      continue;
    }
    let saldo = mapa.saldo >= 0 ? parseNumeroBr(cel(mapa.saldo)) : debitos - creditos;
    if (Number.isNaN(saldo)) saldo = debitos - creditos;
    let natureza = naturezaDe(cel(mapa.natureza));
    if (!natureza) natureza = saldo < 0 ? "credora" : "devedora";
    if (!codigo && debitos === 0 && creditos === 0 && saldo === 0) continue;
    contas.push({ codigo, descricao, natureza, debitos, creditos, saldo });
    if (contas.length >= MAX_LINHAS) break;
  }
  if (contas.length === 0) {
    throw new Error("Nenhuma conta foi extraída. Confira o layout do arquivo.");
  }
  if (mapa.codigo < 0) avisos.push("Sem coluna de código: a classificação será pela descrição.");
  if (mapa.debitos < 0 || mapa.creditos < 0) {
    avisos.push("Sem colunas de débitos/créditos: a validação do balancete fica limitada.");
  }
  void origem;
  return { contas, avisos, periodoDoc };
}

async function parseXLSX(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const primeira = wb.SheetNames[0];
  if (!primeira) throw new Error("A planilha não tem abas.");
  const ws = wb.Sheets[primeira];
  const linhas = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false });
  return (linhas as unknown as string[][])
    .map((l) => (l ?? []).map((c) => String(c ?? "").trim()))
    .filter((l) => l.some((c) => c !== ""))
    .slice(0, MAX_LINHAS);
}

/** PDF best-effort: agrupa itens de texto por linha (posição Y) e quebra colunas por vãos. */
async function parsePDF(file: File): Promise<string[][]> {
  // Importa o build "legacy": o build moderno do pdfjs-dist usa sintaxe
  // (campos privados de classe, Promise.withResolvers etc.) que o webpack do
  // Next 14 não consegue parsear — o legacy é transpilado e compatible.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // O worker NÃO é embutido no bundle: um `new URL(..., import.meta.url)`
  // faria o webpack emitir o worker como asset e o Terser quebraria ao
  // minificá-lo (`import.meta` fora de módulo). Aponta para o CDN com a
  // versão exata da lib instalada, que o `pdfjs.version` garante.
  const versao = (pdfjs as { version?: string }).version ?? "6.3.289";
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${versao}/legacy/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const linhas: string[][] = [];
  const paginas = Math.min(pdf.numPages, 60);
  for (let p = 1; p <= paginas; p++) {
    const pagina = await pdf.getPage(p);
    const conteudo = await pagina.getTextContent();
    type Item = { x: number; y: number; texto: string };
    const itens: Item[] = [];
    for (const it of conteudo.items) {
      const t = it as { str?: string; transform?: number[] };
      if (!t.str || !t.str.trim()) continue;
      itens.push({ x: t.transform?.[4] ?? 0, y: t.transform?.[5] ?? 0, texto: t.str });
    }
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    let atual: Item[] = [];
    let yRef: number | null = null;
    const descarregar = () => {
      if (atual.length === 0) return;
      atual.sort((a, b) => a.x - b.x);
      // Nova coluna quando o vão horizontal passa de ~14 pontos.
      const cols: string[] = [];
      let parte = "";
      let xAnt: number | null = null;
      for (const it of atual) {
        if (xAnt !== null && it.x - xAnt > 14) {
          cols.push(parte.trim());
          parte = "";
        } else if (parte && !parte.endsWith(" ")) {
          parte += " ";
        }
        parte += it.texto;
        xAnt = it.x + it.texto.length * 4;
      }
      cols.push(parte.trim());
      // Ou quebra por 2+ espaços, que certas contabilidades usam.
      const fina: string[] = [];
      for (const c of cols) fina.push(...c.split(/\s{2,}/).map((x) => x.trim()));
      if (fina.some((c) => c !== "")) linhas.push(fina);
      atual = [];
    };
    for (const it of itens) {
      if (yRef === null || Math.abs(it.y - yRef) > 3) {
        descarregar();
        yRef = it.y;
      }
      atual.push(it);
    }
    descarregar();
    if (linhas.length > MAX_LINHAS) break;
  }
  if (linhas.length === 0) {
    throw new Error(
      "Não consegui ler texto deste PDF (pode ser imagem digitalizada). Use o XLSX ou CSV do balancete."
    );
  }
  return linhas.slice(0, MAX_LINHAS);
}

const EXTENSOES: Record<string, BalanceteExtraido["origem"]> = {
  csv: "csv",
  xls: "xlsx",
  xlsx: "xlsx",
  pdf: "pdf",
};

/** Ponto único de entrada: valida tamanho/tipo e devolve as contas. */
export async function parseArquivo(file: File): Promise<BalanceteExtraido> {
  if (file.size > MAX_BYTES) {
    throw new Error("Arquivo maior que 10 MB. Exporte um período menor e tente de novo.");
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const origem = EXTENSOES[ext];
  if (!origem) {
    throw new Error("Formato não aceito. Envie PDF, XLSX, XLS ou CSV.");
  }
  let linhas: string[][];
  if (origem === "csv") {
    linhas = parseCSV(await file.text());
  } else if (origem === "xlsx") {
    linhas = await parseXLSX(file);
  } else {
    linhas = await parsePDF(file);
  }
  const { contas, avisos, periodoDoc } = extrairContas(linhas, origem);
  return { contas, avisos, periodoDoc, origem, linhasLidas: linhas.length };
}
