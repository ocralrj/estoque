"use server";

import { exigir } from "@/lib/permissoes";
import { revalidatePath } from "next/cache";
import { getSession, isManager } from "@/lib/auth";
import { SENHA_INICIAL, avaliarSenha } from "@/lib/senha";
import { MAX_SAIDA_BYTES } from "@/lib/imagens/avatar";
import { SUPER_ADMIN_PRINCIPAL_EMAIL } from "@/lib/admin";
import { bloqueioDeEdicao } from "@/lib/hierarquia-servidor";
import type { StatusUsuario, UserRole } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Papéis que cada perfil pode conceder. Antes essa regra existia apenas na
 * lista do <select>, e o update ia direto do navegador para o banco — um
 * gestor conseguia se promover a super_admin pelo console.
 */
const GRANTABLE_ROLES: Record<string, UserRole[]> = {
  super_admin: ["super_admin", "gestor", "almoxarife", "requisitante"],
  gestor: ["almoxarife", "requisitante"],
};

export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "update");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  if (userId === user.id) {
    return { ok: false, message: "Você não pode alterar seu próprio papel." };
  }

  // Administração e Diretoria alteram qualquer cadastro; os demais só alteram
  // quem for do mesmo departamento e de função inferior. A mesma regra está no
  // gatilho `profiles_w_exige_hierarquia` (migração 039) — aqui ela existe para
  // a mensagem sair em português, e não como erro de gatilho.
  const bloqueio = await bloqueioDeEdicao(supabase, user.id, userId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const grantable = GRANTABLE_ROLES[profile?.role ?? ""] ?? [];
  if (!grantable.includes(role)) {
    return { ok: false, message: "Você não pode conceder esse papel." };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const podeAlterarSuperAdmin =
    user.email?.trim().toLowerCase() === SUPER_ADMIN_PRINCIPAL_EMAIL;

  // Apenas o super admin principal pode trocar o papel de outro super admin.
  // Os demais continuam administrando usuários comuns normalmente.
  if (target?.role === "super_admin" && !podeAlterarSuperAdmin) {
    return {
      ok: false,
      message: "Somente o super admin principal pode alterar outro super admin.",
    };
  }

  // Um gestor não mexe em quem está acima dele.
  if (!grantable.includes(target?.role as UserRole)) {
    return { ok: false, message: "Você não pode alterar esse usuário." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return { ok: false, message: "Não foi possível atualizar o papel." };

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/**
 * Define a situação da conta: Ativo, Férias ou Inativo.
 *
 * Substitui o par ativar/desativar. Férias não bloqueia o acesso de propósito:
 * é entrando que a pessoa dispara o próprio retorno, quando a data prevista já
 * passou (ver `encerrarFeriasVencidas`). A data de volta é exigida aqui e
 * também no banco, por restrição — férias sem prazo nunca acabariam sozinhas.
 */
export async function definirStatus(
  userId: string,
  status: StatusUsuario,
  retornoPrevisto?: string | null
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  if (userId === user.id) {
    return { ok: false, message: "Você não pode alterar o status da própria conta." };
  }

  // Administração e Diretoria alteram qualquer cadastro; os demais só alteram
  // quem for do mesmo departamento e de função inferior. A mesma regra está no
  // gatilho `profiles_w_exige_hierarquia` (migração 039) — aqui ela existe para
  // a mensagem sair em português, e não como erro de gatilho.
  const bloqueio = await bloqueioDeEdicao(supabase, user.id, userId);
  if (bloqueio) return { ok: false, message: bloqueio };

  if (!["ativo", "ferias", "inativo"].includes(status)) {
    return { ok: false, message: "Status inválido." };
  }

  let retorno: string | null = null;
  if (status === "ferias") {
    const data = (retornoPrevisto ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, message: "Informe a data prevista de retorno." };
    }
    // Uma volta no passado encerraria as férias no acesso seguinte, o que na
    // prática é registrar férias que não existem.
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (data <= hoje) {
      return { ok: false, message: "A data de retorno precisa ser futura." };
    }
    retorno = data;
  }

  const grantable = GRANTABLE_ROLES[profile?.role ?? ""] ?? [];

  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  // Super admin não é desativado por ninguém — nem por outro super admin.
  // Só ele próprio muda o próprio status.
  if (target?.role === "super_admin") {
    return {
      ok: false,
      message: "Um super admin não pode ter o status alterado por outra pessoa.",
    };
  }

  if (!grantable.includes(target?.role as UserRole)) {
    return { ok: false, message: "Você não pode alterar esse usuário." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ status, retorno_previsto: retorno })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return {
        ok: false,
        message:
          "Faltam as colunas de status. Execute supabase/_manual_apply/013_status_usuario.sql.",
      };
    }
    return { ok: false, message: "Não foi possível atualizar o usuário." };
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/**
 * Eleva alguém a super admin.
 *
 * Fica fora de `updateUserRole` de propósito: conceder o papel máximo do
 * sistema não deve acontecer por um clique distraído num seletor ao lado dos
 * demais papéis. Aqui é ação própria, com confirmação na tela.
 */
export async function promoverASuperAdmin(userId: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "update");
  if (!permitido.ok) return permitido;

  if (profile?.role !== "super_admin") {
    return { ok: false, message: "Apenas um super admin pode conceder esse papel." };
  }

  // Administração e Diretoria alteram qualquer cadastro; os demais só alteram
  // quem for do mesmo departamento e de função inferior. A mesma regra está no
  // gatilho `profiles_w_exige_hierarquia` (migração 039) — aqui ela existe para
  // a mensagem sair em português, e não como erro de gatilho.
  const bloqueio = await bloqueioDeEdicao(supabase, user.id, userId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const { data: target } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .single();

  if (!target) return { ok: false, message: "Usuário não encontrado." };
  if (target.role === "super_admin") {
    return { ok: false, message: "Este usuário já é super admin." };
  }
  if (!target.active) {
    return { ok: false, message: "Ative o usuário antes de promovê-lo." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", userId);

  if (error) return { ok: false, message: "Não foi possível promover o usuário." };

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/** Atualiza o próprio nome de exibição. */
export async function atualizarMeuNome(nome: string): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const limpo = nome.trim();
  if (limpo.length < 3) return { ok: false, message: "Informe ao menos 3 caracteres." };
  if (limpo.length > 120) return { ok: false, message: "O nome está longo demais." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: limpo })
    .eq("id", user.id);

  if (error) return { ok: false, message: "Não foi possível salvar o nome." };

  // O nome também vive nos metadados do Auth, de onde o trigger de cadastro o
  // copia. Manter os dois iguais evita o valor antigo reaparecer.
  await supabase.auth.updateUser({ data: { full_name: limpo } });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Pré-cadastra alguém com senha conhecida e departamento definido.
 *
 * Usa a chave de serviço, que ignora o RLS — por isso a checagem de papel é
 * feita ANTES, com a sessão de quem convida, e nunca com essa chave. Ela existe
 * só no servidor e jamais chega ao navegador.
 *
 * A conta nasce com `must_change_password`, então a senha inicial só serve para
 * entrar uma vez: enquanto não for trocada, a pessoa não alcança o sistema.
 */
export interface NovoUsuario {
  email: string;
  nome?: string | null;
  papel?: UserRole;
  departamento?: string | null;
  status?: StatusUsuario;
  retornoPrevisto?: string | null;
  /** Foto já tratada pela tela, como data URL. Opcional. */
  fotoBase64?: string | null;
  /** Grupo principal, de onde vêm o nível e as permissões. */
  grupoId?: string | null;
  /** Função cadastrada. Quando vem, é ela quem decide o papel. */
  funcaoId?: string | null;
}

const TIPOS_DE_FOTO: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Converte a foto que veio da tela, recusando o que não for imagem conhecida.
 *
 * A tela já entrega um quadrado de 256 pixels, mas uma Server Action é um
 * endpoint como outro qualquer: o conteúdo é validado aqui de novo, sem
 * confiar em quem chamou.
 */
function lerFoto(
  dataUrl: string
): { bytes: Uint8Array; mimeType: string; extensao: string } | null {
  const casamento = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!casamento) return null;

  const mimeType = casamento[1].toLowerCase();
  const extensao = TIPOS_DE_FOTO[mimeType];
  if (!extensao) return null;

  try {
    const bytes = Uint8Array.from(Buffer.from(casamento[2], "base64"));
    if (bytes.length === 0 || bytes.length > MAX_SAIDA_BYTES) return null;
    return { bytes, mimeType, extensao };
  } catch {
    return null;
  }
}

export async function convidarUsuario(
  entrada: NovoUsuario
): Promise<{ ok: true; senha: string } | { ok: false; message: string }> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "create");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  const limpo = entrada.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)) {
    return { ok: false, message: "E-mail inválido." };
  }

  // O papel obedece ao mesmo limite de quem cria: sem isto, o gestor criaria
  // pela porta dos fundos alguém com mais poder do que ele próprio pode
  // conceder na lista.
  // Com função escolhida, é o nível dela que decide o papel — a tela não manda
  // papel nenhum. Sem função, o papel vem direto, como sempre veio.
  let papel = entrada.papel ?? "requisitante";
  let funcaoId: string | null = null;

  if (entrada.funcaoId) {
    const { data: funcao } = await supabase
      .from("funcoes")
      .select("id, nivel, papel_base, ativo")
      .eq("id", entrada.funcaoId)
      .single();

    if (!funcao) return { ok: false, message: "Função não encontrada." };
    if (!funcao.ativo) return { ok: false, message: "Esta função está desativada." };

    const nivelMinimo = profile?.role === "super_admin" ? 1 : 21;
    if ((funcao.nivel as number) < nivelMinimo) {
      return { ok: false, message: "Você não pode conceder uma função acima da sua." };
    }

    funcaoId = funcao.id as string;
    papel = funcao.papel_base as UserRole;
  }

  const podeConceder = GRANTABLE_ROLES[profile?.role ?? ""] ?? [];
  if (!podeConceder.includes(papel) || papel === "super_admin") {
    return { ok: false, message: "Você não pode conceder esse papel." };
  }

  const status: StatusUsuario = entrada.status ?? "ativo";
  if (!["ativo", "ferias", "inativo"].includes(status)) {
    return { ok: false, message: "Status inválido." };
  }

  let retorno: string | null = null;
  if (status === "ferias") {
    const data = (entrada.retornoPrevisto ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, message: "Informe a data prevista de retorno." };
    }
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (data <= hoje) {
      return { ok: false, message: "A data de retorno precisa ser futura." };
    }
    retorno = data;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return {
      ok: false,
      message:
        "Pré-cadastro indisponível: falta SUPABASE_SERVICE_ROLE_KEY nas variáveis de produção.",
    };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // email_confirm: a pessoa não precisa confirmar nada — quem cadastrou já
  // sabe que o endereço existe, e ela entra direto com a senha inicial.
  const { data, error } = await admin.auth.admin.createUser({
    email: limpo,
    password: SENHA_INICIAL,
    email_confirm: true,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { ok: false, message: "Este e-mail já tem conta no sistema." };
    }
    // Sem o motivo real a falha fica impossível de investigar: o Auth devolve
    // "Database error creating new user" quando um gatilho em profiles quebra,
    // e isso não aparece em lugar nenhum além daqui.
    console.error("Falha ao criar conta:", limpo, error.status, error.code, error.message);
    return {
      ok: false,
      message: `Não foi possível criar o acesso: ${error.message}`,
    };
  }

  const novoId = data.user?.id;
  if (novoId) {
    // O gatilho já criou o perfil como requisitante; completamos com o
    // departamento e a marca de troca obrigatória.
    const base = {
      full_name: entrada.nome?.trim().slice(0, 120) || null,
      role: papel,
      departamento: entrada.departamento?.trim() || null,
      must_change_password: true,
      // O grupo projeta o papel por gatilho, então vai junto: gravar o papel
      // sem o grupo deixaria a conta com acesso e sem permissão fina nenhuma.
      ...(entrada.grupoId ? { group_id: entrada.grupoId } : {}),
      ...(funcaoId ? { funcao_id: funcaoId } : {}),
    };

    const { error: erroPerfil } = await admin
      .from("profiles")
      .update({ ...base, status, retorno_previsto: retorno })
      .eq("id", novoId);

    // Sem a migração 013 as colunas de status ainda não existem, e a conta
    // ficaria sem nome nem papel por causa delas. O resto do cadastro é salvo
    // do mesmo jeito; só a situação fica pendente.
    if (erroPerfil?.code === "PGRST204" || erroPerfil?.code === "42703") {
      await admin.from("profiles").update(base).eq("id", novoId);
    }

    // A foto é opcional e não pode derrubar o cadastro: se falhar, a conta já
    // existe e a pessoa (ou quem a cadastrou) sobe a imagem depois pelo perfil.
    const foto = entrada.fotoBase64 ? lerFoto(entrada.fotoBase64) : null;
    if (foto) {
      const caminho = `${novoId}-${Date.now()}.${foto.extensao}`;
      const { data: enviada } = await admin.storage
        .from("avatars")
        .upload(caminho, foto.bytes, {
          cacheControl: "3600",
          upsert: true,
          contentType: foto.mimeType,
        });

      if (enviada?.path) {
        const { data: publica } = admin.storage
          .from("avatars")
          .getPublicUrl(enviada.path);
        await admin
          .from("profiles")
          .update({ avatar_url: publica.publicUrl })
          .eq("id", novoId);
      }
    }
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true, senha: SENHA_INICIAL };
}

/**
 * Define o departamento da pessoa.
 *
 * É o que decide quais documentos ela enxerga no modo "departamento" do GED —
 * sem isso preenchido, ela só vê o que for marcado como "todos" e o que ela
 * mesma arquivou.
 */
export async function definirDepartamento(
  userId: string,
  departamento: string | null
): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };
  const permitido = await exigir("admin", "users", "manage");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  // Administração e Diretoria alteram qualquer cadastro; os demais só alteram
  // quem for do mesmo departamento e de função inferior. A mesma regra está no
  // gatilho `profiles_w_exige_hierarquia` (migração 039) — aqui ela existe para
  // a mensagem sair em português, e não como erro de gatilho.
  const bloqueio = await bloqueioDeEdicao(supabase, user.id, userId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const { error } = await supabase
    .from("profiles")
    .update({ departamento: departamento?.trim() || null })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703") {
      return {
        ok: false,
        message:
          "Falta a coluna de departamento. Execute supabase/_manual_apply/011_acesso_por_departamento.sql.",
      };
    }
    return { ok: false, message: "Não foi possível salvar o departamento." };
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/**
 * Troca a senha provisória e libera o acesso ao sistema.
 *
 * Antes a tela trocava a senha pelo navegador e depois chamava uma action que
 * só baixava `must_change_password` — nada impedia chamá-la direto e seguir
 * com a senha provisória. Agora as duas coisas acontecem aqui, e a senha nova
 * é conferida antes de valer.
 */
export async function trocarSenhaInicial(senha: string): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  if (typeof senha !== "string" || !avaliarSenha(senha).valida) {
    return { ok: false, message: "A senha ainda não atende aos requisitos." };
  }

  // A provisória é a mesma para todo pré-cadastro: ficar com ela é deixar a
  // conta aberta a quem cadastrou e a qualquer outro convidado.
  if (senha === SENHA_INICIAL) {
    return { ok: false, message: "A nova senha não pode ser a senha provisória." };
  }

  const { error: erroSenha } = await supabase.auth.updateUser({ password: senha });
  if (erroSenha) {
    // O Auth recusa a senha que a conta já tem — cobre quem recebeu uma
    // provisória diferente da padrão.
    if (erroSenha.code === "same_password") {
      return { ok: false, message: "A nova senha não pode ser a senha provisória." };
    }
    if (erroSenha.code === "weak_password") {
      return { ok: false, message: "A senha foi recusada por ser fraca. Escolha outra." };
    }
    console.error("[trocarSenhaInicial] falha ao alterar a senha:", erroSenha.message);
    return { ok: false, message: "Não foi possível alterar a senha." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (error) return { ok: false, message: "Não foi possível concluir a troca." };

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Exclui um usuário de vez: conta de acesso, perfil e o que era só dele.
 *
 * A ordem importa. Primeiro a RPC `excluir_dados_do_usuario` apaga o que é da
 * pessoa e transfere para quem executou a autoria do que é da empresa —
 * produtos, movimentações, documentos, protocolos. Só depois a conta cai em
 * `auth.users`, e o perfil vai junto por cascade.
 *
 * Invertida, a ordem não funcionaria: dezessete chaves estrangeiras apontam
 * para `profiles(id)` sem `on delete`, e `products.created_by` é `not null` —
 * a exclusão morreria com erro de chave estrangeira, ou levaria o catálogo
 * junto.
 */
export async function excluirUsuario(userId: string): Promise<ActionResult> {
  const { supabase, user, profile } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "delete");
  if (!permitido.ok) return permitido;
  if (!isManager(profile?.role)) return { ok: false, message: "Sem permissão" };

  if (userId === user.id) {
    return { ok: false, message: "Você não pode excluir a própria conta." };
  }

  const { data: alvo } = await supabase
    .from("profiles")
    .select("id, role, email, full_name, avatar_url")
    .eq("id", userId)
    .single();

  if (!alvo) return { ok: false, message: "Usuário não encontrado." };

  // Nunca, sem exceção — nem para o super admin principal. Um sistema que
  // permite apagar seu próprio administrador permite ficar sem ninguém que o
  // conserte. Para desfazer a condição, rebaixe a função antes.
  if (alvo.role === "super_admin") {
    return {
      ok: false,
      message: "Um Super Admin não pode ser excluído. Rebaixe a função antes, se for mesmo o caso.",
    };
  }

  const bloqueio = await bloqueioDeEdicao(supabase, user.id, userId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return {
      ok: false,
      message:
        "Exclusão indisponível: falta SUPABASE_SERVICE_ROLE_KEY nas variáveis de produção.",
    };
  }

  // Transferência e limpeza rodam na sessão de quem pediu, e não na chave de
  // serviço: é `auth.uid()` que a RPC usa para conferir o papel. Com a chave,
  // a checagem do banco seria pulada e sobraria só a da aplicação.
  const { error: erroDados } = await supabase.rpc("excluir_dados_do_usuario", {
    p_alvo: userId,
    p_herdeiro: user.id,
  });

  if (erroDados) {
    if (erroDados.code === "42883" || erroDados.code === "PGRST202") {
      return {
        ok: false,
        message:
          "A função de exclusão ainda não existe no banco. Execute supabase/_manual_apply/038_excluir_usuario.sql.",
      };
    }
    return {
      ok: false,
      message: erroDados.message || "Não foi possível preparar a exclusão.",
    };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // A foto some antes da conta: depois não haveria mais como descobrir o
  // caminho dela, e o arquivo ficaria órfão no bucket para sempre.
  const caminho = caminhoDoAvatar(alvo.avatar_url as string | null);
  if (caminho) {
    await admin.storage.from("avatars").remove([caminho]);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return {
      ok: false,
      message:
        "Os dados foram limpos, mas a conta de acesso não pôde ser removida: " +
        error.message,
    };
  }

  revalidatePath("/dashboard/admin/usuarios");
  return { ok: true };
}

/** O caminho do arquivo dentro do bucket, a partir da URL pública. */
function caminhoDoAvatar(url: string | null): string | null {
  if (!url) return null;
  const marca = "/avatars/";
  const i = url.indexOf(marca);
  if (i === -1) return null;
  return url.slice(i + marca.length).split("?")[0] || null;
}

/** O que a exclusão vai transferir, para a confirmação poder dizer o tamanho. */
export async function previaDaExclusao(
  userId: string
): Promise<{ ok: true; itens: Record<string, number> } | { ok: false; message: string }> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("admin", "users", "delete");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase.rpc("previa_exclusao_do_usuario", {
    p_alvo: userId,
  });

  // A prévia é um conforto, não um requisito: sem a migração aplicada ela vem
  // vazia e a confirmação continua funcionando, só sem os números.
  if (error) return { ok: true, itens: {} };

  return { ok: true, itens: (data ?? {}) as Record<string, number> };
}
