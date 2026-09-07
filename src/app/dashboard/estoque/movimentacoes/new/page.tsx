import { exigirPermissao } from "@/lib/permissoes";
import FormularioMovimentacao from "./FormularioMovimentacao";

/**
 * Guarda desta tela.
 *
 * O formulário é um componente de cliente e não consegue checar permissão: ele
 * roda no navegador, onde qualquer checagem é sugestão. A página é de servidor
 * só para isto — barrar antes de o formulário existir. Sem ela a tela abria
 * para qualquer pessoa autenticada, e só a ação por trás recusava, depois de
 * preenchida.
 */
export default async function Page() {
  await exigirPermissao("estoque", "movements", "create");
  return <FormularioMovimentacao />;
}
