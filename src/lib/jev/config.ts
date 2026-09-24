/**
 * Configuração do Jev (TypeSafe System One) — somente servidor.
 * Chave em TYPESAFE_API_KEY (sem prefixo NEXT_PUBLIC_). Sem chave,
 * tudo degrada para heurística local — nunca trava a tela nem o build.
 */

export function temChaveJev(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export function modeloJev(): string {
  return process.env.JEV_MODEL?.trim() || "jev-latest";
}
