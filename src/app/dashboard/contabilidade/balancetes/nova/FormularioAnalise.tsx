"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SuggestWithAi from "@/components/ai/SuggestWithAi";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { Button } from "@/components/ui";
import { parseArquivo } from "@/lib/contabilidade/parse";
import { classificarContas, composicao, gerarAnalise, moeda } from "@/lib/contabilidade/analise";
import type { AnaliseGerada, BalanceteExtraido } from "@/lib/contabilidade/tipos";
import {
  registrarErroAnalise,
  salvarAnalise,
  type EmpresaCliente,
} from "@/app/actions/contabilidade";

const ACEITOS = [".pdf", ".xlsx", ".xls", ".csv"];

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

interface Previa {
  extraido: BalanceteExtraido;
  analise: AnaliseGerada;
  empresaNome: string;
  periodoTexto: string;
}

export default function FormularioAnalise({ empresas }: { empresas: EmpresaCliente[] }) {
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [empresaId, setEmpresaId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resumo, setResumo] = useState("");
  const [iaUsada, setIaUsada] = useState(false);

  function pegarArquivo(f: File | null) {
    setErro("");
    setPrevia(null);
    if (!f) {
      setArquivo(null);
      return;
    }
    const ext = `.${(f.name.split(".").pop() ?? "").toLowerCase()}`;
    if (!ACEITOS.includes(ext)) {
      setErro("Formato não aceito. Envie PDF, XLSX, XLS ou CSV.");
      setArquivo(null);
      return;
    }
    setArquivo(f);
  }

  async function processar() {
    setErro("");
    const empresa = empresas.find((e) => e.id === empresaId);
    if (!empresa) {
      setErro("Escolha a empresa cliente.");
      return;
    }
    if (!inicio || !fim || inicio > fim) {
      setErro("Informe o período de referência (início até fim).");
      return;
    }
    if (!arquivo) {
      setErro("Selecione o arquivo do balancete.");
      return;
    }

    setProcessando(true);
    try {
      const extraido = await parseArquivo(arquivo);
      const { contas } = classificarContas(extraido.contas);
      const periodoTexto = `${new Date(`${inicio}T00:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${fim}T00:00:00`).toLocaleDateString("pt-BR")}`;
      const analise = gerarAnalise(contas, empresa.razao_social, periodoTexto);

      // Período do documento diverge do informado: pergunta, não substitui.
      if (
        extraido.periodoDoc &&
        (extraido.periodoDoc.inicio !== inicio || extraido.periodoDoc.fim !== fim)
      ) {
        const seguir = await confirmar({
          titulo: "Período diferente no documento",
          mensagem: `O período informado é diferente do período identificado no balancete (${extraido.periodoDoc.inicio.split("-").reverse().join("/")} a ${extraido.periodoDoc.fim.split("-").reverse().join("/")}). Deseja continuar?`,
          rotuloConfirmar: "Continuar",
          rotuloCancelar: "Revisar",
        });
        if (!seguir) {
          setProcessando(false);
          return;
        }
      }

      setResumo(analise.secoes.resumo);
      setIaUsada(false);
      setPrevia({ extraido, analise, empresaNome: empresa.razao_social, periodoTexto });
    } catch (e) {
      const mensagem =
        e instanceof Error ? e.message : "Não foi possível processar este balancete.";
      // Registra a tentativa para histórico; o arquivo já morreu no navegador.
      await registrarErroAnalise({
        empresaId,
        inicio,
        fim,
        etapa: "extração",
        mensagem,
      });
      setErro(`Não foi possível processar este balancete. ${mensagem}`);
    } finally {
      setProcessando(false);
    }
  }

  async function salvar() {
    if (!previa) return;
    setErro("");
    setSalvando(true);
    try {
      const res = await salvarAnalise({
        empresaId,
        inicio,
        fim,
        periodoDoc: previa.extraido.periodoDoc,
        avisos: previa.extraido.avisos,
        totais: {
          ...(previa.analise.totais as unknown as Record<string, number | boolean>),
          ...composicao(previa.analise.contas),
        },
        contas: previa.analise.contas,
        indicadores: previa.analise.indicadores,
        resultado: {
          resumo,
          patrimonial: previa.analise.secoes.patrimonial,
          resultado: previa.analise.secoes.resultado,
          liquidez: previa.analise.secoes.liquidez,
          endividamento: previa.analise.secoes.endividamento,
          giro: previa.analise.secoes.giro,
          pontos: previa.analise.pontos,
          podeConcluir: previa.analise.podeConcluir,
          naoPodeConcluir: previa.analise.naoPodeConcluir,
          recomendacoes: previa.analise.recomendacoes,
          documentos: previa.analise.documentos,
        },
        iaUsada,
      });
      if (!res.ok) {
        setErro(res.message);
        setSalvando(false);
        return;
      }
      router.push(`/dashboard/contabilidade/balancetes/${res.data.id}`);
    } catch {
      setErro("Falha de conexão ao salvar. Tente de novo.");
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Dialogo />
      {erro && (
        <p className="rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm font-semibold text-[var(--erro-fg)]">
          {erro}
        </p>
      )}

      {!previa ? (
        <div className="neo-card space-y-5 p-6">
          <div>
            <label htmlFor="empresa" className="mb-1 block text-sm font-medium text-[var(--text)]">
              Empresa (cliente) *
            </label>
            <select
              id="empresa"
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
            >
              <option value="">Escolha a empresa</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.razao_social}
                  {e.cnpj ? ` — ${e.cnpj}` : ""}
                </option>
              ))}
            </select>
            {empresas.length === 0 && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Nenhuma empresa cliente ativa. Cadastre em Certificados → Empresas.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inicio" className="mb-1 block text-sm font-medium text-[var(--text)]">
                Início do período *
              </label>
              <input
                id="inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="fim" className="mb-1 block text-sm font-medium text-[var(--text)]">
                Fim do período *
              </label>
              <input
                id="fim"
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-[var(--text)]">
              Documento do Balancete *
            </span>
            <div
              role="button"
              tabIndex={0}
              aria-label="Enviar balancete em PDF, Excel ou CSV"
              onClick={() => inputArquivo.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputArquivo.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                pegarArquivo(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`cursor-pointer rounded-2xl border border-dashed px-6 py-8 text-center transition ${
                arrastando
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                  : "border-[var(--neo-line)] bg-[var(--neo-flat)]"
              }`}
            >
              <p className="text-sm font-semibold text-[var(--text)]">
                Arraste o arquivo aqui ou clique para selecionar
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                PDF, XLSX, XLS ou CSV — até 10 MB. O original é descartado após o
                processamento.
              </p>
              <input
                ref={inputArquivo}
                type="file"
                accept={ACEITOS.join(",")}
                className="sr-only"
                onChange={(e) => pegarArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
            {arquivo && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                <strong className="text-[var(--text)]">{arquivo.name}</strong> ·{" "}
                {tamanhoLegivel(arquivo.size)} · pronto para processar
              </p>
            )}
          </div>

          <div>
            <Button type="button" onClick={processar} disabled={processando}>
              {processando ? "Processando…" : "Processar Análise"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="neo-card space-y-2 p-6">
            <h2 className="text-lg font-bold text-[var(--text)]">Prévia da extração</h2>
            <p className="text-sm text-[var(--text)]">
              {previa.empresaNome} · {previa.periodoTexto}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {previa.analise.contas.length} contas extraídas de {previa.extraido.linhasLidas}{" "}
              linhas ({previa.extraido.origem.toUpperCase()}).
            </p>
            <p className="text-sm text-[var(--text)]">
              Débitos {moeda(previa.analise.totais.debitos)} · Créditos{" "}
              {moeda(previa.analise.totais.creditos)} ·{" "}
              {previa.analise.totais.balanceado ? "balancete fecha" : "balancete NÃO fecha"}
            </p>
            {previa.extraido.avisos.length > 0 && (
              <ul className="list-inside list-disc text-sm text-[var(--aviso-fg)]">
                {previa.extraido.avisos.slice(0, 5).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {previa.analise.avisosValidacao.length > 0 && (
              <ul className="list-inside list-disc text-sm text-[var(--aviso-fg)]">
                {previa.analise.avisosValidacao.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="neo-card space-y-3 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-[var(--text)]">Resumo executivo</h2>
              <SuggestWithAi
                fieldType="resumo_balancete"
                whatToSuggest="resumo executivo claro para o empresário, sem jargão, a partir dos números do balancete"
                domain="OCRAl Contabilidade"
                currentValue={resumo}
                context={{
                  empresa: previa.empresaNome,
                  periodo: previa.periodoTexto,
                  totais: previa.analise.totais,
                }}
                onAccept={(texto) => {
                  setResumo(texto);
                  setIaUsada(true);
                }}
              />
            </div>
            <textarea
              value={resumo}
              onChange={(e) => {
                setResumo(e.target.value);
              }}
              rows={6}
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
            />
            {iaUsada && (
              <p className="text-xs text-[var(--text-muted)]">
                Resumo refinado com IA — revise antes de salvar.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar resultado"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPrevia(null)}
              disabled={salvando}
            >
              Voltar e ajustar
            </Button>
            <Link
              href="/dashboard/contabilidade/balancetes"
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:underline"
            >
              Descartar
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
