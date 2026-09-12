import Link from "next/link";
import { exigirPermissao, pode } from "@/lib/permissoes";
import { getSession } from "@/lib/auth";
import { listarEmpresas } from "@/app/actions/certificados";
import EmpresasClient, { type PessoaSimples } from "./EmpresasClient";

// A procura do site e a leitura de logo e cores buscam várias páginas de
// terceiros; o padrão de 10 segundos da Vercel não basta no pior caso.
export const maxDuration = 30;

export default async function EmpresasPage() {
  await exigirPermissao("certificados", "certificates", "read");

  const [empresas, podeAdministrar] = await Promise.all([
    listarEmpresas(),
    pode("certificados", "certificates", "manage"),
  ]);

  const { supabase } = await getSession();

  const [{ data: pessoas }, { data: acessos }, { data: certificados }, { data: grupos }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, group_id, cargo:cargos(nome)")
        .eq("active", true)
        .order("full_name", { nullsFirst: false }),
      supabase.from("empresa_acessos").select("empresa_id, user_id"),
      supabase.from("certificados").select("empresa_id"),
      // Quais grupos administram todos os certificados: quem está neles não
      // precisa ser marcado empresa por empresa, e mostrar isso evita que
      // alguém tente marcá-los sem entender por que já aparecem.
      supabase
        .from("group_permissions")
        .select("group_id, permission:permissions!inner(module, resource, action)")
        .eq("permission.module", "certificados")
        .eq("permission.resource", "certificates")
        .eq("permission.action", "manage"),
    ]);

  const gruposComTudo = new Set(
    (grupos ?? []).map((g) => g.group_id as string)
  );

  const listaDePessoas: PessoaSimples[] = (pessoas ?? []).map((p) => ({
    id: p.id as string,
    nome: (p.full_name as string | null) || (p.email as string),
    email: p.email as string,
    avatar_url: (p.avatar_url as string | null) ?? null,
    cargo: ((p.cargo as { nome?: string } | null)?.nome as string | undefined) ?? null,
    vetodas: p.group_id ? gruposComTudo.has(p.group_id as string) : false,
  }));

  const acessosPorEmpresa: Record<string, string[]> = {};
  for (const a of acessos ?? []) {
    const id = a.empresa_id as string;
    (acessosPorEmpresa[id] ??= []).push(a.user_id as string);
  }

  const certificadosPorEmpresa: Record<string, number> = {};
  for (const c of certificados ?? []) {
    const id = c.empresa_id as string;
    certificadosPorEmpresa[id] = (certificadosPorEmpresa[id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Empresas e quem cuida delas
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Marcar alguém aqui abre os certificados daquela empresa para ela. Quem
            responde pelo assunto inteiro recebe &quot;Administrar&quot; no grupo e
            alcança todas.
          </p>
        </div>
        <Link
          href="/dashboard/certificados"
          className="neo-button rounded-full px-4 py-2 text-sm font-bold text-[var(--text)]"
        >
          Ver certificados
        </Link>
      </div>

      {empresas.ok ? (
        <EmpresasClient
          empresas={empresas.data}
          pessoas={listaDePessoas}
          acessosPorEmpresa={acessosPorEmpresa}
          certificadosPorEmpresa={certificadosPorEmpresa}
          podeAdministrar={podeAdministrar}
        />
      ) : (
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {empresas.message}
        </p>
      )}
    </div>
  );
}
