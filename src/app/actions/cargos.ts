"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import type { Cargo } from "@/types/modules/admin";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function revalidar() {
  revalidatePath("/dashboard/admin/cargos");
  revalidatePath("/dashboard/admin/usuarios");
  revalidatePath("/dashboard/admin/departamentos");
}

function faltaMigracao(codigo?: string) {
  return codigo === "42P01" || codigo === "PGRST205" || codigo === "42703";
}

const AVISO_MIGRACAO =
  "A tabela de cargos ainda não existe. Execute supabase/_manual_apply/029_cargos.sql.";

export async function listarCargos(
  somenteAtivos = false
): Promise<Resultado<Cargo[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  let consulta = supabase.from("cargos").select("*").order("nome");
  if (somenteAtivos) consulta = consulta.eq("ativo", true);

  const { data, error } = await consulta;

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível carregar os cargos." };
  }
  return { ok: true, data: (data ?? []) as Cargo[] };
}

function validar(nome: string): string | null {
  const n = nome.trim();
  if (!n) return "Informe o nome do cargo.";
  if (n.length < 2) return "O nome deve ter ao menos 2 caracteres.";
  if (n.length > 60) return "O nome deve ter no máximo 60 caracteres.";
  return null;
}

export async function criarCargo(
  nome: string,
  descricao?: string
): Promise<Resultado<Cargo>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "cargos", "create");
  if (!permitido.ok) return permitido;

  const erro = validar(nome);
  if (erro) return { ok: false, message: erro };

  const { data, error } = await supabase
    .from("cargos")
    .insert({
      nome: nome.trim().slice(0, 60),
      descricao: descricao?.trim().slice(0, 300) || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe um cargo com esse nome." };
    }
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível criar o cargo." };
  }

  revalidar();
  return { ok: true, data: data as Cargo };
}

export async function atualizarCargo(
  id: string,
  nome: string,
  descricao: string | undefined,
  ativo: boolean
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "cargos", "update");
  if (!permitido.ok) return permitido;

  const erro = validar(nome);
  if (erro) return { ok: false, message: erro };

  const { error } = await supabase
    .from("cargos")
    .update({
      nome: nome.trim().slice(0, 60),
      descricao: descricao?.trim().slice(0, 300) || null,
      ativo,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe um cargo com esse nome." };
    }
    return { ok: false, message: "Não foi possível atualizar o cargo." };
  }

  revalidar();
  return { ok: true, data: undefined };
}

/**
 * Exclui o cargo.
 *
 * Quem o ocupava fica sem cargo, e não sem acesso: o vínculo é
 * `on delete set null`. Ainda assim a tela avisa quantas pessoas serão
 * afetadas antes — apagar um cargo em uso costuma ser engano, e desativar
 * resolve o caso real de "não usamos mais este cargo".
 */
export async function excluirCargo(id: string): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "cargos", "delete");
  if (!permitido.ok) return permitido;

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("cargo_id", id);

  if (count && count > 0) {
    return {
      ok: false,
      message: `${count} pessoa(s) ocupam este cargo. Desative-o em vez de excluir, para não apagar o histórico de quem o ocupava.`,
    };
  }

  const { error } = await supabase.from("cargos").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir o cargo." };

  revalidar();
  return { ok: true, data: undefined };
}

/** Define o cargo de alguém. */
export async function definirCargo(
  userId: string,
  cargoId: string | null
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;

  const { error } = await supabase
    .from("profiles")
    .update({ cargo_id: cargoId })
    .eq("id", userId);

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível definir o cargo." };
  }

  revalidar();
  return { ok: true, data: undefined };
}

/** Move a pessoa para um departamento — ou a tira dele. */
export async function definirDepartamentoDaPessoa(
  userId: string,
  departamento: string | null
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;

  const { error } = await supabase
    .from("profiles")
    .update({ departamento: departamento?.trim() || null })
    .eq("id", userId);

  if (error) {
    return { ok: false, message: "Não foi possível mover a pessoa." };
  }

  revalidar();
  return { ok: true, data: undefined };
}
