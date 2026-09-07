"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  criarEmpresa,
  excluirCertificado,
  registrarCertificado,
  urlDoCertificado,
  type Certificado,
  type Empresa,
} from "@/app/actions/certificados";
import { lerCer, lerPfx, situacaoDaValidade, type DadosDoCertificado } from "@/lib/certificados/leitura";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import Tooltip from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/labels";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

/**
 * Certificados digitais das empresas.
 *
 * A senha do arquivo é digitada aqui e usada AQUI: ela abre o .pfx no
 * navegador, os dados são lidos de dentro dele, e ela é descartada. Nunca vai
 * para o servidor. O que sobe é o arquivo e o que o certificado diz de si —
 * titular, CNPJ, emissor e validade — em vez de campos digitados à mão, que é
 * onde a data de vencimento costuma sair errada.
 */
export default function CertificadosClient({
  certificados,
  empresas,
  podeEnviar,
  podeExcluir,
}: {
  certificados: Certificado[];
  empresas: Empresa[];
  podeEnviar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { confirmar, Dialogo } = useConfirmacao();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  const [abrindoEnvio, setAbrindoEnvio] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [lidos, setLidos] = useState<DadosDoCertificado | null>(null);
  const [empresaId, setEmpresaId] = useState("");
  const [novaEmpresa, setNovaEmpresa] = useState("");
  const [observacao, setObservacao] = useState("");

  const ehPfx = arquivo?.name.toLowerCase().match(/\.(pfx|p12)$/) != null;

  const porVencimento = useMemo(
    () =>
      [...certificados].sort(
        (a, b) => a.validade_fim.localeCompare(b.validade_fim)
      ),
    [certificados]
  );

  async function ler() {
    if (!arquivo) return;
    setAviso(null);
    setEnviando(true);
    try {
      const dados = ehPfx ? await lerPfx(arquivo, senha) : await lerCer(arquivo);
      setLidos(dados);
      // O CNPJ lido do certificado escolhe a empresa sozinho, quando ela já
      // está cadastrada: é o dado mais confiável que temos para casar os dois.
      const casada = dados.documento
        ? empresas.find((e) => e.cnpj === dados.documento)
        : null;
      if (casada) setEmpresaId(casada.id);
      else if (dados.titular) setNovaEmpresa(dados.titular);
    } catch (e) {
      setLidos(null);
      setAviso({
        tipo: "erro",
        texto: e instanceof Error ? e.message : "Não foi possível ler o arquivo.",
      });
    } finally {
      setEnviando(false);
    }
  }

  function enviar() {
    if (!arquivo || !lidos) return;
    setAviso(null);

    iniciar(async () => {
      setEnviando(true);
      try {
        let alvo = empresaId;

        if (!alvo) {
          if (novaEmpresa.trim().length < 2) {
            setAviso({ tipo: "erro", texto: "Escolha ou cadastre a empresa." });
            return;
          }
          const criada = await criarEmpresa({
            razaoSocial: novaEmpresa,
            cnpj: lidos.documento ?? undefined,
          });
          if (!criada.ok) {
            setAviso({ tipo: "erro", texto: criada.message });
            return;
          }
          alvo = criada.data.id;
        }

        // O caminho começa pelo id da empresa: é o prefixo que a política do
        // bucket usa para decidir quem alcança o arquivo.
        const caminho = `${alvo}/${crypto.randomUUID()}-${arquivo.name.replace(
          /[^A-Za-z0-9._-]/g,
          "-"
        )}`;

        const supabase = createClient();
        const { error: erroEnvio } = await supabase.storage
          .from("certificados")
          .upload(caminho, arquivo, { upsert: false });

        if (erroEnvio) {
          setAviso({
            tipo: "erro",
            texto: `Não foi possível enviar o arquivo: ${erroEnvio.message}`,
          });
          return;
        }

        const res = await registrarCertificado({
          empresaId: alvo,
          titular: lidos.titular,
          documento: lidos.documento,
          emissor: lidos.emissor,
          numeroSerie: lidos.numeroSerie,
          validadeInicio: lidos.validadeInicio,
          validadeFim: lidos.validadeFim,
          tipo: ehPfx ? "A1" : "A3",
          observacao,
          storagePath: caminho,
          nomeArquivo: arquivo.name,
          tamanhoBytes: arquivo.size,
        });

        if (!res.ok) {
          setAviso({ tipo: "erro", texto: res.message });
          return;
        }

        // A senha some da memória junto com o resto do formulário.
        setArquivo(null);
        setSenha("");
        setLidos(null);
        setEmpresaId("");
        setNovaEmpresa("");
        setObservacao("");
        setAbrindoEnvio(false);
        setAviso({
          tipo: "ok",
          texto: `Certificado de ${lidos.titular} guardado. A senha não foi salva — ela continua só com o titular.`,
        });
        router.refresh();
      } finally {
        setEnviando(false);
      }
    });
  }

  async function baixar(c: Certificado) {
    setAviso(null);
    setBaixando(c.id);
    try {
      const res = await urlDoCertificado(c.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      const a = document.createElement("a");
      a.href = res.data.url;
      a.download = res.data.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setAviso({
        tipo: "ok",
        texto:
          "Download iniciado e registrado. Para instalar: dê dois cliques no arquivo e informe a senha do certificado — ela não fica guardada aqui.",
      });
    } finally {
      setBaixando(null);
    }
  }

  async function excluir(c: Certificado) {
    const ok = await confirmar({
      titulo: `Excluir o certificado de ${c.titular}?`,
      mensagem:
        "O arquivo sai do cofre junto com o registro, e a ação não pode ser desfeita. O histórico de quem o baixou também some.",
      rotuloConfirmar: "Excluir certificado",
      perigo: true,
    });
    if (!ok) return;

    iniciar(async () => {
      const res = await excluirCertificado(c.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setAviso({ tipo: "ok", texto: "Certificado excluído." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Dialogo />

      {aviso && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {podeEnviar && (
        <section className="neo-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">
                Guardar um certificado
              </h2>
              <p className="text-sm text-[var(--muted)]">
                A senha é usada aqui no navegador para ler os dados e não é gravada
                em lugar nenhum.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAbrindoEnvio((a) => !a)}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              {abrindoEnvio ? "Cancelar" : "Enviar certificado"}
            </button>
          </div>

          {abrindoEnvio && (
            <div className="mt-4 space-y-4 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
              <div>
                <label className={rotulo}>1. O arquivo</label>
                <input
                  type="file"
                  accept=".pfx,.p12,.cer,.crt"
                  onChange={(e) => {
                    setArquivo(e.target.files?.[0] ?? null);
                    setLidos(null);
                  }}
                  className="mt-1 block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--neo-flat)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--text)]"
                />
              </div>

              {arquivo && ehPfx && (
                <div>
                  <label className={rotulo}>2. A senha do certificado</label>
                  <input
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Usada só para ler os dados"
                    className={campo}
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Ela abre o arquivo aqui no seu navegador e é descartada. Não é
                    enviada nem guardada — quem for instalar vai digitá-la de novo.
                  </p>
                </div>
              )}

              {arquivo && !lidos && (
                <button
                  type="button"
                  onClick={ler}
                  disabled={enviando || (ehPfx && !senha)}
                  className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-50"
                >
                  {enviando ? "Lendo…" : "Ler o certificado"}
                </button>
              )}

              {lidos && (
                <>
                  <div className="rounded-2xl bg-[var(--neo-bg)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Lido de dentro do arquivo
                    </p>
                    <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <Dado rotulo="Titular" valor={lidos.titular} />
                      <Dado rotulo="Documento" valor={lidos.documento ?? "não informado"} />
                      <Dado rotulo="Emissor" valor={lidos.emissor ?? "—"} />
                      <Dado
                        rotulo="Validade"
                        valor={`${lidos.validadeInicio ? formatDate(lidos.validadeInicio) + " a " : ""}${formatDate(lidos.validadeFim)}`}
                      />
                    </dl>
                    {lidos.diasParaVencer < 30 && (
                      <p className="mt-3 rounded-xl bg-[var(--erro-bg)] px-3 py-2 text-sm text-[var(--erro-fg)]">
                        {lidos.diasParaVencer < 0
                          ? `Atenção: este certificado venceu há ${Math.abs(lidos.diasParaVencer)} dia(s).`
                          : `Atenção: vence em ${lidos.diasParaVencer} dia(s).`}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={rotulo}>3. De qual empresa é</label>
                    <select
                      value={empresaId}
                      onChange={(e) => setEmpresaId(e.target.value)}
                      className={campo}
                    >
                      <option value="">Cadastrar como empresa nova</option>
                      {empresas.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.razao_social}
                          {e.cnpj ? ` — ${e.cnpj}` : ""}
                        </option>
                      ))}
                    </select>

                    {!empresaId && (
                      <input
                        value={novaEmpresa}
                        onChange={(e) => setNovaEmpresa(e.target.value)}
                        placeholder="Razão social da empresa"
                        className={`${campo} mt-2`}
                      />
                    )}
                  </div>

                  <div>
                    <label className={rotulo}>Observação</label>
                    <input
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Opcional — onde este certificado é usado, por exemplo"
                      className={campo}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={enviar}
                    disabled={pendente || enviando}
                    className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-50"
                  >
                    {enviando ? "Guardando…" : "Guardar certificado"}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {porVencimento.map((c) => {
          const sit = situacaoDaValidade(c.validade_fim);
          return (
            <div key={c.id} className="neo-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-[var(--text)]">
                    {c.empresa?.razao_social ?? "Empresa não identificada"}
                  </h3>
                  <p className="truncate text-sm text-[var(--muted)]">{c.titular}</p>
                </div>
                <span className={sit.classe}>{sit.texto}</span>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                <Dado rotulo="Documento" valor={c.documento ?? "—"} />
                <Dado rotulo="Tipo" valor={c.tipo} />
                <Dado rotulo="Válido até" valor={formatDate(c.validade_fim)} />
                <Dado rotulo="Emissor" valor={c.emissor ?? "—"} />
              </dl>

              {c.observacao && (
                <p className="mt-2 text-sm text-[var(--muted)]">{c.observacao}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--stroke)] pt-3">
                {c.storage_path ? (
                  <Tooltip
                    lado="cima"
                    texto="Baixa o arquivo e registra quem o levou. Para instalar, dê dois cliques nele e informe a senha do certificado."
                  >
                    <button
                      type="button"
                      onClick={() => baixar(c)}
                      disabled={baixando === c.id}
                      className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--on-accent)] disabled:opacity-50"
                    >
                      {baixando === c.id ? "Preparando…" : "Baixar para instalar"}
                    </button>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-[var(--muted)]">
                    Sem arquivo guardado — só o controle de validade.
                  </span>
                )}

                {podeExcluir && (
                  <button
                    type="button"
                    onClick={() => excluir(c)}
                    disabled={pendente}
                    className="rounded-full bg-[var(--danger)] px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-50"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {certificados.length === 0 && (
        <p className="neo-card p-10 text-center text-sm text-[var(--muted)]">
          Nenhum certificado guardado. Os que aparecem aqui são das empresas que
          você acompanha.
        </p>
      )}
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
        {rotulo}
      </dt>
      <dd className="truncate font-semibold text-[var(--text)]">{valor}</dd>
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
