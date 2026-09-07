import { exigirPermissao, pode } from "@/lib/permissoes";
import { getSession } from "@/lib/auth";
import FormularioProtocolo from "./FormularioProtocolo";

/**
 * Guarda desta tela, e origem dos dados que ela precisa.
 *
 * O formulário é um componente de cliente e não consegue checar permissão: ele
 * roda no navegador, onde qualquer checagem é sugestão. A página é de servidor
 * para barrar antes de o formulário existir — sem ela a tela abria para
 * qualquer pessoa autenticada, e só a ação por trás recusava, depois de
 * preenchida.
 *
 * As listas de pessoas e grupos também descem daqui. Antes o formulário
 * consultava o próprio papel no navegador para decidir se mostrava o campo de
 * atribuição; quando essa consulta falhava ou demorava, o campo simplesmente
 * não aparecia, sem erro nenhum. Decidido no servidor, ou aparece ou a página
 * nem abre.
 */
export default async function Page() {
  await exigirPermissao("protocolos", "protocolos", "create");

  const podeAtribuir = await pode("protocolos", "protocolos", "manage");
  const { supabase } = await getSession();

  const [{ data: pessoas }, { data: grupos }] = podeAtribuir
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("active", true)
          .order("full_name", { nullsFirst: false }),
        supabase.from("user_groups").select("id, name, nivel").order("nivel"),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <FormularioProtocolo
      podeAtribuir={podeAtribuir}
      pessoas={(pessoas ?? []).map((p) => ({
        id: p.id as string,
        nome: (p.full_name as string | null) || (p.email as string),
      }))}
      grupos={(grupos ?? []).map((g) => ({
        id: g.id as string,
        nome: g.name as string,
      }))}
    />
  );
}
