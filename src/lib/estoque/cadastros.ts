/**
 * Categorias e localizações: os dois cadastros de apoio do Estoque.
 *
 * Têm a mesma forma — nome, descrição, status — e as mesmas regras: nome sem
 * repetição, inativo some das novas escolhas, em uso não se exclui. Por isso
 * uma definição só, e as diferenças (tabela, coluna em `products`, textos)
 * ficam aqui. Este arquivo não importa nada de servidor: a tela também o usa.
 */

export type TipoDeCadastro = "categoria" | "localizacao";

export type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export interface ProdutoVinculado {
  id: string;
  code: string;
  name: string;
}

export interface RegistroDeCadastro {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  /** Produtos que apontam para este registro, visíveis para a sessão. */
  produtos: ProdutoVinculado[];
}

export interface DadosDoCadastro {
  nome: string;
  descricao?: string;
  ativo: boolean;
}

export const CADASTROS = {
  categoria: {
    tabela: "categories",
    recurso: "categories",
    colunaNoProduto: "category_id",
    caminho: "/dashboard/estoque/categorias",
    singular: "categoria",
    plural: "categorias",
    titulo: "Categorias",
    exemplo: "Ex.: Material de escritório",
    exemploDescricao: "O que entra nesta categoria",
  },
  localizacao: {
    tabela: "locations",
    recurso: "locations",
    colunaNoProduto: "location",
    caminho: "/dashboard/estoque/localizacoes",
    singular: "localização",
    plural: "localizações",
    titulo: "Localizações",
    exemplo: "Ex.: Almoxarifado central — prateleira 3",
    exemploDescricao: "Como chegar lá, ou o que se guarda ali",
  },
} as const;

export const LIMITE_NOME = 80;
export const LIMITE_DESCRICAO = 300;

/** Espaços sobrando fora, e um só entre as palavras — como o banco guarda. */
export function limparNome(nome: string) {
  return nome.trim().replace(/\s+/g, " ");
}

/**
 * Chave de comparação: sem acento, sem caixa, sem espaço dobrado.
 *
 * O banco já recusa nome repetido sem diferenciar maiúsculas; o acento ele não
 * enxerga. "Escritório" e "Escritorio" viram duas linhas no relatório do mesmo
 * jeito, e é aqui que a repetição é barrada.
 */
export function chaveDoNome(nome: string) {
  return limparNome(nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
