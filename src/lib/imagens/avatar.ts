/**
 * Tratamento da foto de perfil, no navegador, antes de subir.
 *
 * A foto de perfil aparece em círculos de 32 a 64 pixels — na lista de
 * usuários, no menu do topo, na equipe do departamento. Guardar o arquivo
 * original da câmera do celular para isso significa transferir alguns megabytes
 * a cada vez que a tela carrega, e pagar armazenamento por uma resolução que
 * nunca é vista.
 *
 * Aqui a imagem é recortada em quadrado pelo centro, reduzida a 256 pixels de
 * lado — o dobro do maior uso, para não borrar em telas de alta densidade — e
 * recodificada. O resultado costuma ficar entre 15 e 40 kB, contra os 2 a 8 MB
 * de uma foto de celular.
 *
 * O recorte é pelo centro porque é onde o rosto está na esmagadora maioria dos
 * retratos; deixar a imagem inteira espremida num quadrado distorceria todas.
 */

/** Lado do quadrado gravado, em pixels. */
export const LADO_AVATAR = 256;

/** Teto do arquivo aceito na entrada, antes do tratamento. */
export const MAX_ENTRADA_BYTES = 10 * 1024 * 1024;

/**
 * Teto do arquivo gravado. O tratamento entrega muito menos que isto; o limite
 * existe para o servidor ter o que recusar quando o envio não passa por aqui.
 */
export const MAX_SAIDA_BYTES = 512 * 1024;

export interface AvatarPreparado {
  blob: Blob;
  mimeType: string;
  extensao: string;
  tamanhoOriginal: number;
  tamanhoFinal: number;
}

/** Tamanho legível, para a pessoa ver o que o tratamento economizou. */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function prepararAvatar(origem: Blob): Promise<AvatarPreparado> {
  if (origem.size > MAX_ENTRADA_BYTES) {
    throw new Error("A imagem é grande demais. Escolha uma de até 10 MB.");
  }
  if (!origem.type.startsWith("image/")) {
    throw new Error("O arquivo escolhido não é uma imagem.");
  }

  const bitmap = await createImageBitmap(origem);

  // Recorte quadrado pelo centro.
  const lado = Math.min(bitmap.width, bitmap.height);
  const origemX = (bitmap.width - lado) / 2;
  const origemY = (bitmap.height - lado) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = LADO_AVATAR;
  canvas.height = LADO_AVATAR;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível processar a imagem neste navegador.");
  }

  ctx.imageSmoothingQuality = "high";
  // Fundo branco: um PNG com transparência viraria preto ao virar JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LADO_AVATAR, LADO_AVATAR);
  ctx.drawImage(bitmap, origemX, origemY, lado, lado, 0, 0, LADO_AVATAR, LADO_AVATAR);
  bitmap.close();

  // WebP rende cerca de 30% a menos que JPEG na mesma qualidade aparente.
  // Navegador que não o produza devolve PNG no lugar, e aí o JPEG é melhor.
  const blob = await paraBlob(canvas, "image/webp", 0.82);
  if (blob && blob.type === "image/webp") {
    return descrever(blob, "webp", origem.size);
  }

  const jpeg = await paraBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("Não foi possível compactar a imagem.");
  return descrever(jpeg, "jpg", origem.size);
}

function descrever(blob: Blob, extensao: string, tamanhoOriginal: number): AvatarPreparado {
  return {
    blob,
    mimeType: blob.type,
    extensao,
    tamanhoOriginal,
    tamanhoFinal: blob.size,
  };
}

function paraBlob(
  canvas: HTMLCanvasElement,
  tipo: string,
  qualidade: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/** Data URL para atravessar uma Server Action, que não recebe Blob solto. */
export function paraDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(blob);
  });
}
