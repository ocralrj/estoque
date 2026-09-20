import { exigirPermissao } from "@/lib/permissoes";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import FormularioProduto, {
  type ProdutoEmEdicao,
} from "../../new/FormularioProduto";

/**
 * Guarda desta tela: a mesma do cadastro — só quem pode alterar produto entra.
 * Produto inexistente (ou fora do alcance do RLS) volta para a lista.
 */
export default async function Page({ params }: { params: { id: string } }) {
  const { supabase } = await requireSession();
  await exigirPermissao("estoque", "products", "update");

  const { data } = await supabase
    .from("products")
    .select(
      "id, code, name, description, category_id, unit, quantity_current, quantity_minimum, location, categoria:categories(name), localizacao:locations(name)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!data) redirect("/dashboard/estoque/produtos");

  const linha = data as {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category_id: string | null;
    unit: string;
    quantity_current: number;
    quantity_minimum: number;
    location: string | null;
    categoria: { name: string } | { name: string }[] | null;
    localizacao: { name: string } | { name: string }[] | null;
  };
  const nomeDe = (e: { name: string } | { name: string }[] | null) =>
    Array.isArray(e) ? (e[0]?.name ?? null) : (e?.name ?? null);

  const produto: ProdutoEmEdicao = {
    id: linha.id,
    code: linha.code,
    name: linha.name,
    description: linha.description,
    category_id: linha.category_id,
    categoria_nome: nomeDe(linha.categoria),
    unit: linha.unit,
    quantity_current: linha.quantity_current,
    quantity_minimum: linha.quantity_minimum,
    location: linha.location,
    localizacao_nome: nomeDe(linha.localizacao),
  };

  return <FormularioProduto produto={produto} />;
}
