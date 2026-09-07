import { exigirPermissao } from "@/lib/permissoes";
import { listarPedidos } from "@/app/actions/acessos";
import PedidosClient from "./PedidosClient";

export default async function PedidosDeAcessoPage() {
  await exigirPermissao("admin", "users", "create");
  const res = await listarPedidos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Pedidos de acesso</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Quem pede acesso pela tela pública aparece aqui. Aprovar cria a conta com
          uma senha provisória.
        </p>
      </div>

      {res.ok ? (
        <PedidosClient inicial={res.data} />
      ) : (
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {res.message}
        </p>
      )}
    </div>
  );
}
