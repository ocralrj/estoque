import mammoth from "mammoth";

/** Extrai texto de arquivos .docx usando mammoth (navegador). */
export async function extrairTextoDeDocx(
  blob: Blob
): Promise<{ ok: true; texto: string } | { ok: false; message: string }> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const resultado = await mammoth.extractRawText({ arrayBuffer });
    const texto = resultado.value.trim();
    if (!texto) {
      return { ok: false, message: "O arquivo .docx parece estar em branco." };
    }
    return { ok: true, texto };
  } catch {
    return {
      ok: false,
      message: "Não foi possível extrair o texto do .docx.",
    };
  }
}

/** Lê o conteúdo de um arquivo .txt. */
export async function extrairTextoDeTxt(
  blob: Blob
): Promise<{ ok: true; texto: string } | { ok: false; message: string }> {
  try {
    const texto = await blob.text();
    if (!texto.trim()) {
      return { ok: false, message: "O arquivo .txt está em branco." };
    }
    return { ok: true, texto };
  } catch {
    return {
      ok: false,
      message: "Não foi possível ler o conteúdo do .txt.",
    };
  }
}