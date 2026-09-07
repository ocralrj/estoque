/**
 * Preparo de arquivos do GED antes do envio.
 *
 * Regra central: **documento assinado nunca é alterado**. Recomprimir mudaria
 * os bytes e, com eles, o hash — o que invalida a assinatura digital e destrói
 * justamente a prova que o documento existe para guardar. Todo o resto é
 * compactado para não inchar o armazenamento.
 */

export type Compressao = "nenhuma" | "imagem" | "gzip";

export interface ArquivoPreparado {
  blob: Blob;
  nome: string;
  mimeType: string;
  compressao: Compressao;
  tamanhoOriginal: number;
  tamanhoFinal: number;
}

/** Maior lado de uma imagem depois do reamostramento. */
const LADO_MAXIMO = 1600;
/** Qualidade do JPEG/WebP de saída. 0.72 mantém texto legível em documento. */
const QUALIDADE = 0.72;

const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

/** gzip só compensa em formato que ainda não é comprimido internamente. */
const JA_COMPRIMIDOS = [
  "application/zip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/gzip",
  "image/gif",
  "video/",
  "audio/",
];

export function formatarBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const unidades = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  const valor = bytes / Math.pow(1024, i);
  return `${valor.toFixed(valor >= 10 || i === 0 ? 0 : 1)} ${unidades[i]}`;
}

/**
 * Reamostra a imagem para caber em LADO_MAXIMO e recodifica.
 * Mantém a proporção e nunca amplia uma imagem menor que o limite.
 */
async function comprimirImagem(file: File | Blob, nomeBase: string): Promise<ArquivoPreparado> {
  const bitmap = await createImageBitmap(file);

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível processar a imagem neste navegador.");
  }

  // Fundo branco: PNG com transparência viraria preto ao virar JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALIDADE)
  );
  if (!blob) throw new Error("Não foi possível compactar a imagem.");

  return {
    blob,
    nome: `${nomeBase}.jpg`,
    mimeType: "image/jpeg",
    compressao: "imagem",
    tamanhoOriginal: file.size,
    tamanhoFinal: blob.size,
  };
}

/** Compacta com gzip usando a API nativa do navegador — sem biblioteca. */
async function comprimirGzip(file: File, nomeBase: string): Promise<ArquivoPreparado> {
  const fluxo = file.stream().pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(fluxo).blob();

  return {
    blob,
    nome: `${nomeBase}.gz`,
    mimeType: file.type || "application/octet-stream",
    compressao: "gzip",
    tamanhoOriginal: file.size,
    tamanhoFinal: blob.size,
  };
}

function semExtensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(0, i) : nome;
}

/**
 * Decide o tratamento do arquivo a partir do status do documento.
 *
 * @param assinado documento com status "Assinado" — sobe intacto.
 */
export async function prepararArquivo(
  file: File,
  assinado: boolean
): Promise<ArquivoPreparado> {
  const base = semExtensao(file.name);
  const intacto: ArquivoPreparado = {
    blob: file,
    nome: file.name,
    mimeType: file.type || "application/octet-stream",
    compressao: "nenhuma",
    tamanhoOriginal: file.size,
    tamanhoFinal: file.size,
  };

  if (assinado) return intacto;

  if (TIPOS_IMAGEM.includes(file.type)) {
    try {
      const comprimido = await comprimirImagem(file, base);
      // Imagem já otimizada pode crescer ao ser recodificada.
      return comprimido.tamanhoFinal < file.size ? comprimido : intacto;
    } catch {
      return intacto;
    }
  }

  const jaComprimido = JA_COMPRIMIDOS.some((t) => file.type.startsWith(t));
  if (jaComprimido || typeof CompressionStream === "undefined") return intacto;

  try {
    const comprimido = await comprimirGzip(file, base);
    // Abaixo de 10% de ganho não compensa a descompactação no download.
    return comprimido.tamanhoFinal < file.size * 0.9 ? comprimido : intacto;
  } catch {
    return intacto;
  }
}

/** Desfaz o gzip ao baixar. Os demais modos voltam como estão. */
export async function restaurarArquivo(blob: Blob, compressao: Compressao): Promise<Blob> {
  if (compressao !== "gzip") return blob;
  const fluxo = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(fluxo).blob();
}

/**
 * Foto da câmera já reamostrada.
 *
 * A captura pede a maior resolução que o periférico oferecer — quanto mais
 * pixels na origem, mais nítido o texto depois da redução — mas o que é
 * gravado passa pelo mesmo reamostramento das demais imagens.
 */
export async function prepararFoto(blob: Blob): Promise<ArquivoPreparado> {
  const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  return comprimirImagem(blob, `foto-${carimbo}`);
}

/** Restrições que a câmera deve tentar atender, da melhor para a aceitável. */
export const RESTRICOES_CAMERA: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 4096 },
    height: { ideal: 2160 },
  },
  audio: false,
};

/**
 * Converte um texto em algo que o Storage aceite como nome de objeto.
 *
 * O Supabase Storage só aceita, no nome do objeto: letras de A a Z sem acento,
 * dígitos, espaço e a pontuação `_ - . ' , ! * & $ @ = ; : + ? ( )`. Qualquer
 * outro caractere faz o envio ser recusado.
 *
 * Em português isso derruba quase tudo. "RELATÓRIO ANUAL DE SEGURANÇA
 * CIBERNÉTICA" tem quatro caracteres proibidos, e os próprios departamentos —
 * "Contábil", "Jurídico" — quebravam o caminho antes mesmo do nome do arquivo.
 * O envio falhava com uma mensagem genérica, e o acento nunca era suspeito.
 *
 * Os acentos são removidos preservando a letra (á vira a), em vez de virarem
 * traço: o nome continua legível para quem for olhar o acervo por dentro. O
 * nome que a pessoa vê na tela e no download não passa por aqui — ele fica no
 * banco, intacto, com acentuação e tudo.
 */
export function chaveDeArmazenamento(texto: string): string {
  const limpo = texto
    // Separa a letra do acento e descarta o acento: "ç" -> "c", "ó" -> "o".
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _\-.'!*&$@=;:+?(),]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .slice(0, 120)
    .trim();

  // Um nome inteiro fora do alfabeto latino — ou só espaços — não sobra nada
  // depois da limpeza. O UUID que prefixa o caminho já garante a unicidade;
  // aqui falta apenas algo legível no lugar do vazio.
  return limpo && /[A-Za-z0-9]/.test(limpo) ? limpo : "arquivo";
}
