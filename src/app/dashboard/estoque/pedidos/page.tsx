import { exigirPermissao, pode } from "@/lib/permissoes";
import { getSession } from "@/lib/auth";
import { listarPedidos } from "@/app/actions/pedidos";
import PedidosClient from "./PedidosClient";

export default async function PedidosDeMaterialPage() {
  await exigirPermissao("estoque", "requisicoes", "read");

  const [pedidos, podeAtender, podePedir] = await Promise.all([
    listarPedidos(),
    pode("estoque", "requisicoes", "manage"),
    pode("estoque", "requisicoes", "create"),
  ]);

  const { supabase, user } = await getSession();
  const { data: produtos } = await supabase
    .from("products")
    .select("id, name, code, unit, quantity_current")
    .eq("active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Pedidos de material</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Quem precisa pede; quem cuida do almoxarifado entrega. A baixa no estoque
          acontece na entrega, com a quantidade que saiu de verdade.
        </p>
      </div>

      {pedidos.ok ? (
        <PedidosClient
          pedidos={pedidos.data}
          produtos={(produtos ?? []) as never}
          meuId={user?.id ?? ""}
          podeAtender={podeAtender}
          podePedir={podePedir}
        />
      ) : (
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {pedidos.message}
        </p>
      )}
    </div>
  );
}
