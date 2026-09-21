"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { exigir } from "@/lib/permissoes";
import type {
  ContaClassificada,
  IndicadorCalculado,
} from "@/lib/contabilidade/tipos";

type Resultado<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const AVISO_MIGRACAO =
  "O módulo Contabilidade ainda não está no banco. Execute supabase/schema_contabilidade.sql.";

function faltaMigracao(codigo?: string) {
  return codigo === "42P01" || codigo === "PGRST205" || codigo === "42703";
}

function revalidar() {
  revalidatePath("/dashboard/contabilidade/balancetes");
}

export interface EmpresaCliente {
  id: string;
  razao_social: string;
  cnpj: string | null;
}

/** Só empresas-clientes ativas: análise é serviço para cliente. */
export async function listarEmpresasClientes(): Promise<Resultado<EmpresaCliente[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("contabilidade", "balancetes", "create");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj")
    .eq("e_cliente", true)
    .eq("ativo", true)
    .order("razao_social");

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao listar empresas-clientes:", error);
    return { ok: false, message: "Não foi possível carregar as empresas." };
  }
  return { ok: true, data: (data ?? []) as EmpresaCliente[] };
}

export interface NovaAnalise {
  id: string;
  empresa_id: string;
  empresa_nome: string;
  empresa_cnpj: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  erro_mensagem: string | null;
}

export async function listarAnalises(): Promise<Resultado<NovaAnalise[]>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("contabilidade", "balancetes", "read");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase
    .from("analises_balancetes")
    .select("id, empresa_id, periodo_inicio, periodo_fim, status, created_at, processed_at, erro_mensagem, empresa:empresas(razao_social, cnpj)")
    .order("periodo_fim", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (faltaMigracao(error.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao listar análises:", error);
    return { ok: false, message: "Não foi possível carregar as análises." };
  }

  const linhas = ((data ?? []) as unknown as {
    id: string;
    empresa_id: string;
    periodo_inicio: string;
    periodo_fim: string;
    status: string;
    created_at: string;
    processed_at: string | null;
    erro_mensagem: string | null;
    empresa: { razao_social: string; cnpj: string | null } | { razao_social: string; cnpj: string | null }[] | null;
  }[]).map((a) => ({
    id: a.id,
    empresa_id: a.empresa_id,
    empresa_nome: Array.isArray(a.empresa) ? (a.empresa[0]?.razao_social ?? "—") : (a.empresa?.razao_social ?? "—"),
    empresa_cnpj: Array.isArray(a.empresa) ? (a.empresa[0]?.cnpj ?? null) : (a.empresa?.cnpj ?? null),
    periodo_inicio: a.periodo_inicio,
    periodo_fim: a.periodo_fim,
    status: a.status,
    created_at: a.created_at,
    processed_at: a.processed_at,
    erro_mensagem: a.erro_mensagem,
  }));
  return { ok: true, data: linhas };
}

export interface PayloadAnalise {
  empresaId: string;
  inicio: string;
  fim: string;
  periodoDoc: { inicio: string; fim: string } | null;
  avisos: string[];
  totais: Record<string, number | boolean>;
  contas: ContaClassificada[];
  indicadores: IndicadorCalculado[];
  resultado: {
    resumo: string;
    patrimonial: string;
    resultado: string;
    liquidez: string;
    endividamento: string;
    giro: string;
    pontos: { fato: string; impacto: string; investigar: string; informacao: string }[];
    podeConcluir: string[];
    naoPodeConcluir: string[];
    recomendacoes: string;
    documentos: { prioridade: string; item: string }[];
  };
  iaUsada: boolean;
}

async function confereEmpresa(
  supabase: Awaited<ReturnType<typeof getSession>>["supabase"],
  empresaId: string
) {
  const { data, error } = await supabase
    .from("empresas")
    .select("id, e_cliente, ativo")
    .eq("id", empresaId)
    .maybeSingle();
  if (error || !data) return "Empresa não encontrada.";
  if (!(data.e_cliente as boolean)) return "Análise só para empresas marcadas como Cliente.";
  if ((data as { ativo?: boolean | null }).ativo === false) {
    return "Empresa inativa: reative-a antes de analisar.";
  }
  return null;
}

/**
 * Salva a análise completa de uma vez (contas + indicadores + relatório).
 * O arquivo original nunca chega aqui: só os dados extraídos no navegador.
 */
export async function salvarAnalise(payload: PayloadAnalise): Promise<Resultado<{ id: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("contabilidade", "balancetes", "create");
  if (!permitido.ok) return permitido;

  if (!payload.inicio || !payload.fim || payload.inicio > payload.fim) {
    return { ok: false, message: "Período de referência inválido." };
  }
  const recusa = await confereEmpresa(supabase, payload.empresaId);
  if (recusa) return { ok: false, message: recusa };
  if (payload.contas.length === 0) {
    return { ok: false, message: "Sem contas extraídas para salvar." };
  }

  const { data: analise, error: erroAnalise } = await supabase
    .from("analises_balancetes")
    .insert({
      empresa_id: payload.empresaId,
      periodo_inicio: payload.inicio,
      periodo_fim: payload.fim,
      periodo_doc_inicio: payload.periodoDoc?.inicio ?? null,
      periodo_doc_fim: payload.periodoDoc?.fim ?? null,
      status: "processado",
      totais: payload.totais,
      created_by: user.id,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroAnalise || !analise) {
    if (faltaMigracao(erroAnalise?.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao salvar análise:", erroAnalise);
    return { ok: false, message: "Não foi possível salvar a análise." };
  }

  const id = analise.id as string;
  const { error: erroContas } = await supabase.from("balancete_contas").insert(
    payload.contas.map((c) => ({
      analise_id: id,
      codigo: c.codigo.slice(0, 60),
      descricao: c.descricao.slice(0, 300),
      natureza: c.natureza === "credora" ? "credora" : "devedora",
      debitos: c.debitos,
      creditos: c.creditos,
      saldo: c.saldo,
      classificacao: c.classificacao,
      grupo: c.grupo.slice(0, 60),
    }))
  );
  if (erroContas) {
    console.error("Falha ao salvar contas:", erroContas);
    await supabase.from("analises_balancetes").delete().eq("id", id);
    return { ok: false, message: "Não foi possível salvar as contas do balancete." };
  }

  const { error: erroInd } = await supabase.from("balancete_indicadores").insert(
    payload.indicadores.map((i) => ({
      analise_id: id,
      chave: i.chave,
      rotulo: i.rotulo,
      formula: i.formula,
      valor: i.valor,
      interpretacao: i.interpretacao,
      limitacao: i.limitacao,
    }))
  );
  if (erroInd) {
    console.error("Falha ao salvar indicadores:", erroInd);
    await supabase.from("analises_balancetes").delete().eq("id", id);
    return { ok: false, message: "Não foi possível salvar os indicadores." };
  }

  const r = payload.resultado;
  const { error: erroRes } = await supabase.from("balancete_resultado").insert({
    analise_id: id,
    resumo_executivo: r.resumo,
    analise_patrimonial: r.patrimonial,
    analise_resultado: r.resultado,
    analise_liquidez: r.liquidez,
    analise_endividamento: r.endividamento,
    capital_giro: r.giro,
    pontos_atencao: r.pontos,
    nao_conclusivo: { pode: r.podeConcluir, naoPode: r.naoPodeConcluir },
    recomendacoes: r.recomendacoes,
    documentos_recomendados: r.documentos,
    ia_usada: payload.iaUsada,
  });
  if (erroRes) {
    console.error("Falha ao salvar relatório:", erroRes);
    await supabase.from("analises_balancetes").delete().eq("id", id);
    return { ok: false, message: "Não foi possível salvar o relatório." };
  }

  revalidar();
  return { ok: true, data: { id } };
}

/** Registra a falha (etapa + motivo) sem guardar nada do arquivo. */
export async function registrarErroAnalise(input: {
  empresaId: string;
  inicio: string;
  fim: string;
  etapa: string;
  mensagem: string;
}): Promise<Resultado<{ id: string }>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("contabilidade", "balancetes", "create");
  if (!permitido.ok) return permitido;

  const { data, error } = await supabase
    .from("analises_balancetes")
    .insert({
      empresa_id: input.empresaId,
      periodo_inicio: input.inicio,
      periodo_fim: input.fim,
      status: "erro",
      erro_etapa: input.etapa.slice(0, 120),
      erro_mensagem: input.mensagem.slice(0, 500),
      created_by: user.id,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    if (faltaMigracao(error?.code)) return { ok: false, message: AVISO_MIGRACAO };
    console.error("Falha ao registrar erro:", error);
    return { ok: false, message: "Não foi possível registrar." };
  }
  revalidar();
  return { ok: true, data: { id: data.id as string } };
}

export interface AnaliseCompleta extends NovaAnalise {
  periodo_doc_inicio: string | null;
  periodo_doc_fim: string | null;
  totais: Record<string, number | boolean>;
  contas: ContaClassificada[];
  indicadores: IndicadorCalculado[];
  resultado: {
    resumo: string;
    patrimonial: string;
    resultado: string;
    liquidez: string;
    endividamento: string;
    giro: string;
    pontos: { fato: string; impacto: string; investigar: string; informacao: string }[];
    pode: string[];
    naoPode: string[];
    recomendacoes: string;
    documentos: { prioridade: string; item: string }[];
    ia_usada: boolean;
  } | null;
}

export async function obterAnalise(id: string): Promise<Resultado<AnaliseCompleta>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Não autenticado" };

  const permitido = await exigir("contabilidade", "balancetes", "read");
  if (!permitido.ok) return permitido;

  const { data: a, error } = await supabase
    .from("analises_balancetes")
    .select("*, empresa:empresas(razao_social, cnpj)")
    .eq("id", id)
    .maybeSingle();

  if (error || !a) {
    if (faltaMigracao(error?.code)) return { ok: false, message: AVISO_MIGRACAO };
    return { ok: false, message: "Análise não encontrada." };
  }
  const row = a as Record<string, unknown>;
  const empresa = row.empresa as
    | { razao_social: string; cnpj: string | null }
    | { razao_social: string; cnpj: string | null }[]
    | null;

  const [{ data: contas }, { data: indicadores }, { data: resultado }] = await Promise.all([
    supabase.from("balancete_contas").select("*").eq("analise_id", id).order("codigo"),
    supabase.from("balancete_indicadores").select("*").eq("analise_id", id),
    supabase.from("balancete_resultado").select("*").eq("analise_id", id).maybeSingle(),
  ]);

  const res = resultado as unknown as {
    resumo_executivo: string;
    analise_patrimonial: string;
    analise_resultado: string;
    analise_liquidez: string;
    analise_endividamento: string;
    capital_giro: string;
    pontos_atencao: { fato: string; impacto: string; investigar: string; informacao: string }[];
    nao_conclusivo: { pode: string[]; naoPode: string[] };
    recomendacoes: string;
    documentos_recomendados: { prioridade: string; item: string }[];
    ia_usada: boolean;
  } | null;

  return {
    ok: true,
    data: {
      id: row.id as string,
      empresa_id: row.empresa_id as string,
      empresa_nome: Array.isArray(empresa) ? (empresa[0]?.razao_social ?? "—") : (empresa?.razao_social ?? "—"),
      empresa_cnpj: Array.isArray(empresa) ? (empresa[0]?.cnpj ?? null) : (empresa?.cnpj ?? null),
      periodo_inicio: row.periodo_inicio as string,
      periodo_fim: row.periodo_fim as string,
      periodo_doc_inicio: row.periodo_doc_inicio as string | null,
      periodo_doc_fim: row.periodo_doc_fim as string | null,
      status: row.status as string,
      created_at: row.created_at as string,
      processed_at: row.processed_at as string | null,
      erro_mensagem: row.erro_mensagem as string | null,
      totais: (row.totais as Record<string, number | boolean>) ?? {},
      contas: ((contas ?? []) as ContaClassificada[]),
      indicadores: ((indicadores ?? []) as IndicadorCalculado[]),
      resultado: res
        ? {
            resumo: res.resumo_executivo,
            patrimonial: res.analise_patrimonial,
            resultado: res.analise_resultado,
            liquidez: res.analise_liquidez,
            endividamento: res.analise_endividamento,
            giro: res.capital_giro,
            pontos: res.pontos_atencao ?? [],
            pode: res.nao_conclusivo?.pode ?? [],
            naoPode: res.nao_conclusivo?.naoPode ?? [],
            recomendacoes: res.recomendacoes,
            documentos: res.documentos_recomendados ?? [],
            ia_usada: res.ia_usada,
          }
        : null,
    },
  };
}

export async function excluirAnalise(id: string): Promise<void> {
  const { supabase, user } = await getSession();
  if (!user) throw new Error("Não autenticado");

  const permitido = await exigir("contabilidade", "balancetes", "delete");
  if (!permitido.ok) throw new Error(permitido.message);

  const { error } = await supabase.from("analises_balancetes").delete().eq("id", id);
  if (error) {
    console.error("Falha ao excluir análise:", error);
    throw new Error("Não foi possível excluir.");
  }
  revalidar();
}
