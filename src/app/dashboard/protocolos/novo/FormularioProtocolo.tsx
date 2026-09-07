"use client";

import SuggestWithAi from "@/components/ai/SuggestWithAi";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { anexarAoProtocolo, createProtocol } from "@/app/actions/protocols";
import {
  chaveDeArmazenamento,
  prepararArquivo,
  type ArquivoPreparado,
} from "@/lib/ged/arquivos";
import { Button } from "@/components/ui";
import type { Profile } from "@/types/database";


const priorities = [
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "baixa", label: "Baixa" },
];

interface Opcao {
  id: string;
  nome: string;
}

export default function FormularioProtocolo({
  podeAtribuir,
  pessoas,
  grupos,
}: {
  podeAtribuir: boolean;
  pessoas: Opcao[];
  grupos: Opcao[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [destino, setDestino] = useState<"ninguem" | "pessoa" | "grupo">("ninguem");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedGroup, setAssignedGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<ArquivoPreparado | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [compartilharCom, setCompartilharCom] = useState<string[]>([]);
  const [progresso, setProgresso] = useState<string | null>(null);


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("priority", priority);
    if (destino === "pessoa" && assignedTo) {
      formData.set("assigned_to", assignedTo);
    }
    if (destino === "grupo" && assignedGroup) {
      formData.set("assigned_group_id", assignedGroup);
    }

    try {
      const protocolo = await createProtocol(formData);

      // O anexo vem depois do protocolo porque precisa apontar para ele. Se
      // falhar, o protocolo já existe e a tela diz o que houve — perder a
      // solicitação inteira por causa de um arquivo seria pior.
      if (arquivo) {
        setProgresso("Enviando anexo…");
        const supabase = createClient();

        const caminho = [
          "protocolos",
          new Date().getFullYear(),
          `${crypto.randomUUID()}-${chaveDeArmazenamento(arquivo.nome)}`,
        ].join("/");

        const { error: erroEnvio } = await supabase.storage
          .from("ged")
          .upload(caminho, arquivo.blob, {
            contentType:
              arquivo.compressao === "gzip" ? "application/gzip" : arquivo.mimeType,
            upsert: false,
          });

        if (erroEnvio) {
          setError(
            `Protocolo ${protocolo.nup} criado, mas o anexo falhou: ${erroEnvio.message}`
          );
          setLoading(false);
          setProgresso(null);
          return;
        }

        setProgresso("Arquivando no GED…");
        const res = await anexarAoProtocolo({
          protocoloId: protocolo.id,
          nome: arquivo.nome,
          storagePath: caminho,
          mimeType: arquivo.mimeType,
          tamanhoBytes: arquivo.tamanhoFinal,
          tamanhoOriginalBytes: arquivo.tamanhoOriginal,
          compressao: arquivo.compressao,
          compartilharCom,
        });

        if (!res.ok) {
          setError(`Protocolo ${protocolo.nup} criado, mas o anexo falhou: ${res.message}`);
          setLoading(false);
          setProgresso(null);
          return;
        }
      }

      router.push("/dashboard/protocolos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar protocolo");
      setLoading(false);
      setProgresso(null);
    }
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreparando(true);
    try {
      // O mesmo tratamento do GED: imagem é reamostrada, o resto é compactado
      // com gzip quando compensa.
      setArquivo(await prepararArquivo(file, false));
    } catch {
      setError("Não foi possível preparar o arquivo.");
      setArquivo(null);
    } finally {
      setPreparando(false);
    }
  }

  function alternarCompartilhamento(id: string) {
    setCompartilharCom((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Novo Protocolo</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Abra um novo protocolo para acompanhar solicitações e atribuir responsáveis.
        </p>
      </div>

      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-[var(--erro-bg)] border border-[var(--neo-line)] rounded-lg text-[var(--erro-fg)] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Título *</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              placeholder="Descreva o objetivo do protocolo"
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                Descrição
              </label>

              {/* A sugestão parte do título já digitado: pedir à IA que
                  detalhe uma solicitação sem saber do que ela trata devolveria
                  texto genérico. */}
              <SuggestWithAi
                fieldType="descricao_protocolo"
                whatToSuggest="descrições objetivas de solicitações internas, dizendo o que deve ser feito e por quê"
                domain="ERP OCRAL - Protocolos"
                currentValue={description}
                disabled={!title.trim()}
                label={title.trim() ? "Sugira com IA" : "Escreva o título primeiro"}
                context={{ titulo: title, prioridade: priority }}
                onAccept={(texto) => setDescription(texto)}
              />
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              placeholder="Detalhe o que deve ser tratado neste protocolo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Prioridade</label>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {priorities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {podeAtribuir && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Este protocolo vai para
              </label>

              {/* Pessoa ou grupo, e não os dois campos ao mesmo tempo: boa
                  parte das solicitações é para uma área — o Financeiro, o DP —
                  e escolher uma pessoa nesses casos elege um responsável
                  arbitrário que pode estar de férias. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["ninguem", "Ninguém ainda", "Fica na fila geral"],
                    ["pessoa", "Uma pessoa", "Alguém específico responde"],
                    ["grupo", "Um grupo", "Quem estiver na área responde"],
                  ] as const
                ).map(([valor, titulo, detalhe]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setDestino(valor)}
                    aria-pressed={destino === valor}
                    className={`rounded-2xl border p-3 text-left transition ${
                      destino === valor
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--neo-line)] bg-[var(--neo-flat)]"
                    }`}
                  >
                    <span className="block text-sm font-bold text-[var(--text)]">
                      {titulo}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {detalhe}
                    </span>
                  </button>
                ))}
              </div>

              {destino === "pessoa" && (
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                >
                  <option value="">Escolha a pessoa</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )}

              {destino === "grupo" && (
                <select
                  value={assignedGroup}
                  onChange={(e) => setAssignedGroup(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-[var(--neo-line)] px-4 py-2 text-sm"
                >
                  <option value="">Escolha o grupo</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* O anexo vira documento do GED, e não arquivo pendurado aqui:
              assim herda controle de acesso, auditoria, prazo de guarda e
              busca — e continua sendo de quem o anexou depois que o protocolo
              for encerrado. */}
          <div className="rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-flat)] p-4">
            <p className="text-sm font-semibold text-[var(--text)]">
              Anexo <span className="font-normal text-[var(--text-muted)]">(opcional)</span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              O arquivo é arquivado no GED em seu nome. Quem abriu o protocolo e
              quem responde por ele já podem lê-lo.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="neo-button cursor-pointer rounded-full px-4 py-2 text-xs font-bold text-[var(--text)]">
                {preparando
                  ? "Preparando…"
                  : arquivo
                    ? "Trocar arquivo"
                    : "Escolher arquivo"}
                <input
                  type="file"
                  onChange={escolherArquivo}
                  disabled={preparando || loading}
                  className="sr-only"
                />
              </label>

              {arquivo && (
                <>
                  <span className="min-w-0 text-xs text-[var(--text-muted)]">
                    <strong className="text-[var(--text)]">{arquivo.nome}</strong>
                    {arquivo.compressao !== "nenhuma" &&
                      ` — ${Math.round(arquivo.tamanhoOriginal / 1024)} kB reduzido para ${Math.round(arquivo.tamanhoFinal / 1024)} kB`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setArquivo(null)}
                    className="text-xs font-semibold text-[var(--text-muted)] hover:underline"
                  >
                    Remover
                  </button>
                </>
              )}
            </div>

            {arquivo && pessoas.length > 0 && (
              <div className="mt-4 border-t border-[var(--neo-line)] pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Compartilhar a leitura com
                </p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {pessoas
                    .filter((u) => u.id !== assignedTo)
                    .map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--text)] hover:bg-[var(--neo-bg)]"
                      >
                        <input
                          type="checkbox"
                          checked={compartilharCom.includes(u.id)}
                          onChange={() => alternarCompartilhamento(u.id)}
                        />
                        <span className="truncate">{u.nome}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <Button type="submit" disabled={loading || preparando}>
              {progresso ?? (loading ? "Criando..." : "Criar Protocolo")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
