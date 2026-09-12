"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import { cnpjValido, normalizarCnpj } from "@/lib/cnpj";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const AVISO_MIGRACAO =
  "O módulo de certificados ainda não está no banco. Execute supabase/_manual_apply/031_empresas_e_certificados.sql.";

function faltaMigracao(codigo?: string) {
  return codigo === "42P01" || codigo === "PGRST205" || codigo === "42703";
}

function revalidar() {
  revalidatePath("/dashboard/certificados");
  revalidatePath("/dashboard/certificados/empresas");
}

export interface Empresa {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  ativo: boolean;
}

export interface Certificado {
  id: string;
  empresa_id: string;
  titular: string;
  documento: string | null;
  emissor: string | null;
  numero_serie: string | null;
  validade_inicio: string | null;
  validade_fim: string;
  tipo: string;
  observacao: string | null;
  storage_path: string | null;
  nome_arquivo: string | null;
  tamanho_bytes: number | null;
  created_at: string;
  empresa?: { razao_social: string; cnpj: string | null } | null;
}

export async function listarEmpresas(): Promise<Resultado<Empresa[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { data, error } = await supabase
    .from("empresas")
    .select("id, razao_social, nome_fantasia, cnpj, ativo")
    .order("razao_social");

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível carregar as empresas." };
  }
  return { ok: true, data: (data ?? []) as Empresa[] };
}

export interface EmpresaConsultada {
  /** Nome fantasia; a razão social quando a empresa não tem um. */
  nome: string;
  razaoSocial: string;
  origem: "cadastro" | "receita";
}

/**
 * Descobre a empresa de um CNPJ.
 *
 * Procura primeiro no cadastro de empresas do sistema. O que não estiver lá é
 * consultado na BrasilAPI, que espelha a base pública da Receita e não pede
 * chave. A chamada sai do servidor, então o navegador nunca fala com o
 * serviço externo.
 *
 * `data: null` quer dizer que o CNPJ não existe. Falha de rede ou do serviço
 * volta como erro, para a tela não afirmar "não encontrado" sem saber.
 */
export async function consultarEmpresaPorCnpj(
  cnpj: string
): Promise<Resultado<EmpresaConsultada | null>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const numero = normalizarCnpj(cnpj);
  if (!cnpjValido(numero)) {
    return { ok: false, message: "CNPJ inválido. Verifique o número informado." };
  }

  const { data: interna, error } = await supabase
    .from("empresas")
    .select("razao_social, nome_fantasia")
    .eq("cnpj", numero)
    .maybeSingle();

  // Sem a tabela, ou com falha nela, a consulta externa ainda responde.
  if (error && !faltaMigracao(error.code)) {
    console.error("Falha ao consultar empresa pelo CNPJ no cadastro:", error);
  }
  if (interna) {
    return {
      ok: true,
      data: {
        nome: interna.nome_fantasia?.trim() || interna.razao_social,
        razaoSocial: interna.razao_social,
        origem: "cadastro",
      },
    };
  }

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${numero}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (resposta.status === 404) return { ok: true, data: null };
    if (!resposta.ok) {
      console.error("BrasilAPI recusou a consulta de CNPJ:", resposta.status);
      return { ok: false, message: "Não foi possível consultar o CNPJ agora. Preencha o cliente manualmente." };
    }

    const corpo = (await resposta.json()) as {
      razao_social?: string | null;
      nome_fantasia?: string | null;
    };
    const razaoSocial = corpo.razao_social?.trim() ?? "";
    const nome = corpo.nome_fantasia?.trim() || razaoSocial;
    if (!nome) return { ok: true, data: null };

    return { ok: true, data: { nome, razaoSocial, origem: "receita" } };
  } catch (e) {
    console.error("Falha ao consultar CNPJ na BrasilAPI:", e);
    return { ok: false, message: "Não foi possível consultar o CNPJ agora. Preencha o cliente manualmente." };
  }
}

export async function criarEmpresa(entrada: {
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj?: string;
}): Promise<Resultado<Empresa>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("certificados", "certificates", "manage");
  if (!permitido.ok) return permitido;

  const razao = entrada.razaoSocial.trim();
  if (razao.length < 2) return { ok: false, message: "Informe a razão social." };

  const cnpj = entrada.cnpj?.replace(/\D/g, "") || null;
  if (cnpj && cnpj.length !== 14) {
    return { ok: false, message: "O CNPJ deve ter 14 dígitos." };
  }

  const { data, error } = await supabase
    .from("empresas")
    .insert({
      razao_social: razao.slice(0, 200),
      nome_fantasia: entrada.nomeFantasia?.trim().slice(0, 200) || null,
      cnpj,
      created_by: user.id,
    })
    .select("id, razao_social, nome_fantasia, cnpj, ativo")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Já existe uma empresa com este CNPJ." };
    }
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível criar a empresa." };
  }

  revalidar();
  return { ok: true, data: data as Empresa };
}

/** Quem cuida da empresa — é esta lista que abre o certificado. */
export async function definirAcessosDaEmpresa(
  empresaId: string,
  userIds: string[]
): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("certificados", "certificates", "manage");
  if (!permitido.ok) return permitido;

  const manter = userIds.filter(Boolean);

  // Remove só quem saiu, em vez de zerar e reinserir: uma falha no meio não
  // pode deixar a empresa sem ninguém com acesso.
  const remocao = supabase
    .from("empresa_acessos")
    .delete()
    .eq("empresa_id", empresaId);

  const { error: erroRemocao } = await (manter.length > 0
    ? remocao.not("user_id", "in", `(${manter.join(",")})`)
    : remocao);

  if (erroRemocao) {
    console.error("Falha ao ajustar acessos da empresa:", erroRemocao);
    return { ok: false, message: "Não foi possível atualizar quem tem acesso." };
  }

  if (manter.length > 0) {
    const { error } = await supabase.from("empresa_acessos").upsert(
      manter.map((id) => ({
        empresa_id: empresaId,
        user_id: id,
        concedido_por: user.id,
      })),
      { onConflict: "empresa_id,user_id" }
    );

    if (error) {
      console.error("Falha ao conceder acesso à empresa:", error);
      return { ok: false, message: "Não foi possível conceder o acesso." };
    }
  }

  revalidar();
  return { ok: true, data: undefined };
}

export async function listarAcessosDaEmpresa(
  empresaId: string
): Promise<Resultado<string[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { data, error } = await supabase
    .from("empresa_acessos")
    .select("user_id")
    .eq("empresa_id", empresaId);

  if (error) return { ok: false, message: "Não foi possível carregar os acessos." };
  return { ok: true, data: (data ?? []).map((a) => a.user_id as string) };
}

export async function listarCertificados(): Promise<Resultado<Certificado[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("certificados", "certificates", "read");
  if (!permitido.ok) return permitido;

  // A RLS já limita às empresas que a pessoa acompanha; a ordem por validade é
  // o que faz o que vence primeiro aparecer primeiro.
  const { data, error } = await supabase
    .from("certificados")
    .select("*, empresa:empresas(razao_social, cnpj)")
    .order("validade_fim");

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Não foi possível carregar os certificados." };
  }
  return { ok: true, data: (data ?? []) as Certificado[] };
}

/**
 * Registra o certificado depois de o arquivo já ter subido.
 *
 * Os dados vêm lidos de dentro do arquivo, no navegador — a senha que abriu o
 * .pfx fica lá e não chega aqui. O que este servidor recebe é o resultado da
 * leitura, nunca a chave.
 */
export async function registrarCertificado(entrada: {
  empresaId: string;
  titular: string;
  documento?: string | null;
  emissor?: string | null;
  numeroSerie?: string | null;
  validadeInicio?: string | null;
  validadeFim: string;
  tipo?: "A1" | "A3";
  observacao?: string;
  storagePath: string;
  nomeArquivo: string;
  tamanhoBytes: number;
}): Promise<Resultado<{ id: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  // "manage" e não "upload": é o que a política do banco exige para gravar.
  // Checagens diferentes nas duas camadas fariam a ação passar aqui e ser
  // recusada lá, com o arquivo já no bucket.
  const permitido = await exigir("certificados", "certificates", "manage");
  if (!permitido.ok) return permitido;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.validadeFim)) {
    return { ok: false, message: "Data de validade inválida." };
  }

  const { data, error } = await supabase
    .from("certificados")
    .insert({
      empresa_id: entrada.empresaId,
      titular: entrada.titular.slice(0, 200),
      documento: entrada.documento || null,
      emissor: entrada.emissor?.slice(0, 200) || null,
      numero_serie: entrada.numeroSerie?.slice(0, 120) || null,
      validade_inicio: entrada.validadeInicio || null,
      validade_fim: entrada.validadeFim,
      tipo: entrada.tipo ?? "A1",
      observacao: entrada.observacao?.trim().slice(0, 500) || null,
      storage_path: entrada.storagePath,
      nome_arquivo: entrada.nomeArquivo.slice(0, 200),
      tamanho_bytes: entrada.tamanhoBytes,
      enviado_por: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao registrar certificado:", error);
    return { ok: false, message: `Não foi possível registrar: ${error.message}` };
  }

  revalidar();
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Link temporário para baixar o certificado.
 *
 * O bucket é privado de propósito: um certificado digital não pode ser servido
 * por URL adivinhável. A URL é assinada, vale cinco minutos, e o download fica
 * registrado antes de ela ser gerada — se a gravação do registro falhar, o
 * link não sai. Levar um certificado sem deixar rastro é o que não pode
 * acontecer.
 */
export async function urlDoCertificado(
  certificadoId: string
): Promise<Resultado<{ url: string; nome: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("certificados", "certificates", "download");
  if (!permitido.ok) return permitido;

  const { data: cert, error: erroBusca } = await supabase
    .from("certificados")
    .select("storage_path, nome_arquivo, titular")
    .eq("id", certificadoId)
    .single();

  if (erroBusca || !cert?.storage_path) {
    return { ok: false, message: "Este certificado não tem arquivo guardado." };
  }

  const { error: erroRegistro } = await supabase.rpc(
    "registrar_download_certificado",
    { p_certificado: certificadoId }
  );

  if (erroRegistro) {
    return {
      ok: false,
      message: erroRegistro.message?.includes("acesso")
        ? "Você não tem acesso aos certificados desta empresa."
        : "Não foi possível registrar o download.",
    };
  }

  const { data, error } = await supabase.storage
    .from("certificados")
    .createSignedUrl(cert.storage_path as string, 300);

  if (error || !data?.signedUrl) {
    return { ok: false, message: "Não foi possível gerar o link do arquivo." };
  }

  return {
    ok: true,
    data: {
      url: data.signedUrl,
      nome: (cert.nome_arquivo as string) || `${cert.titular}.pfx`,
    },
  };
}

export async function excluirCertificado(id: string): Promise<Resultado> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("certificados", "certificates", "manage");
  if (!permitido.ok) return permitido;

  const { data: cert } = await supabase
    .from("certificados")
    .select("storage_path")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("certificados").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir o certificado." };

  // O arquivo sai junto: um binário órfão em bucket privado é custo sem uso, e
  // ainda é um certificado guardado que ninguém mais controla.
  if (cert?.storage_path) {
    const { error: erroArquivo } = await supabase.storage
      .from("certificados")
      .remove([cert.storage_path as string]);
    if (erroArquivo) {
      console.error("Registro excluído, arquivo permaneceu:", erroArquivo);
    }
  }

  revalidar();
  return { ok: true, data: undefined };
}

/** Quem já baixou este certificado, e quando. */
export async function historicoDeDownloads(
  certificadoId: string
): Promise<Resultado<{ quem: string; quando: string }[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const { data, error } = await supabase
    .from("certificado_downloads")
    .select("created_at, quem:profiles(full_name, email)")
    .eq("certificado_id", certificadoId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { ok: false, message: "Não foi possível carregar o histórico." };

  return {
    ok: true,
    data: (data ?? []).map((d) => {
      const p = d.quem as unknown as { full_name: string | null; email: string } | null;
      return {
        quem: p?.full_name || p?.email || "Desconhecido",
        quando: d.created_at as string,
      };
    }),
  };
}
