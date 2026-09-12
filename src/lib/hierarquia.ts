import { nivelDoPapel } from "@/lib/atribuicoes";

/**
 * Quem pode alterar o cadastro de quem.
 *
 *   SE quem edita é Administração ou Diretoria  -> altera qualquer cadastro
 *   SENÃO SE o alvo é ele mesmo                 -> segue as regras já existentes
 *   SENÃO SE mesmo departamento E nível superior -> altera
 *   SENÃO                                        -> bloqueia
 *
 * A mesma regra existe em `pode_editar_cadastro()` no banco (migração 039).
 * Duplicada de propósito, e não por descuido: a do banco é a que vale contra
 * uma chamada direta ao PostgREST, e esta é a que permite à tela esconder o
 * botão e à Server Action devolver uma mensagem em português em vez de um erro
 * de gatilho. As duas precisam dizer a mesma coisa, e por isso estão escritas
 * com os mesmos nomes e na mesma ordem.
 */

/** O lado mínimo de um perfil que a comparação de hierarquia precisa conhecer. */
export interface LadoDaComparacao {
  id: string;
  role?: string | null;
  departamento?: string | null;
  /** Nível da função, quando ela já existe. */
  nivel?: number | null;
}

/**
 * Nível hierárquico efetivo: a função, se houver; senão o equivalente ao papel.
 *
 * Nunca devolve nulo. Hierarquia indefinida vira a base da escala, e não uma
 * comparação que não acontece — uma comparação que não acontece falha aberta.
 */
export function nivelEfetivo(lado: LadoDaComparacao): number {
  return typeof lado.nivel === "number" ? lado.nivel : nivelDoPapel(lado.role);
}

/** Administração e Diretoria: as funções que herdam super_admin ou gestor. */
export function ehIrrestrito(role?: string | null): boolean {
  return role === "super_admin" || role === "gestor";
}

function mesmoDepartamento(a?: string | null, b?: string | null): boolean {
  // Sem departamento dos dois lados não é "o mesmo departamento": seria
  // transformar o vazio num departamento onde todo mundo edita todo mundo.
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y;
}

export function podeEditarCadastro(
  editor: LadoDaComparacao,
  alvo: LadoDaComparacao
): boolean {
  if (editor.id === alvo.id) return true;
  if (ehIrrestrito(editor.role)) return true;
  if (!mesmoDepartamento(editor.departamento, alvo.departamento)) return false;
  // Menor = mais alto. Estritamente menor: dois iguais não se editam.
  return nivelEfetivo(editor) < nivelEfetivo(alvo);
}

/** Por que não pôde — em português, para a tela e para a Server Action. */
export function motivoDoBloqueio(
  editor: LadoDaComparacao,
  alvo: LadoDaComparacao
): string | null {
  if (podeEditarCadastro(editor, alvo)) return null;
  if (!mesmoDepartamento(editor.departamento, alvo.departamento)) {
    return "Acesso não autorizado: esta pessoa é de outro departamento.";
  }
  return "Acesso não autorizado: você só altera o cadastro de quem tem função inferior à sua.";
}
