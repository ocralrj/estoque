"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  definirAcessosDaEmpresa,
  excluirEmpresa,
  type Empresa,
} from "@/app/actions/certificados";
import Avatar from "@/components/ui/Avatar";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { IconeEditar, IconeExcluir, IconeVer } from "@/components/ui/IconesAcao";
import Tooltip from "@/components/ui/Tooltip";
import { formatarCnpj } from "@/lib/cnpj";
import { formatarCep } from "@/lib/empresas";
import FormularioEmpresa from "./FormularioEmpresa";
import LogoDaEmpresa from "./LogoDaEmpresa";

export interface PessoaSimples {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  cargo: string | null;
  /** true quando a pessoa alcança TODAS as empresas por permissão de grupo. */
  vetodas: boolean;
}

type Formulario = { modo: "novo" } | { modo: "editar"; empresa: Empresa } | null;

/**
 * Empresas e quem cuida de cada uma.
 *
 * São dois caminhos de acesso, e a distinção importa: quem cuida de empresas
 * específicas é marcado aqui, uma a uma; quem responde pelo assunto inteiro
 * recebe a permissão "Administrar" no grupo e alcança todas sem aparecer em
 * lista nenhuma. Misturar os dois faria a lista de uma empresa crescer com
 * gente que não cuida dela em particular.
 */
export default function EmpresasClient({
  empresas,
  pessoas,
  acessosPorEmpresa,
  certificadosPorEmpresa,
  podeAdministrar,
}: {
  empresas: Empresa[];
  pessoas: PessoaSimples[];
  acessosPorEmpresa: Record<string, string[]>;
  certificadosPorEmpresa: Record<string, number>;
  podeAdministrar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [formulario, setFormulario] = useState<Formulario>(null);
  const secaoDoFormulario = useRef<HTMLElement>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);

  const { confirmar, Dialogo } = useConfirmacao();
  const [vendo, setVendo] = useState<Empresa | null>(null);

  // Esc fecha a visualização, como na confirmação.
  useEffect(() => {
    if (!vendo) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setVendo(null);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [vendo]);

  async function excluir(empresa: Empresa) {
    const nome = empresa.nome_fantasia || empresa.razao_social;
    const quantos = certificadosPorEmpresa[empresa.id] ?? 0;

    // Com certificado, a exclusão não é oferecida: apagaria os certificados
    // junto. O diálogo só explica o que fazer.
    if (quantos > 0) {
      await confirmar({
        titulo: `Não é possível excluir "${nome}"`,
        mensagem: `Esta empresa tem ${quantos} certificado(s). Remova-os antes de excluir a empresa.`,
        rotuloConfirmar: "Entendi",
        rotuloCancelar: "Fechar",
      });
      return;
    }

    const ok = await confirmar({
      titulo: `Excluir a empresa "${nome}"?`,
      mensagem:
        "Ela não tem certificados. Quem cuida dela perde o vínculo. A exclusão não pode ser desfeita.",
      rotuloConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;

    setAviso(null);
    iniciar(async () => {
      const res = await excluirEmpresa(empresa.id);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      if (formulario?.modo === "editar" && formulario.empresa.id === empresa.id) setFormulario(null);
      setAviso({ tipo: "ok", texto: `Empresa "${empresa.razao_social}" excluída.` });
      router.refresh();
    });
  }

  const semRestricao = pessoas.filter((p) => p.vetodas);
  const restritas = pessoas.filter((p) => !p.vetodas);

  function abrirEdicao(empresa: Empresa) {
    setAviso(null);
    setFormulario({ modo: "editar", empresa });
    requestAnimationFrame(() =>
      secaoDoFormulario.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  /** Fecha o formulário e leva até a empresa já cadastrada. */
  function verEmpresa(id: string) {
    setFormulario(null);
    setDestaque(id);
    requestAnimationFrame(() =>
      document
        .getElementById(`empresa-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  }

  function aoSalvar(empresa: Empresa) {
    const editada = formulario?.modo === "editar";
    setFormulario(null);
    setDestaque(empresa.id);
    setAviso({
      tipo: "ok",
      texto: `Empresa "${empresa.razao_social}" ${editada ? "atualizada" : "cadastrada"}.`,
    });
    router.refresh();
  }

  function salvarAcessos(empresaId: string) {
    setAviso(null);
    iniciar(async () => {
      const res = await definirAcessosDaEmpresa(empresaId, marcados);
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: res.message });
        return;
      }
      setEditando(null);
      setAviso({
        tipo: "ok",
        texto:
          marcados.length === 0
            ? "Nenhuma pessoa marcada. Só quem administra todos os certificados alcança esta empresa."
            : `${marcados.length} pessoa(s) passam a alcançar os certificados desta empresa.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
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

      {semRestricao.length > 0 && (
        <section className="neo-card p-5">
          <h2 className="text-lg font-bold text-[var(--text)]">
            Quem alcança todas as empresas
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Por terem &quot;Administrar&quot; em Certificados no grupo. Não precisam
            ser marcados empresa por empresa.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {semRestricao.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1.5"
              >
                <Avatar nome={p.nome} email={p.email} url={p.avatar_url} tamanho={24} />
                <span className="text-sm text-[var(--text)]">{p.nome}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeAdministrar && (
        <section ref={secaoDoFormulario} className="neo-card scroll-mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">
                {formulario?.modo === "editar"
                  ? `Editando ${formulario.empresa.razao_social}`
                  : `${empresas.length} empresa(s)`}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {formulario?.modo === "editar"
                  ? "Informar o CNPJ aqui consulta a Receita e completa o cadastro."
                  : "Clientes e fornecedores, com ou sem CNPJ. Quem cuida de cada uma abre o certificado."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAviso(null);
                setFormulario((f) => (f ? null : { modo: "novo" }));
              }}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
            >
              {formulario ? "Cancelar" : "Nova empresa"}
            </button>
          </div>

          {formulario && (
            <FormularioEmpresa
              // A chave recria o formulário ao trocar de empresa: sem ela, os
              // campos da anterior ficariam na tela.
              key={formulario.modo === "editar" ? formulario.empresa.id : "nova"}
              empresa={formulario.modo === "editar" ? formulario.empresa : undefined}
              onSalva={aoSalvar}
              onCancelar={() => setFormulario(null)}
              onVerEmpresa={verEmpresa}
            />
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {empresas.map((e) => {
          const cuidam = acessosPorEmpresa[e.id] ?? [];
          const local = [e.municipio, e.uf].filter(Boolean).join("/");
          const contato = [e.telefone, e.email].filter(Boolean).join(" · ");
          // As cores da marca só entram na faixa, no quadro da logo e no
          // sublinhado do site: o texto continua nos tokens, com o contraste
          // garantido nos dois temas.
          const cor = e.cor_primaria;
          return (
            <div
              key={e.id}
              id={`empresa-${e.id}`}
              className={`neo-card relative scroll-mt-4 overflow-hidden p-5 ${
                destaque === e.id ? "ring-2 ring-[var(--primary)]" : ""
              }`}
            >
              {cor && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ background: `linear-gradient(90deg, ${cor}, ${e.cor_secundaria ?? cor})` }}
                />
              )}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <LogoDaEmpresa
                    nome={e.nome_fantasia || e.razao_social}
                    logoUrl={e.logo_url}
                    cor={cor}
                  />
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-[var(--text)]">
                      {e.razao_social}
                    </h3>
                    {e.nome_fantasia && (
                      <p className="truncate text-sm text-[var(--muted)]">
                        {e.nome_fantasia}
                      </p>
                    )}
                    {e.cnpj && (
                      <p className="font-mono text-xs text-[var(--muted)]">{formatarCnpj(e.cnpj)}</p>
                    )}
                    {local && <p className="text-xs text-[var(--muted)]">{local}</p>}
                    {contato && <p className="truncate text-xs text-[var(--muted)]">{contato}</p>}
                    {e.site && (
                      <a
                        href={`https://${e.site}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={cor ? { textDecorationColor: cor } : undefined}
                        className="mt-0.5 block truncate text-xs font-semibold text-[var(--text)] underline decoration-2 underline-offset-2"
                      >
                        {e.site} <span aria-hidden>↗</span>
                      </a>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.e_cliente && <span className={etiqueta}>Cliente</span>}
                      {e.e_fornecedor && <span className={etiqueta}>Fornecedor</span>}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--primary-strong)]">
                    {certificadosPorEmpresa[e.id] ?? 0} certificado(s)
                  </span>
                  <div className="flex gap-2">
                    <Tooltip lado="cima" texto="Visualizar">
                      <button
                        type="button"
                        onClick={() => setVendo(e)}
                        aria-label={`Visualizar ${e.razao_social}`}
                        className={botaoDeAcao}
                      >
                        <IconeVer />
                      </button>
                    </Tooltip>
                    {podeAdministrar && (
                      <Tooltip lado="cima" texto="Editar">
                        <button
                          type="button"
                          disabled={pendente}
                          onClick={() => abrirEdicao(e)}
                          aria-label={`Editar ${e.razao_social}`}
                          className={botaoDeAcao}
                        >
                          <IconeEditar />
                        </button>
                      </Tooltip>
                    )}
                    {podeAdministrar && (
                      <Tooltip
                        lado="cima"
                        texto={
                          (certificadosPorEmpresa[e.id] ?? 0) > 0
                            ? `Tem ${certificadosPorEmpresa[e.id]} certificado(s): não pode ser excluída`
                            : "Excluir"
                        }
                      >
                        <button
                          type="button"
                          disabled={pendente}
                          onClick={() => excluir(e)}
                          aria-label={`Excluir ${e.razao_social}`}
                          className={`${botaoDeAcao} !text-[var(--erro-fg)]`}
                        >
                          <IconeExcluir />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-[var(--stroke)] pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Cuidam desta empresa
                </p>

                {editando === e.id ? (
                  <>
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                      {restritas.map((p) => (
                        <li key={p.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--text)] hover:bg-[var(--surface)]">
                            <input
                              type="checkbox"
                              checked={marcados.includes(p.id)}
                              onChange={() =>
                                setMarcados((atual) =>
                                  atual.includes(p.id)
                                    ? atual.filter((x) => x !== p.id)
                                    : [...atual, p.id]
                                )
                              }
                            />
                            <Avatar
                              nome={p.nome}
                              email={p.email}
                              url={p.avatar_url}
                              tamanho={26}
                            />
                            <span className="truncate">
                              {p.nome}
                              {p.cargo && (
                                <span className="text-[var(--muted)]"> · {p.cargo}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                      {restritas.length === 0 && (
                        <li className="py-2 text-sm text-[var(--muted)]">
                          Todo mundo já alcança todas as empresas pelo grupo.
                        </li>
                      )}
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => salvarAcessos(e.id)}
                        disabled={pendente}
                        className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--on-accent)] disabled:opacity-60"
                      >
                        {pendente ? "Salvando…" : "Salvar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        className="text-xs font-semibold text-[var(--muted)] hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {cuidam.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {cuidam.map((id) => {
                          const p = pessoas.find((x) => x.id === id);
                          if (!p) return null;
                          return (
                            <li
                              key={id}
                              className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-2.5 py-1"
                            >
                              <Avatar
                                nome={p.nome}
                                email={p.email}
                                url={p.avatar_url}
                                tamanho={22}
                              />
                              <span className="text-xs text-[var(--text)]">{p.nome}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        Ninguém em particular. Só quem administra todos os
                        certificados alcança esta empresa.
                      </p>
                    )}

                    {podeAdministrar && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(e.id);
                          setMarcados(cuidam);
                        }}
                        className="neo-button mt-3 rounded-full px-4 py-2 text-xs font-bold text-[var(--text)]"
                      >
                        Definir quem cuida
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {empresas.length === 0 && (
        <p className="neo-card p-10 text-center text-sm text-[var(--muted)]">
          Nenhuma empresa cadastrada. Ela também é criada sozinha quando um
          certificado é enviado para uma empresa que ainda não existe.
        </p>
      )}

      {vendo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="janela-empresa-titulo"
          onClick={() => setVendo(null)}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center"
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            className="neo-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <VisualizacaoDaEmpresa
              empresa={vendo}
              certificados={certificadosPorEmpresa[vendo.id] ?? 0}
              cuidam={(acessosPorEmpresa[vendo.id] ?? [])
                .map((id) => pessoas.find((p) => p.id === id)?.nome)
                .filter((n): n is string => Boolean(n))}
              podeEditar={podeAdministrar}
              aoEditar={() => {
                const empresa = vendo;
                setVendo(null);
                abrirEdicao(empresa);
              }}
              aoFechar={() => setVendo(null)}
            />
          </div>
        </div>
      )}

      <Dialogo />
    </div>
  );
}

/** Todos os dados da empresa, só para leitura. */
function VisualizacaoDaEmpresa({
  empresa: e,
  certificados,
  cuidam,
  podeEditar,
  aoEditar,
  aoFechar,
}: {
  empresa: Empresa;
  certificados: number;
  cuidam: string[];
  podeEditar: boolean;
  aoEditar: () => void;
  aoFechar: () => void;
}) {
  const endereco = [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.complemento,
    e.bairro,
    [e.municipio, e.uf].filter(Boolean).join("/"),
    e.cep ? `CEP ${formatarCep(e.cep)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const relacionamento = [e.e_cliente && "Cliente", e.e_fornecedor && "Fornecedor"].filter(Boolean).join(" e ");

  const linhas: [string, React.ReactNode][] = [
    ["CNPJ", e.cnpj ? <span className="font-mono">{formatarCnpj(e.cnpj)}</span> : null],
    ["Relacionamento", relacionamento],
    ["Situação cadastral", e.situacao_cadastral],
    ["Atividade principal", e.atividade_principal],
    ["Endereço", endereco],
    ["E-mail", e.email],
    ["Telefone", e.telefone],
    [
      "Site",
      e.site ? (
        <a href={`https://${e.site}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          {e.site} <span aria-hidden>↗</span>
        </a>
      ) : null,
    ],
    [
      "Cores",
      e.cor_primaria ? (
        <span className="flex flex-wrap gap-3">
          {[e.cor_primaria, e.cor_secundaria].filter(Boolean).map((cor) => (
            <span key={cor} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-4 w-4 rounded-full border border-[var(--stroke)]"
                style={{ background: cor as string }}
              />
              <span className="font-mono text-xs">{cor}</span>
            </span>
          ))}
        </span>
      ) : null,
    ],
    ["Quem cuida", cuidam.length ? cuidam.join(", ") : "Ninguém em particular"],
    ["Certificados", String(certificados)],
    ["Observação", e.observacao],
  ];

  return (
    <div className="space-y-4">
      {e.cor_primaria && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: `linear-gradient(90deg, ${e.cor_primaria}, ${e.cor_secundaria ?? e.cor_primaria})` }}
        />
      )}
      <div className="flex items-start gap-3">
        <LogoDaEmpresa nome={e.nome_fantasia || e.razao_social} logoUrl={e.logo_url} cor={e.cor_primaria} tamanho={64} />
        <div className="min-w-0">
          <h2 id="janela-empresa-titulo" className="text-lg font-bold text-[var(--text)]">
            {e.razao_social}
          </h2>
          {e.nome_fantasia && <p className="text-sm text-[var(--muted)]">{e.nome_fantasia}</p>}
        </div>
      </div>

      <dl className="space-y-3">
        {linhas
          .filter(([, valor]) => valor)
          .map(([nome, valor]) => (
            <div key={nome}>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{nome}</dt>
              <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-[var(--text)]">{valor}</dd>
            </div>
          ))}
      </dl>

      <div className="flex flex-col-reverse gap-2 border-t border-[var(--stroke)] pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={aoFechar}
          className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
        >
          Fechar
        </button>
        {podeEditar && (
          <button
            type="button"
            onClick={aoEditar}
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)]"
          >
            Editar
          </button>
        )}
      </div>
    </div>
  );
}

const botaoDeAcao =
  "neo-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] disabled:opacity-50";

const etiqueta =
  "rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text)]";
