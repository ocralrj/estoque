"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SuggestWithAi from "@/components/ai/SuggestWithAi";
import CapturaFoto, { ResumoCompressao } from "@/components/ged/CapturaFoto";
import SeletorAcesso, { type Acesso } from "@/components/ged/SeletorAcesso";
import { prepararArquivo, formatarBytes } from "@/lib/ged/arquivos";
import type { ArquivoPreparado } from "@/lib/ged/arquivos";
import {
  criarDocumento,
  atualizarDocumento,
  lerDocumentoComIa,
  listarAcessosDoDocumento,
} from "@/app/actions/ged";
import {
  GED_SETORES,
  type GedDocument,
  type GedFolder,
  type GedSetor,
  type GedStatus,
} from "@/types/modules/ged";

const STATUS: GedStatus[] = ["Rascunho", "Ativo", "Assinado", "Arquivado", "Eliminado"];

/** Limite do bucket, conferido antes de gastar tempo comprimindo. */
const TAMANHO_MAXIMO = 25 * 1024 * 1024;
/** Teto do corpo de uma Server Action — acima disso a leitura por IA não roda. */
const TAMANHO_LEITURA_IA = 4 * 1024 * 1024;

interface Props {
  documento?: GedDocument;
  pastas: GedFolder[];
}

/** Base64 sem o prefixo data:, que é o formato aceito pelo Gemini. */
function paraBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const r = String(leitor.result);
      resolve(r.slice(r.indexOf(",") + 1));
    };
    leitor.onerror = () => reject(new Error("falha ao ler o arquivo"));
    leitor.readAsDataURL(blob);
  });
}

export default function FormularioDocumento({ documento, pastas }: Props) {
  const router = useRouter();
  const editando = Boolean(documento);
  const [pendente, iniciar] = useTransition();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nome: documento?.nome ?? "",
    cliente: documento?.cliente ?? "",
    cnpj: documento?.cnpj ?? "",
    setor: (documento?.setor ?? "Fiscal") as GedSetor,
    tipo: documento?.tipo ?? "",
    status: (documento?.status ?? "Rascunho") as GedStatus,
    periodo: documento?.periodo ?? "",
    data_documento: documento?.data_documento ?? "",
    validade: documento?.validade ?? "",
    categoria: documento?.categoria ?? "",
    resumo: documento?.resumo ?? "",
    tags: (documento?.tags ?? []).join(", "),
    folder_id: documento?.folder_id ?? "",
  });

  const [visibilidade, setVisibilidade] = useState<"todos" | "restrito">(
    (documento?.visibilidade as "todos" | "restrito") ?? "todos"
  );
  const [acessos, setAcessos] = useState<Acesso[]>([]);

  const [arquivo, setArquivo] = useState<ArquivoPreparado | null>(null);
  const [camera, setCamera] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);

  // Ao editar, os campos já existem — o passo do arquivo não bloqueia nada.
  const camposLiberados = editando || arquivo !== null;
  const assinado = form.status === "Assinado";

  useEffect(() => {
    if (!documento) return;
    listarAcessosDoDocumento(documento.id).then((res) => {
      if (res.ok) setAcessos(res.data);
    });
  }, [documento]);

  function set<K extends keyof typeof form>(campo: K, valor: (typeof form)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  /** Preenche apenas o que está vazio — nunca sobrescreve o que já foi digitado. */
  function aplicarLeitura(dados: {
    nome: string | null;
    cliente: string | null;
    cnpj: string | null;
    tipo: string | null;
    resumo: string | null;
    data_documento: string | null;
    validade: string | null;
    periodo: string | null;
    setor: string | null;
  }) {
    setForm((f) => ({
      ...f,
      nome: f.nome || dados.nome || "",
      cliente: f.cliente || dados.cliente || "",
      cnpj: f.cnpj || dados.cnpj || "",
      tipo: f.tipo || dados.tipo || "",
      resumo: f.resumo || dados.resumo || "",
      data_documento: f.data_documento || dados.data_documento || "",
      validade: f.validade || dados.validade || "",
      periodo: f.periodo || dados.periodo || "",
      setor: (dados.setor as GedSetor) || f.setor,
    }));
  }

  async function receberArquivo(preparado: ArquivoPreparado, original: Blob, tipoOriginal: string) {
    setArquivo(preparado);
    setAvisoIa(null);

    if (editando) return; // na edição os campos já estão preenchidos

    if (original.size > TAMANHO_LEITURA_IA) {
      setAvisoIa("Arquivo grande demais para a leitura automática — preencha os campos abaixo.");
      return;
    }

    setLendo(true);
    try {
      const base64 = await paraBase64(original);
      const res = await lerDocumentoComIa(base64, tipoOriginal, original.size);
      if (res.ok) {
        aplicarLeitura(res.dados);
        setAvisoIa(
          res.dados.confianca === "alta"
            ? "Campos preenchidos pela leitura do documento. Confira antes de salvar."
            : "Leitura com confiança baixa — confira todos os campos com atenção."
        );
      } else {
        setAvisoIa(res.message);
      }
    } catch {
      setAvisoIa("Não foi possível ler o documento. Preencha os campos abaixo.");
    } finally {
      setLendo(false);
    }
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > TAMANHO_MAXIMO) {
      setErro(`O arquivo tem ${formatarBytes(file.size)}. O limite é 25 MB.`);
      e.target.value = "";
      return;
    }

    setErro(null);
    setPreparando(true);
    try {
      // A IA lê o original; o que sobe é a versão compactada.
      const preparado = await prepararArquivo(file, assinado);
      await receberArquivo(preparado, file, file.type);
    } catch {
      setErro("Não foi possível preparar o arquivo.");
    } finally {
      setPreparando(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!editando && !arquivo) {
      setErro("Anexe um arquivo ou tire uma foto do documento.");
      return;
    }

    iniciar(async () => {
      let storage_path: string | undefined;

      if (arquivo) {
        setProgresso("Enviando arquivo…");
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setErro("Sessão expirada. Entre novamente.");
          setProgresso(null);
          return;
        }

        const caminho = `${form.setor}/${new Date().getFullYear()}/${crypto.randomUUID()}-${arquivo.nome}`;
        const { error } = await supabase.storage.from("ged").upload(caminho, arquivo.blob, {
          contentType: arquivo.compressao === "gzip" ? "application/gzip" : arquivo.mimeType,
          upsert: false,
        });

        if (error) {
          setErro(
            error.message.includes("Bucket not found")
              ? "O armazenamento do GED não existe. Execute supabase/_manual_apply/005_ged_arquivos.sql."
              : "Falha ao enviar o arquivo. Tente novamente."
          );
          setProgresso(null);
          return;
        }
        storage_path = caminho;
      }

      setProgresso("Salvando documento…");
      const dados = {
        ...form,
        cnpj: form.cnpj || null,
        periodo: form.periodo || null,
        data_documento: form.data_documento || null,
        validade: form.validade || null,
        categoria: form.categoria || null,
        resumo: form.resumo || null,
        folder_id: form.folder_id || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        storage_path,
        mime_type: arquivo?.mimeType,
        tamanho_bytes: arquivo?.tamanhoFinal,
        tamanho_original_bytes: arquivo?.tamanhoOriginal,
        compressao: arquivo?.compressao,
        visibilidade,
        acessos: visibilidade === "restrito" ? acessos : [],
      };

      const res = documento
        ? await atualizarDocumento(documento.id, dados)
        : await criarDocumento(dados);

      setProgresso(null);
      if (!res.ok) {
        setErro(res.message);
        return;
      }
      router.push("/dashboard/ged/documentos");
      router.refresh();
    });
  }

  return (
    <>
      <form onSubmit={enviar} className="space-y-6">
        {/* ETAPA 1 — o arquivo vem primeiro: é dele que a leitura tira os campos */}
        <section className="neo-card p-5">
          <h2 className="mb-1 text-lg font-bold text-[var(--text)]">
            {editando ? "Arquivo" : "1. Comece pelo arquivo"}
          </h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            {editando
              ? "Escolha outro arquivo apenas se quiser substituir o atual."
              : "Assim que o arquivo entrar, o sistema lê o conteúdo e preenche o cadastro para você conferir."}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => inputArquivo.current?.click()}
              disabled={preparando || lendo}
              className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-60"
            >
              Escolher arquivo
            </button>
            <button
              type="button"
              onClick={() => setCamera(true)}
              disabled={preparando || lendo}
              className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-60"
            >
              Tirar foto
            </button>
            <input
              ref={inputArquivo}
              type="file"
              onChange={escolherArquivo}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.xml"
            />
          </div>

          <div className="mt-4 space-y-2">
            {preparando && <p className="text-sm text-[var(--muted)]">Preparando arquivo…</p>}
            {lendo && (
              <p className="text-sm font-semibold text-[var(--primary-strong)]">
                Lendo o documento para preencher o cadastro…
              </p>
            )}
            {arquivo && !preparando && (
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
                <p className="font-semibold text-[var(--text)]">{arquivo.nome}</p>
                <ResumoCompressao arquivo={arquivo} />
              </div>
            )}
            {!arquivo && !preparando && documento?.storage_path && (
              <p className="text-sm text-[var(--muted)]">Arquivo atual mantido.</p>
            )}
            {avisoIa && (
              <p className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--muted)]">
                {avisoIa}
              </p>
            )}
          </div>
        </section>

        {/* ETAPA 2 — só aparece depois que há arquivo */}
        {!camposLiberados ? (
          <p className="rounded-2xl border border-dashed border-[var(--stroke)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
            Os campos do cadastro aparecem assim que você escolher um arquivo ou tirar
            uma foto.
          </p>
        ) : (
          <>
            <section className="neo-card p-5">
              <h2 className="mb-1 text-lg font-bold text-[var(--text)]">
                {editando ? "Identificação" : "2. Confira os dados"}
              </h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Tudo aqui pode ser reescrito — o preenchimento automático é só um ponto de
                partida.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Nome do documento *" className="sm:col-span-2">
                  <input
                    required
                    value={form.nome}
                    onChange={(e) => set("nome", e.target.value)}
                    placeholder="Ex.: Contrato de prestação de serviços 2026"
                    className={entrada}
                  />
                </Campo>

                <Campo label="Cliente *">
                  <input
                    required
                    value={form.cliente}
                    onChange={(e) => set("cliente", e.target.value)}
                    className={entrada}
                  />
                </Campo>

                <Campo label="CNPJ">
                  <input
                    value={form.cnpj ?? ""}
                    onChange={(e) => set("cnpj", e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className={entrada}
                  />
                </Campo>

                <Campo label="Setor *">
                  <select
                    value={form.setor}
                    onChange={(e) => set("setor", e.target.value as GedSetor)}
                    className={entrada}
                  >
                    {GED_SETORES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Tipo *">
                  <input
                    required
                    value={form.tipo}
                    onChange={(e) => set("tipo", e.target.value)}
                    placeholder="Ex.: NF-e, Contrato, Holerite"
                    className={entrada}
                  />
                </Campo>

                <Campo label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => set("status", e.target.value as GedStatus)}
                    className={entrada}
                  >
                    {STATUS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Pasta">
                  <select
                    value={form.folder_id ?? ""}
                    onChange={(e) => set("folder_id", e.target.value)}
                    className={entrada}
                  >
                    <option value="">Sem pasta</option>
                    {pastas.map((p) => (
                      <option key={p.id} value={p.id}>{p.setor} — {p.nome}</option>
                    ))}
                  </select>
                </Campo>
              </div>
            </section>

            <section className="neo-card p-5">
              <h2 className="mb-4 text-lg font-bold text-[var(--text)]">
                Datas e classificação
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Campo label="Período">
                  <input
                    type="month"
                    value={form.periodo ?? ""}
                    onChange={(e) => set("periodo", e.target.value)}
                    className={entrada}
                  />
                </Campo>
                <Campo label="Data do documento">
                  <input
                    type="date"
                    value={form.data_documento ?? ""}
                    onChange={(e) => set("data_documento", e.target.value)}
                    className={entrada}
                  />
                </Campo>
                <Campo label="Validade">
                  <input
                    type="date"
                    value={form.validade ?? ""}
                    onChange={(e) => set("validade", e.target.value)}
                    className={entrada}
                  />
                </Campo>
                <Campo label="Categoria">
                  <input
                    value={form.categoria ?? ""}
                    onChange={(e) => set("categoria", e.target.value)}
                    placeholder="Ex.: Entrada"
                    className={entrada}
                  />
                </Campo>
                <Campo label="Etiquetas" className="sm:col-span-2 lg:col-span-4">
                  <input
                    value={form.tags}
                    onChange={(e) => set("tags", e.target.value)}
                    placeholder="separadas por vírgula: fiscal, 2026, urgente"
                    className={entrada}
                  />
                </Campo>
              </div>
            </section>

            <section className="neo-card p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[var(--text)]">Descrição</h2>
                <SuggestWithAi
                  fieldType="resumo_documento"
                  whatToSuggest="um resumo objetivo do documento para busca e consulta futura"
                  currentValue={form.resumo ?? ""}
                  context={{
                    nome: form.nome,
                    tipo: form.tipo,
                    cliente: form.cliente,
                    setor: form.setor,
                    categoria: form.categoria,
                    periodo: form.periodo,
                  }}
                  onAccept={(texto) => set("resumo", texto)}
                />
              </div>
              <textarea
                rows={4}
                value={form.resumo ?? ""}
                onChange={(e) => set("resumo", e.target.value)}
                placeholder="O que este documento contém e para que serve. Este texto alimenta a busca."
                className={entrada}
              />
            </section>

            <SeletorAcesso
              visibilidade={visibilidade}
              acessos={acessos}
              onVisibilidade={setVisibilidade}
              onAcessos={setAcessos}
            />

            {erro && (
              <p className="rounded-2xl bg-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                {erro}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={pendente || preparando || lendo}
                className="rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-bold text-white shadow-[10px_10px_18px_rgba(122,109,216,0.28)] disabled:opacity-60"
              >
                {progresso ?? (editando ? "Salvar alterações" : "Cadastrar documento")}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-full border border-[var(--stroke)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {!camposLiberados && erro && (
          <p className="rounded-2xl bg-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
            {erro}
          </p>
        )}
      </form>

      {camera && (
        <CapturaFoto
          onFechar={() => setCamera(false)}
          onCapturar={(a) => {
            setCamera(false);
            // A foto já vem reamostrada; é ela mesma que vai para a leitura.
            void receberArquivo(a, a.blob, a.mimeType);
          }}
        />
      )}
    </>
  );
}

const entrada =
  "mt-2 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/30";

function Campo({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
