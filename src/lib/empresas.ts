/**
 * Utilitários do cadastro de empresas, usados na tela e no servidor.
 */

/** Só os algarismos, no máximo `limite` deles. */
export function soDigitos(valor: string, limite: number): string {
  return valor.replace(/\D/g, "").slice(0, limite);
}

/** 00000-000 conforme a pessoa digita. */
export function formatarCep(valor: string): string {
  const d = soDigitos(valor, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** (00) 0000-0000 ou (00) 00000-0000 conforme a pessoa digita. */
export function formatarTelefone(valor: string): string {
  const d = soDigitos(valor, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = `(${d.slice(0, 2)}) `;
  const resto = d.slice(2);
  if (resto.length <= 4) return ddd + resto;
  const corte = resto.length === 9 ? 5 : 4;
  return `${ddd}${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/**
 * Domínio do site, do jeito que é gravado: sem protocolo, "www.", caminho nem
 * porta, em minúsculas e com acento convertido (punycode). "https://www.Icard
 * Case.com.br/contato" vira "icardcase.com.br". Devolve "" quando não dá para
 * extrair um domínio.
 */
export function normalizarSite(valor: string): string {
  const bruto = valor.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#\s]/)[0];
  if (!bruto) return "";
  try {
    return new URL(`https://${bruto}`).hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

/** Mesma regra da restrição empresas_site_formato (046). */
export function siteValido(site: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}|xn--[a-z0-9-]{1,59})$/.test(site);
}

/** #rrggbb em minúsculas, ou "" quando o valor não é uma cor nesse formato. */
export function normalizarCor(valor: string | null | undefined): string {
  const v = valor?.trim().toLowerCase() ?? "";
  return /^#[0-9a-f]{6}$/.test(v) ? v : "";
}

/**
 * Cor de texto legível sobre um fundo: preto ou branco, pelo contraste da
 * WCAG. Serve às iniciais pintadas com a cor da empresa.
 */
export function textoSobre(cor: string): "#000000" | "#ffffff" {
  const canal = (i: number) => {
    const c = parseInt(cor.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

// Sufixos jurídicos não distinguem uma empresa de outra: "ABC Máquinas" e
// "ABC MAQUINAS LTDA - ME" são, para quem cadastra, a mesma.
const SUFIXOS = new Set([
  "LTDA", "ME", "EPP", "EIRELI", "SA", "S", "A", "MEI", "SS", "CIA", "E", "DE", "DA", "DO", "DOS", "DAS",
]);

/**
 * Nome reduzido ao que identifica: sem acento, pontuação, caixa e sufixos
 * jurídicos. Serve para apontar possível duplicidade, nunca para decidir
 * sozinho que duas empresas são a mesma.
 */
export function nomeComparavel(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^0-9A-Z]+/g, " ")
    .split(" ")
    .filter((p) => p && !SUFIXOS.has(p))
    .join(" ");
}
