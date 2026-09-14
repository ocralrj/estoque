import { exigirPermissao, pode } from "@/lib/permissoes";
import { getSession } from "@/lib/auth";
import FormularioTarefa from "./FormularioTarefa";

/**
 * Guarda desta tela, e origem dos dados que ela precisa.
 *
 * O formulário é um componente de cliente e não consegue checar permissão: a
 * barreira série fica aqui, no servidor — sem ela a tela abriria para qualquer
 * pessoa autenticada e só a ação por trás recusaria, depois de preenchida.
 *
 * As listas de pessoas e grupos também descem daqui, decididas pelo mesmo
 * critério do protocolo: só quem administra as tarefas atribui.
 */
export default async function Page() {
  await exigirPermissao("tarefas", "tarefas", "create");

  const podeAtribuir = await pode("tarefas", "tarefas", "manage");
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
    <FormularioTarefa
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