import { exigirPermissao } from "@/lib/permissoes";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import {
  listarDepartamentos,
  listarMembrosPorDepartamento,
} from "@/app/actions/departamentos";
import DepartamentosClient from "./DepartamentosClient";

export default async function DepartamentosPage() {
  const { profile } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "departamentos", "read");
  const [res, membros] = await Promise.all([
    listarDepartamentos(),
    listarMembrosPorDepartamento(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Departamentos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Áreas da empresa que originam documentos. Substituem a lista fixa que existia
          no código.
        </p>
      </div>

      {res.ok ? (
        <DepartamentosClient
          inicial={res.data}
          membros={membros.ok ? membros.data : {}}
          ehAdmin={profile?.role === "super_admin"}
        />
      ) : (
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {res.message}
        </p>
      )}
    </div>
  );
}
