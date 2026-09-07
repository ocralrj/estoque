/**
 * Regra de senha do sistema, num lugar só.
 *
 * A validação no navegador é conveniência: mostra ao usuário o que falta antes
 * de ele enviar. A garantia real está na política de senha do Supabase, que é
 * quem recusa uma senha fraca de fato — o cliente pode ser contornado.
 */

export interface RegraSenha {
  id: string;
  texto: string;
  testa: (s: string) => boolean;
}

export const TAMANHO_MINIMO = 8;

/**
 * Senha entregue a quem é pré-cadastrado por outra pessoa.
 *
 * Vive aqui, e não na Server Action, porque um arquivo "use server" só pode
 * exportar funções async — e porque a tela precisa exibi-la a quem cadastra.
 * Vale uma única entrada: `must_change_password` obriga a troca em seguida.
 */
export const SENHA_INICIAL = "Mudar@123";

export const REGRAS_SENHA: RegraSenha[] = [
  {
    id: "tamanho",
    texto: `Pelo menos ${TAMANHO_MINIMO} caracteres`,
    testa: (s) => s.length >= TAMANHO_MINIMO,
  },
  {
    id: "maiuscula",
    texto: "Uma letra maiúscula",
    testa: (s) => /[A-ZÀ-Þ]/.test(s),
  },
  {
    id: "minuscula",
    texto: "Uma letra minúscula",
    testa: (s) => /[a-zß-ÿ]/.test(s),
  },
  {
    id: "numero",
    texto: "Um número",
    testa: (s) => /\d/.test(s),
  },
  {
    id: "especial",
    texto: "Um caractere especial (!@#$%&*…)",
    testa: (s) => /[^\w\sÀ-ÿ]/.test(s),
  },
];

export function avaliarSenha(senha: string): {
  valida: boolean;
  faltando: string[];
} {
  const faltando = REGRAS_SENHA.filter((r) => !r.testa(senha)).map((r) => r.texto);
  return { valida: faltando.length === 0, faltando };
}
