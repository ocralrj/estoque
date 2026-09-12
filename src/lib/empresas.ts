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
