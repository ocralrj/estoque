import { exigirPermissao } from "@/lib/permissoes";
import Link from "next/link";
import { MANAGER_ROLES, requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import {
  ACOES,
  MODULOS,
  SENSIVEIS,
  descrever,
  idsParaResolver,
  rotuloDePermissao,
  type Registro,
} from "./descricao";

interface SearchParams {
  modulo?: string;
  acao?: string;
  usuario?: string;
  desde?: string;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase } = await requireSession(MANAGER_ROLES);
  await exigirPermissao("admin", "audit", "read");

  let query = supabase
    .from("audit_logs")
    .select("*, user:profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (searchParams.modulo) query = query.eq("module", searchParams.modulo);
  if (searchParams.acao) query = query.eq("action", searchParams.acao);
  if (searchParams.usuario) query = query.eq("user_id", searchParams.usuario);
  if (searchParams.desde) query = query.gte("created_at", searchParams.desde);

  const { data: registros, error } = await query.returns<Registro[]>();

  // A trilha guarda produto, grupo e permissão pelo id. Os nomes vêm numa
  // consulta por tabela, e não uma por linha: são até 200 registros por tela.
  const ids = idsParaResolver(registros ?? []);
  const vazio = Promise.resolve({ data: [] as never[] });

  const [{ data: usuarios }, { data: facetas }, { data: produtos }, { data: grupos }, { data: permissoes }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("audit_logs").select("module, action").limit(1000),
      ids.produtos.length
        ? supabase.from("products").select("id, name, code").in("id", ids.produtos)
        : vazio,
      ids.grupos.length
        ? supabase.from("user_groups").select("id, name").in("id", ids.grupos)
        : vazio,
      ids.permissoes.length
        ? supabase.from("permissions").select("id, module, resource, action, description").in("id", ids.permissoes)
        : vazio,
    ]);

  const referencias = {
    produtos: new Map(
      (produtos ?? []).map((p) => [p.id as string, p.code ? `${p.name} (código ${p.code})` : (p.name as string)])
    ),
    grupos: new Map((grupos ?? []).map((g) => [g.id as string, g.name as string])),
    permissoes: new Map(
      (permissoes ?? []).map((p) => [
        p.id as string,
        rotuloDePermissao(p as { module: string; resource: string; action: string; description: string | null }),
      ])
    ),
    pessoas: new Map(
      (usuarios ?? []).map((u) => [u.id as string, ((u.full_name as string) || (u.email as string))])
    ),
  };

  const modulos = Array.from(new Set((facetas ?? []).map((f) => f.module))).sort();
  const acoes = Array.from(new Set((facetas ?? []).map((f) => f.action))).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Auditoria</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Quem fez o quê no sistema. Os registros vêm de gatilhos no banco e não
            podem ser alterados nem apagados pela aplicação.
          </p>
        </div>
        <Link
          href="/dashboard/admin/usuarios"
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--neo-line)] bg-[var(--neo-bg)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
        >
          Usuários
        </Link>
      </div>

      <section className="neo-card p-5">
        <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Filtro
            id="modulo"
            label="Módulo"
            valor={searchParams.modulo}
            opcoes={modulos}
            rotulos={MODULOS}
          />
          <Filtro
            id="acao"
            label="Ação"
            valor={searchParams.acao}
            opcoes={acoes}
            rotulos={ACOES}
          />
          <div>
            <label htmlFor="usuario" className={rotuloCampo}>
              Quem fez
            </label>
            <select
              id="usuario"
              name="usuario"
              defaultValue={searchParams.usuario ?? ""}
              className={campo}
            >
              <option value="">Todos</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id as string} value={u.id as string}>
                  {(u.full_name as string) || (u.email as string)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="desde" className={rotuloCampo}>
              A partir de
            </label>
            <input
              id="desde"
              type="date"
              name="desde"
              defaultValue={searchParams.desde ?? ""}
              className={campo}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              Filtrar
            </button>
            <Link
              href="/dashboard/admin/auditoria"
              className="rounded-full border border-[var(--neo-line)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)]"
            >
              Limpar
            </Link>
          </div>
        </form>
      </section>

      {error ? (
        <p className="neo-card p-8 text-center text-sm text-[var(--erro-fg)]">
          Não foi possível ler a auditoria. Se a tabela ainda não existe, execute
          supabase/schema_auditoria.sql e depois _manual_apply/010_seguranca_admin.sql.
        </p>
      ) : registros && registros.length > 0 ? (
        <section className="neo-card overflow-hidden">
          <div className="neo-flat overflow-x-auto">
            <table className="min-w-full text-left tabela-mobile">
              <thead className="bg-[var(--neo-flat-alt)] text-[var(--text-muted)]">
                <tr>
                  <th className={cabecalho}>Quando</th>
                  <th className={cabecalho}>Quem</th>
                  <th className={cabecalho}>O que fez</th>
                  <th className={cabecalho}>Módulo</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--neo-line)]">
                    <td data-rotulo="Quando" className="whitespace-nowrap px-4 py-3 text-sm text-[var(--text-muted)]">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td data-rotulo="Quem" className="px-4 py-3 text-sm text-[var(--text)]">
                      {r.user?.full_name || r.user?.email || "Sistema"}
                    </td>
                    <td data-rotulo="O que fez" className="px-4 py-3 text-sm text-[var(--text)]">
                      <span
                        className={
                          SENSIVEIS.has(r.action)
                            ? "neo-sit neo-sit--aviso"
                            : "neo-sit neo-sit--info"
                        }
                      >
                        {descrever(r, referencias)}
                      </span>
                    </td>
                    <td data-rotulo="Módulo" className="px-4 py-3 text-sm text-[var(--text-muted)]">
                      {MODULOS[r.module] ?? r.module}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="neo-card p-10 text-center">
          <p className="font-semibold text-[var(--text)]">Nenhum registro encontrado</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-muted)]">
            Se você já alterou papéis ou grupos e mesmo assim não há nada aqui, os
            gatilhos do banco provavelmente não foram criados — execute
            supabase/_manual_apply/010_seguranca_admin.sql.
          </p>
        </div>
      )}

      {registros && registros.length === 200 && (
        <p className="text-xs text-[var(--text-muted)]">
          Mostrando os 200 eventos mais recentes. Use os filtros para estreitar o
          período.
        </p>
      )}
    </div>
  );
}

function Filtro({
  id,
  label,
  valor,
  opcoes,
  rotulos,
}: {
  id: string;
  label: string;
  valor?: string;
  opcoes: string[];
  rotulos?: Record<string, string>;
}) {
  return (
    <div>
      <label htmlFor={id} className={rotuloCampo}>
        {label}
      </label>
      <select id={id} name={id} defaultValue={valor ?? ""} className={campo}>
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {rotulos?.[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

const campo =
  "mt-2 w-full rounded-[1rem] border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotuloCampo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]";
const cabecalho = "px-4 py-3 text-xs font-bold uppercase tracking-[0.12em]";
