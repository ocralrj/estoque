"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import { papelDoNivel } from "@/lib/atribuicoes";
import { bloqueioDeEdicao } from "@/lib/hierarquia-servidor";
import type { Funcao } from "@/types/modules/admin";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function revalidar() {
  revalidatePath("/dashboard/admin/usuarios");
  revalidatePath("/dashboard/admin/grupos");
}

function faltaMigracao(codigo?: string) {
  return codigo === "42P01" || codigo === "PGRST205" || codigo === "42703";
}

const AVISO_MIGRACAO =
  "A tabela de funções ainda não existe. Execute supabase/_manual_apply/037_funcoes.sql.";

export async function listarFuncoes(
  somenteAtivas = false
): Promise<Resultado<Funcao[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  let consulta = supabase.from("funcoes").select("*").order("nivel");
  if (somenteAtivas) consulta = consulta.eq("ativo", true);

  const { data, error } = await consulta;

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível carregar as funções." };
  }
  return { ok: true, data: (data ?? []) as Funcao[] };
}

function validar(nome: string, nivel: number): string | null {
  const n = nome.trim();
  if (!n) return "Informe o nome da função.";
  if (n.length < 2) return "O nome deve ter ao menos 2 caracteres.";
  if (n.length > 60) return "O nome deve ter no máximo 60 caracteres.";
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 99) {
    return "O nível hierárquico vai de 1 (mais alto) a 99 (mais baixo).";
  }
  return null;
}

/**
 * Ninguém cria uma função acima de si mesmo.
 *
 * Sem esta trava, um gestor cadastraria a função "Diretoria" no nível 10, se
 * atribuiria a ela e viraria super admin pela tela de cadastro — o caminho
 * lateral que a migração 014 já fechou para os grupos.
 */
function nivelMinimoPermitido(papel: string | null | undefined): number | null {
  if (papel === "super_admin") return 1;
  if (papel === "gestor") return 21;
  return null;
}

export async function criarFuncao(entrada: {
  nome: string;
  descricao?: string;
  nivel: number;
}): Promise<Resultado<Funcao>> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;

  const erro = validar(entrada.nome, entrada.nivel);
  if (erro) return { ok: false, message: erro };

  const minimo = nivelMinimoPermitido(profile?.role);
  if (minimo === null) {
    return { ok: false, message: "Acesso não autorizado: apenas a gestão cria funções." };
  }
  if (entrada.nivel < minimo) {
    return {
      ok: false,
      message: `Você não pode criar uma função acima da sua: o nível mais alto permitido para você é ${minimo}.`,
    };
  }

  const { data, error } = await supabase
    .from("funcoes")
    .insert({
      nome: entrada.nome.trim().slice(0, 60),
      descricao: entrada.descricao?.trim().slice(0, 300) || null,
      nivel: entrada.nivel,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma função com esse nome." };
    }
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível criar a função." };
  }

  revalidar();
  return { ok: true, data: data as Funcao };
}

export async function atualizarFuncao(
  id: string,
  entrada: { nome: string; descricao?: string; nivel: number; ativo: boolean }
): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;

  const erro = validar(entrada.nome, entrada.nivel);
  if (erro) return { ok: false, message: erro };

  const minimo = nivelMinimoPermitido(profile?.role);
  if (minimo === null) {
    return { ok: false, message: "Acesso não autorizado: apenas a gestão edita funções." };
  }

  const { data: atual } = await supabase
    .from("funcoes")
    .select("nivel, sistema")
    .eq("id", id)
    .single();

  if (!atual) return { ok: false, message: "Função não encontrada." };

  // Nem a que existe nem a que vai existir pode estar acima de quem edita.
  if (entrada.nivel < minimo || (atual.nivel as number) < minimo) {
    return { ok: false, message: "Você não pode alterar uma função acima da sua." };
  }

  // As quatro de sistema são o alicerce das permissões: renomear é livre,
  // mover de nível mudaria o papel que metade do sistema herda delas.
  const campos = atual.sistema
    ? {
        nome: entrada.nome.trim().slice(0, 60),
        descricao: entrada.descricao?.trim().slice(0, 300) || null,
      }
    : {
        nome: entrada.nome.trim().slice(0, 60),
        descricao: entrada.descricao?.trim().slice(0, 300) || null,
        nivel: entrada.nivel,
        ativo: entrada.ativo,
      };

  const { error } = await supabase.from("funcoes").update(campos).eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma função com esse nome." };
    }
    return { ok: false, message: error.message || "Não foi possível atualizar a função." };
  }

  revalidar();
  return { ok: true, data: undefined };
}

/**
 * Exclui a função.
 *
 * Recusa enquanto alguém a ocupar. O vínculo é `on delete set null`, então
 * ninguém perderia acesso — mas ficaria uma lista de gente sem função e sem
 * explicação, e desativar resolve o caso real de "não usamos mais esta função".
 */
export async function excluirFuncao(id: string): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;

  const minimo = nivelMinimoPermitido(profile?.role);
  if (minimo === null) {
    return { ok: false, message: "Acesso não autorizado: apenas a gestão exclui funções." };
  }

  const { data: alvo } = await supabase
    .from("funcoes")
    .select("nome, nivel, sistema")
    .eq("id", id)
    .single();

  if (!alvo) return { ok: false, message: "Função não encontrada." };

  if (alvo.sistema) {
    return {
      ok: false,
      message: `"${alvo.nome}" é uma função do sistema e não pode ser excluída. Você pode renomeá-la.`,
    };
  }

  if ((alvo.nivel as number) < minimo) {
    return { ok: false, message: "Você não pode excluir uma função acima da sua." };
  }

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("funcao_id", id);

  if (count && count > 0) {
    return {
      ok: false,
      message: `${count} pessoa(s) têm esta função. Desative-a em vez de excluir, ou mova essas pessoas para outra função antes.`,
    };
  }

  const { error } = await supabase.from("funcoes").delete().eq("id", id);
  if (error) {
    return { ok: false, message: error.message || "Não foi possível excluir a função." };
  }

  revalidar();
  return { ok: true, data: undefined };
}

/**
 * Define a função de alguém.
 *
 * O papel vem junto por gatilho no banco: gravar `funcao_id` reprojeta
 * `profiles.role` a partir do nível da função. A tela não escolhe papel, e a
 * autorização não precisa saber que funções existem.
 */
export async function definirFuncao(
  userId: string,
  funcaoId: string | null
): Promise<Resultado> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "update");
  if (!permitido.ok) return permitido;

  if (userId === user.id) {
    return { ok: false, message: "Você não pode alterar a própria função." };
  }

  const { data: alvo } = await supabase
    .from("profiles")
    .select("id, role, departamento, funcao_id")
    .eq("id", userId)
    .single();

  if (!alvo) return { ok: false, message: "Usuário não encontrado." };

  const bloqueio = await bloqueioDeEdicao(supabase, user.id, userId);
  if (bloqueio) return { ok: false, message: bloqueio };

  if (alvo.role === "super_admin") {
    return { ok: false, message: "A função de um Super Admin não se altera por aqui." };
  }

  // Ninguém promove ninguém — nem a si mesmo por interposta pessoa — para uma
  // função acima da sua.
  if (funcaoId) {
    const { data: nova } = await supabase
      .from("funcoes")
      .select("nivel, ativo")
      .eq("id", funcaoId)
      .single();

    if (!nova) return { ok: false, message: "Função não encontrada." };
    if (!nova.ativo) return { ok: false, message: "Esta função está desativada." };

    const minimo = nivelMinimoPermitido(profile?.role);
    if (minimo === null || (nova.nivel as number) < minimo) {
      return { ok: false, message: "Você não pode conceder uma função acima da sua." };
    }

    if (papelDoNivel(nova.nivel as number) === "super_admin") {
      return {
        ok: false,
        message: "Super Admin não se concede por aqui: use o botão próprio, com confirmação.",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ funcao_id: funcaoId })
    .eq("id", userId);

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: error.message || "Não foi possível definir a função." };
  }

  revalidar();
  return { ok: true, data: undefined };
}
