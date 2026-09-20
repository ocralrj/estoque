import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageStock, requireSession } from "@/lib/auth";
import { pode } from "@/lib/permissoes";
import {
  CelulaCategoria,
  CelulaCodigo,
  CelulaLocalizacao,
  type CadastroSimples,
} from "./CamposEditaveis";
import AcoesProduto from "./AcoesProduto";
import PesquisaProduto from "./PesquisaProduto";

const POR_PAGINA = 50;

type Ordem = "codigo" | "categoria" | "localizacao" | "status";
type Direcao = "asc" | "desc";

const ORDENS: Ordem[] = ["codigo", "categoria", "localizacao", "status"];

type SearchParams = { [chave: string]: string | string[] | undefined };

function lerParametro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

function urlDaLista(ordem: Ordem, direcao: Direcao, pagina: number, busca: string) {
  const params = new URLSearchParams();
  params.set("ordem", ordem);
  params.set("direcao", direcao);
  if (busca) params.set("busca", busca);
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return `/dashboard/estoque/produtos${query ? `?${query}` : ""}`;
}

/** Páginas visíveis: a primeira, a última e as vizinhas da atual. */
function paginasVisiveis(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total);
  const lista: (number | "…")[] = [1];
  if (meio[0] > 2) lista.push("…");
  lista.push(...meio);
  if (meio[meio.length - 1] < total - 1) lista.push("…");
  lista.push(total);
  return lista;
}

const classeTh =
  "px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider";

function CabecalhoOrdenavel({
  rotulo,
  coluna,
  ordem,
  direcao,
  busca,
}: {
  rotulo: string;
  coluna: Ordem;
  ordem: Ordem;
  direcao: Direcao;
  busca: string;
}) {
  const ativa = ordem === coluna;
  // Primeiro clique ordena crescente; nos seguintes, alterna.
  const proxima: Direcao = ativa && direcao === "asc" ? "desc" : "asc";

  return (
    <th
      className={classeTh}
      aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={urlDaLista(coluna, proxima, 1, busca)}
        scroll={false}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text)] ${
          ativa ? "text-[var(--text)]" : ""
        }`}
      >
        {rotulo}
        <span aria-hidden="true" className={ativa ? "" : "opacity-30"}>
          {ativa ? (direcao === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

interface LinhaProduto {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  categoria_nome: string | null;
  unit: string;
  quantity_current: number;
  quantity_minimum: number;
  location: string | null;
  localizacao_nome: string | null;
  is_low_stock: boolean;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase, profile } = await requireSession();
  await exigirPermissao("estoque", "products", "read");

  const ordemParam = lerParametro(searchParams.ordem);
  // Padrão: código crescente — é o que identifica o produto no dia a dia.
  const ordem: Ordem = ORDENS.includes(ordemParam as Ordem)
    ? (ordemParam as Ordem)
    : "codigo";
  const direcao: Direcao = lerParametro(searchParams.direcao) === "desc" ? "desc" : "asc";
  const busca = (lerParametro(searchParams.busca) ?? "").trim().slice(0, 60);
  const pagina = Math.max(1, Math.floor(Number(lerParametro(searchParams.pagina))) || 1);
  const crescente = direcao === "asc";

  // Ordena e pagina no banco: a página traz só as 50 linhas dela, já na ordem
  // certa em relação a todos os produtos — não às 50 que chegaram primeiro.
  let consulta = supabase
    .from("produtos_listagem")
    .select(
      "id, code, name, category_id, categoria_nome, unit, quantity_current, quantity_minimum, location, localizacao_nome, is_low_stock",
      { count: "exact" }
    )
    .eq("active", true);

  if (busca) {
    // `%` e `_` digitados valem como letra, não como coringa.
    const termo = busca.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    consulta = consulta.ilike("name", `%${termo}%`);
  }

  switch (ordem) {
    case "codigo":
      // Numérico; códigos não numéricos ficam no fim, em ordem de texto.
      consulta = consulta
        .order("codigo_numero", { ascending: crescente, nullsFirst: false })
        .order("code", { ascending: crescente });
      break;
    case "categoria":
      consulta = consulta.order("categoria_ordem", { ascending: crescente, nullsFirst: false });
      break;
    case "localizacao":
      consulta = consulta.order("localizacao_ordem", { ascending: crescente, nullsFirst: false });
      break;
    case "status":
      // Crescente = "Estoque baixo" antes de "Normal" (alfabética e por urgência).
      consulta = consulta.order("is_low_stock", { ascending: !crescente });
      break;
  }

  // Desempate fixo: sem ele, linhas com a mesma categoria podem trocar de
  // página entre uma consulta e outra.
  const inicio = (pagina - 1) * POR_PAGINA;
  const [
    { data: productsData, count, error: erroProdutos },
    { data: categorias },
    { data: locaisData },
    { data: locaisUsadosData },
  ] = await Promise.all([
    consulta
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + POR_PAGINA - 1),
    supabase
      .from("categories")
      .select("id, name, active")
      .order("name"),
    supabase
      .from("locations")
      .select("id, name, active")
      .order("name"),
    supabase
      .from("produtos_por_local")
      .select("local, total")
      .order("total", { ascending: false }),
  ]);

  // Página além da última (lista encolheu, link antigo): volta para a primeira.
  if (erroProdutos?.code === "PGRST103" && pagina > 1) {
    redirect(urlDaLista(ordem, direcao, 1, busca));
  }
  if (erroProdutos) {
    console.error("Falha ao listar produtos:", erroProdutos);
  }

  const products = (productsData as LinhaProduto[] | null) ?? [];
  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const canManage = canManageStock(profile?.role);

  // Editar na linha exige a permissão de alterar produto — a de movimentar não
  // basta: quem dá baixa não decide onde a coisa fica guardada.
  const podeEditar = await pode("estoque", "products", "update");
  const podeExcluir = await pode("estoque", "products", "delete");
  const mostraAcoes = canManage || podeEditar || podeExcluir;

  // Quais produtos da página têm movimentação: para eles, excluir vira
  // desativar (o histórico não pode ir junto). Toda sessão autenticada lê
  // movimentações, então a contagem vale para qualquer papel.
  const idsDaPagina = products.map((p) => p.id);
  const { data: usosData } =
    idsDaPagina.length > 0
      ? await supabase.from("movements").select("product_id").in("product_id", idsDaPagina)
      : { data: [] };
  const emUsoPorProduto = new Set(
    ((usosData as { product_id: string }[] | null) ?? []).map((m) => m.product_id)
  );

  const locaisLista = ((locaisData as CadastroSimples[] | null) ?? []);

  // Quantos produtos há em cada local, contados no banco sobre todos os
  // produtos ativos — não só os desta página.
  const locaisUsados =
    (locaisUsadosData as { local: string; total: number }[] | null) ?? [];

  const formatar = (n: number) => n.toLocaleString("pt-BR");

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold text-[var(--text)]">Produtos</h1>
          <PesquisaProduto
            busca={busca}
            ordem={ordem}
            direcao={direcao}
            hrefLimpar={urlDaLista(ordem, direcao, 1, "")}
          />
        </div>
        {canManage && (
          <Link
            href="/dashboard/estoque/produtos/new"
            className="px-4 py-2 bg-[var(--primary)] text-[var(--on-accent)] rounded-lg hover:brightness-110 transition-colors"
          >
            Novo Produto
          </Link>
        )}
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm overflow-hidden">
        <div className="neo-flat overflow-x-auto">
          <table className="w-full tabela-mobile">
            <thead className="bg-[var(--neo-flat)] border-b border-[var(--neo-line)]">
              <tr>
                <CabecalhoOrdenavel rotulo="Código" coluna="codigo" ordem={ordem} direcao={direcao} busca={busca} />
                <th className={classeTh}>
                  Nome
                </th>
                <CabecalhoOrdenavel rotulo="Categoria" coluna="categoria" ordem={ordem} direcao={direcao} busca={busca} />
                <th className={classeTh}>
                  Quantidade
                </th>
                <th className={classeTh}>
                  Mínimo
                </th>
                <CabecalhoOrdenavel rotulo="Localização" coluna="localizacao" ordem={ordem} direcao={direcao} busca={busca} />
                <CabecalhoOrdenavel rotulo="Status" coluna="status" ordem={ordem} direcao={direcao} busca={busca} />
                {mostraAcoes && (
                  <th className={classeTh}>
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-[var(--neo-bg)] divide-y divide-[var(--neo-line)]">
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-[var(--neo-flat)]">
                    <td data-rotulo="Código" className="px-6 py-4 text-sm">
                      <CelulaCodigo codigo={product.code} />
                    </td>
                    <td data-rotulo="Nome" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {product.name}
                    </td>
                    <td data-rotulo="Categoria" className="px-6 py-4 text-sm">
                      <CelulaCategoria
                        produtoId={product.id}
                        categoriaId={product.category_id}
                        nome={product.categoria_nome}
                        categorias={(categorias as CadastroSimples[] | null) ?? []}
                        editavel={podeEditar}
                      />
                    </td>
                    <td data-rotulo="Quantidade" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text)]">
                      {product.quantity_current} {product.unit}
                    </td>
                    <td data-rotulo="Mínimo" className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                      {product.quantity_minimum} {product.unit}
                    </td>
                    <td data-rotulo="Localização" className="px-6 py-4 text-sm">
                      <CelulaLocalizacao
                        produtoId={product.id}
                        localId={product.location}
                        local={product.localizacao_nome}
                        locais={locaisLista}
                        locaisUsados={locaisUsados}
                        editavel={podeEditar}
                      />
                    </td>
                    <td data-rotulo="Status" className="px-6 py-4 whitespace-nowrap">
                      {product.is_low_stock ? (
                        <span className="neo-sit neo-sit--erro">Estoque baixo</span>
                      ) : (
                        <span className="neo-sit neo-sit--ok">Normal</span>
                      )}
                    </td>
                    {mostraAcoes && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <AcoesProduto
                          produtoId={product.id}
                          nome={product.name}
                          podeMovimentar={canManage}
                          podeEditar={podeEditar}
                          podeExcluir={podeExcluir}
                          emUso={emUsoPorProduto.has(product.id)}
                        />
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={mostraAcoes ? 8 : 7} className="px-6 py-4 text-center text-sm text-[var(--text-muted)]">
                    {erroProdutos ? (
                      <span className="text-[var(--erro-fg)]">
                        Não foi possível carregar os produtos: {erroProdutos.message}
                      </span>
                    ) : busca ? (
                      `Nenhum produto encontrado para “${busca}”.`
                    ) : (
                      "Nenhum produto cadastrado"
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-[var(--neo-line)] px-6 py-4 text-sm text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>
              {formatar(inicio + 1)}–{formatar(Math.min(inicio + products.length, total))} de{" "}
              {formatar(total)} {total === 1 ? "produto" : "produtos"}
            </p>

            {/* Sempre visível, mesmo com uma página: mostra onde se está e que
                a lista é paginada; Anterior/Próxima ficam desativados. */}
            <nav aria-label="Paginação de produtos" className="flex flex-wrap items-center gap-1">
              {pagina > 1 ? (
                <Link
                  href={urlDaLista(ordem, direcao, pagina - 1, busca)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--neo-flat)]"
                >
                  ‹ Anterior
                </Link>
              ) : (
                <span className="rounded-full px-3 py-1.5 text-xs font-bold opacity-50" aria-disabled="true">
                  ‹ Anterior
                </span>
              )}

              {paginasVisiveis(pagina, totalPaginas).map((p, i) =>
                p === "…" ? (
                  <span key={`reticencias-${i}`} className="px-2 text-xs">
                    …
                  </span>
                ) : p === pagina ? (
                  <span
                    key={p}
                    aria-current="page"
                    className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-[var(--on-accent)]"
                  >
                    {p}
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={urlDaLista(ordem, direcao, p, busca)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--neo-flat)]"
                  >
                    {p}
                  </Link>
                )
              )}

              {pagina < totalPaginas ? (
                <Link
                  href={urlDaLista(ordem, direcao, pagina + 1, busca)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--neo-flat)]"
                >
                  Próxima ›
                </Link>
              ) : (
                <span className="rounded-full px-3 py-1.5 text-xs font-bold opacity-50" aria-disabled="true">
                  Próxima ›
                </span>
              )}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
