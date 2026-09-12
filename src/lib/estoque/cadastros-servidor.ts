import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import {
  CADASTROS,
  LIMITE_DESCRICAO,
  LIMITE_NOME,
  chaveDoNome,
  limparNome,
  type DadosDoCadastro,
  type ProdutoVinculado,
  type RegistroDeCadastro,
  type Resultado,
  type TipoDeCadastro,
} from "@/lib/estoque/cadastros";

/**
 * Regras dos cadastros de categoria e localização, do lado do servidor.
 *
 * Só é chamado pelas Server Actions de `categorias.ts` e `localizacoes.ts`,
 * que fixam o tipo. O tipo nunca vem do navegador: ele escolhe a tabela.
 */

const AVISO_MIGRACAO =
  "O cadastro ainda não tem a coluna de status. Execute supabase/_manual_apply/043_categorias_e_localizacoes.sql.";

function faltaMigracao(codigo?: string) {
  return codigo === "42703" || codigo === "42P01" || codigo === "PGRST204" || codigo === "PGRST205";
}

function revalidar(tipo: TipoDeCadastro) {
  revalidatePath(CADASTROS[tipo].caminho);
  revalidatePath("/dashboard/estoque/produtos");
  revalidatePath("/dashboard/estoque/produtos/new");
  revalidatePath("/dashboard/estoque/alertas");
}

function validar(dados: DadosDoCadastro): string | null {
  const nome = limparNome(dados.nome ?? "");
  if (!nome) return "Informe o nome.";
  if (nome.length < 2) return "O nome deve ter ao menos 2 caracteres.";
  if (nome.length > LIMITE_NOME) return `O nome deve ter no máximo ${LIMITE_NOME} caracteres.`;
  if ((dados.descricao ?? "").trim().length > LIMITE_DESCRICAO) {
    return `A descrição deve ter no máximo ${LIMITE_DESCRICAO} caracteres.`;
  }
  return null;
}

/** O registro que já usa este nome, comparando sem acento e sem caixa. */
async function nomeEmUso(
  tipo: TipoDeCadastro,
  nome: string,
  ignorarId?: string
): Promise<Resultado<string | null>> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.from(CADASTROS[tipo].tabela).select("id, name");

  if (error) {
    console.error(`Falha ao conferir nome de ${CADASTROS[tipo].singular}:`, error);
    return { ok: false, message: `Não foi possível conferir o nome: ${error.message}` };
  }

  const chave = chaveDoNome(nome);
  const igual = (data ?? []).find(
    (r) => r.id !== ignorarId && chaveDoNome(r.name as string) === chave
  );
  return { ok: true, data: igual ? (igual.name as string) : null };
}

/** Registros do cadastro. `somenteAtivos` é o que as telas de produto usam. */
export async function listar(
  tipo: TipoDeCadastro,
  somenteAtivos = false
): Promise<Resultado<Omit<RegistroDeCadastro, "produtos">[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  let consulta = supabase
    .from(CADASTROS[tipo].tabela)
    .select("id, name, description, active, created_at")
    .order("name");
  if (somenteAtivos) consulta = consulta.eq("active", true);

  const { data, error } = await consulta;
  if (error) {
    console.error(`Falha ao listar ${CADASTROS[tipo].plural}:`, error);
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: `Não foi possível carregar: ${error.message}` };
  }
  return { ok: true, data: (data ?? []) as Omit<RegistroDeCadastro, "produtos">[] };
}

/** Registros com os produtos que os usam — para a tela do cadastro. */
export async function listarComUso(
  tipo: TipoDeCadastro
): Promise<Resultado<RegistroDeCadastro[]>> {
  const res = await listar(tipo);
  if (!res.ok) return res;

  const cfg = CADASTROS[tipo];
  const { supabase } = await getSession();
  const { data, error } = await supabase
    .from("products")
    .select(`id, code, name, ${cfg.colunaNoProduto}`)
    .not(cfg.colunaNoProduto, "is", null)
    .order("name");

  if (error) {
    console.error(`Falha ao contar produtos por ${cfg.singular}:`, error);
    return { ok: false, message: `Não foi possível carregar os produtos vinculados: ${error.message}` };
  }

  const porRegistro = new Map<string, ProdutoVinculado[]>();
  for (const p of (data ?? []) as unknown as Record<string, string>[]) {
    const id = p[cfg.colunaNoProduto];
    const lista = porRegistro.get(id) ?? [];
    lista.push({ id: p.id, code: p.code, name: p.name });
    porRegistro.set(id, lista);
  }

  return {
    ok: true,
    data: res.data.map((r) => ({ ...r, produtos: porRegistro.get(r.id) ?? [] })),
  };
}

export async function criar(
  tipo: TipoDeCadastro,
  dados: DadosDoCadastro
): Promise<Resultado<{ id: string; nome: string }>> {
  const cfg = CADASTROS[tipo];
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", cfg.recurso, "create");
  if (!permitido.ok) return permitido;

  const erro = validar(dados);
  if (erro) return { ok: false, message: erro };

  const nome = limparNome(dados.nome);
  const repetido = await nomeEmUso(tipo, nome);
  if (!repetido.ok) return repetido;
  if (repetido.data) {
    return { ok: false, message: `Já existe a ${cfg.singular} "${repetido.data}".` };
  }

  const { data, error } = await supabase
    .from(cfg.tabela)
    .insert({
      name: nome,
      description: dados.descricao?.trim() || null,
      active: dados.ativo,
    })
    .select("id, name")
    .single();

  if (error) {
    console.error(`Falha ao criar ${cfg.singular}:`, error);
    if (error.code === "23505") {
      return { ok: false, message: `Já existe uma ${cfg.singular} com esse nome.` };
    }
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: `Não foi possível criar: ${error.message}` };
  }

  revalidar(tipo);
  return { ok: true, data: { id: data.id as string, nome: data.name as string } };
}

export async function atualizar(
  tipo: TipoDeCadastro,
  id: string,
  dados: DadosDoCadastro
): Promise<Resultado> {
  const cfg = CADASTROS[tipo];
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", cfg.recurso, "update");
  if (!permitido.ok) return permitido;

  const erro = validar(dados);
  if (erro) return { ok: false, message: erro };

  const nome = limparNome(dados.nome);
  const repetido = await nomeEmUso(tipo, nome, id);
  if (!repetido.ok) return repetido;
  if (repetido.data) {
    return { ok: false, message: `Já existe a ${cfg.singular} "${repetido.data}".` };
  }

  const { data, error } = await supabase
    .from(cfg.tabela)
    .update({
      name: nome,
      description: dados.descricao?.trim() || null,
      active: dados.ativo,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error(`Falha ao atualizar ${cfg.singular}:`, error);
    if (error.code === "23505") {
      return { ok: false, message: `Já existe uma ${cfg.singular} com esse nome.` };
    }
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }

  // Sem erro e sem linha: o RLS barrou, ou o registro já não existe.
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: `A ${cfg.singular} não foi alterada: ela não existe mais ou você não tem permissão.`,
    };
  }

  revalidar(tipo);
  return { ok: true, data: undefined };
}

/** Só o status — o "Desativar" oferecido quando a exclusão é recusada. */
export async function definirStatus(
  tipo: TipoDeCadastro,
  id: string,
  ativo: boolean
): Promise<Resultado> {
  const cfg = CADASTROS[tipo];
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", cfg.recurso, "update");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase
    .from(cfg.tabela)
    .update({ active: ativo })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error(`Falha ao mudar status de ${cfg.singular}:`, error);
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: `A ${cfg.singular} não foi alterada: ela não existe mais ou você não tem permissão.`,
    };
  }

  revalidar(tipo);
  return { ok: true, data: undefined };
}

/**
 * Exclui — mas só o que nenhum produto usa.
 *
 * A contagem aqui dá a mensagem clara. Ela enxerga apenas os produtos que o
 * RLS mostra à sessão; a chave estrangeira em `restrict` (migração 043) é o
 * que garante que um produto inativo, invisível para quem exclui, também
 * segure o registro.
 */
export async function excluir(tipo: TipoDeCadastro, id: string): Promise<Resultado> {
  const cfg = CADASTROS[tipo];
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("estoque", cfg.recurso, "delete");
  if (!permitido.ok) return permitido;

  const { count, error: erroContagem } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq(cfg.colunaNoProduto, id);

  if (erroContagem) {
    console.error(`Falha ao conferir uso de ${cfg.singular}:`, erroContagem);
    return { ok: false, message: `Não foi possível conferir o uso: ${erroContagem.message}` };
  }

  const emUso = `Esta ${cfg.singular} está vinculada a um ou mais produtos e não pode ser excluída. Desative-a para tirá-la das novas escolhas sem mexer nos produtos que já a usam.`;

  if (count && count > 0) return { ok: false, message: emUso };

  const { data, error } = await supabase.from(cfg.tabela).delete().eq("id", id).select("id");

  if (error) {
    if (error.code === "23503") return { ok: false, message: emUso };
    console.error(`Falha ao excluir ${cfg.singular}:`, error);
    return { ok: false, message: `Não foi possível excluir: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: `A ${cfg.singular} não foi excluída: ela não existe mais ou você não tem permissão.`,
    };
  }

  revalidar(tipo);
  return { ok: true, data: undefined };
}
