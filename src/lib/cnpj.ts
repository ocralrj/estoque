/**
 * CNPJ: normalização, máscara e dígitos verificadores.
 *
 * Desde julho de 2026 a Receita emite CNPJ alfanumérico: as doze primeiras
 * posições aceitam letras, e os dois dígitos verificadores continuam
 * numéricos. O cálculo é o mesmo módulo 11 de sempre, com cada caractere
 * valendo o código ASCII menos 48 — nos números, dá o próprio algarismo.
 * Tratar só dígitos recusaria, como inválido, um CNPJ legítimo.
 */

/** Tira pontuação e espaços; letras ficam maiúsculas. No máximo 14 posições. */
export function normalizarCnpj(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
}

/** Aplica 00.000.000/0000-00 conforme a pessoa digita. */
export function formatarCnpj(valor: string): string {
  const c = normalizarCnpj(valor);
  let saida = c.slice(0, 2);
  if (c.length > 2) saida += `.${c.slice(2, 5)}`;
  if (c.length > 5) saida += `.${c.slice(5, 8)}`;
  if (c.length > 8) saida += `/${c.slice(8, 12)}`;
  if (c.length > 12) saida += `-${c.slice(12, 14)}`;
  return saida;
}

function digitoVerificador(base: string): number {
  // Pesos de 2 a 9, da direita para a esquerda, recomeçando depois do 9.
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    const peso = ((base.length - 1 - i) % 8) + 2;
    soma += (base.charCodeAt(i) - 48) * peso;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Formato e dígitos verificadores. Aceita o valor com ou sem pontuação. */
export function cnpjValido(valor: string): boolean {
  const c = normalizarCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  // 00.000.000/0000-00 e parecidos passam no cálculo, mas não existem.
  if (/^(.)\1{13}$/.test(c)) return false;

  const primeiro = digitoVerificador(c.slice(0, 12));
  const segundo = digitoVerificador(c.slice(0, 12) + primeiro);
  return c.endsWith(`${primeiro}${segundo}`);
}
