"use client";

import { useEffect, useRef, useState } from "react";
import {
  atualizarEmpresa,
  consultarEmpresaPorCnpj,
  criarEmpresa,
  lerIdentidadeDoSite,
  procurarSiteDaEmpresa,
  type DadosDaEmpresa,
  type Empresa,
  type EmpresaParecida,
  type IdentidadeVisual,
} from "@/app/actions/certificados";
import { useConfirmacao } from "@/components/ui/Confirmacao";
import { cnpjValido, formatarCnpj, normalizarCnpj } from "@/lib/cnpj";
import { formatarCep, formatarTelefone, normalizarSite, siteValido } from "@/lib/empresas";
import LogoDaEmpresa from "./LogoDaEmpresa";

interface Campos {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  eCliente: boolean;
  eFornecedor: boolean;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  email: string;
  telefone: string;
  situacaoCadastral: string;
  atividadePrincipal: string;
  observacao: string;
  site: string;
  logoUrl: string;
  corPrimaria: string;
  corSecundaria: string;
}

type CampoDeTexto = Exclude<keyof Campos, "eCliente" | "eFornecedor">;

/** O que a consulta preenche, com o nome usado no aviso de conflito. */
const PREENCHIDOS_PELA_CONSULTA: [keyof DadosDaEmpresa, string][] = [
  ["razaoSocial", "Razão social"],
  ["nomeFantasia", "Nome fantasia"],
  ["cep", "CEP"],
  ["logradouro", "Logradouro"],
  ["numero", "Número"],
  ["complemento", "Complemento"],
  ["bairro", "Bairro"],
  ["municipio", "Cidade"],
  ["uf", "UF"],
  ["email", "E-mail"],
  ["telefone", "Telefone"],
  ["situacaoCadastral", "Situação cadastral"],
  ["atividadePrincipal", "Atividade principal"],
];

const FALHA_NA_CONSULTA =
  "Não foi possível consultar o CNPJ agora. Preencha os dados manualmente.";

type Situacao =
  | { tipo: "consultando" }
  | { tipo: "info" | "erro"; texto: string; outraEmpresa?: string };

type SituacaoDoSite = { tipo: "procurando" | "lendo" } | { tipo: "info" | "erro"; texto: string };

function camposIniciais(e?: Empresa): Campos {
  return {
    cnpj: formatarCnpj(e?.cnpj ?? ""),
    razaoSocial: e?.razao_social ?? "",
    nomeFantasia: e?.nome_fantasia ?? "",
    // Empresa nova começa sem classificação: é uma escolha, não um padrão.
    eCliente: e?.e_cliente ?? false,
    eFornecedor: e?.e_fornecedor ?? false,
    cep: formatarCep(e?.cep ?? ""),
    logradouro: e?.logradouro ?? "",
    numero: e?.numero ?? "",
    complemento: e?.complemento ?? "",
    bairro: e?.bairro ?? "",
    municipio: e?.municipio ?? "",
    uf: e?.uf ?? "",
    email: e?.email ?? "",
    telefone: e?.telefone ?? "",
    situacaoCadastral: e?.situacao_cadastral ?? "",
    atividadePrincipal: e?.atividade_principal ?? "",
    observacao: e?.observacao ?? "",
    site: e?.site ?? "",
    logoUrl: e?.logo_url ?? "",
    corPrimaria: e?.cor_primaria ?? "",
    corSecundaria: e?.cor_secundaria ?? "",
  };
}

/** O que a busca do site usa; igual à anterior, não há por que buscar de novo. */
function chaveDaBusca(c: Campos): string {
  return [c.razaoSocial, c.nomeFantasia, c.email, normalizarCnpj(c.cnpj)]
    .map((v) => v.trim().toUpperCase())
    .join("|");
}

function resumoDaIdentidade(i: IdentidadeVisual): string {
  const partes = [i.logoUrl ? "logo" : null, i.corPrimaria ? "cores" : null].filter(Boolean);
  return partes.length
    ? `${partes.join(" e ")} lidas do site`.replace(/^./, (c) => c.toUpperCase())
    : "O site não tem logo nem cores reconhecíveis; ajuste as cores, se quiser";
}

/**
 * Cadastro e edição de empresa.
 *
 * O CNPJ vem primeiro porque, quando existe, ele preenche quase todo o resto.
 * Mas é opcional: um fornecedor pode entrar só com nome e telefone e ganhar o
 * CNPJ depois — e é nessa hora, na edição, que a consulta completa o cadastro.
 *
 * A consulta nunca passa por cima do que alguém digitou: campo vazio, ou
 * preenchido por ela mesma, é atualizado direto; campo com outro valor só muda
 * se a pessoa confirmar.
 *
 * O site é procurado sozinho quando o nome, o e-mail ou o CNPJ mudam e ele
 * ainda está vazio; dele saem a logo e as cores do cartão. Abrir a edição não
 * procura nada.
 */
export default function FormularioEmpresa({
  empresa,
  onSalva,
  onCancelar,
  onVerEmpresa,
}: {
  empresa?: Empresa;
  onSalva: (empresa: Empresa) => void;
  onCancelar: () => void;
  /** Leva à empresa já cadastrada, quando a nova parece ser ela. */
  onVerEmpresa: (id: string) => void;
}) {
  const editando = Boolean(empresa);
  const idDaEmpresa = empresa?.id;
  const { confirmar, Dialogo } = useConfirmacao();

  const [campos, setCampos] = useState<Campos>(() => camposIniciais(empresa));
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [saiuDoCnpj, setSaiuDoCnpj] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [parecidas, setParecidas] = useState<EmpresaParecida[]>([]);
  const [situacaoDoSite, setSituacaoDoSite] = useState<SituacaoDoSite | null>(null);
  const [pedidoDeBusca, setPedidoDeBusca] = useState({ vez: 0, manual: false });

  // A resposta da consulta chega depois; ela precisa comparar com o que está
  // na tela naquele momento, e não com o que estava quando saiu.
  const camposAtuais = useRef(campos);
  useEffect(() => {
    camposAtuais.current = campos;
  }, [campos]);

  // Só consulta quando o CNPJ muda: abrir a edição não reescreve nada.
  const cnpjAlterado = useRef(false);
  /** Valores que a consulta escreveu, campo a campo. */
  const automaticos = useRef<Partial<Record<CampoDeTexto, string>>>({});
  /** O site foi digitado — e não preenchido pela busca, que já traz a identidade. */
  const siteDigitadoAgora = useRef(false);
  const ultimaBusca = useRef(chaveDaBusca(campos));

  const cnpjDigitado = normalizarCnpj(campos.cnpj);
  const cnpjOk = cnpjValido(cnpjDigitado);
  const cnpjInvalido =
    cnpjDigitado.length > 0 && !cnpjOk && (cnpjDigitado.length === 14 || saiuDoCnpj);
  const consultando = situacao?.tipo === "consultando";
  const cnpjDeOutraEmpresa = situacao?.tipo === "erro" ? situacao.outraEmpresa : undefined;

  const siteNormalizado = normalizarSite(campos.site);
  const siteInvalido = campos.site.trim().length > 0 && !siteValido(siteNormalizado);
  const trabalhandoNoSite =
    situacaoDoSite?.tipo === "procurando" || situacaoDoSite?.tipo === "lendo";

  function set<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  function pedirBuscaDoSite(manual: boolean) {
    setPedidoDeBusca((p) => ({ vez: p.vez + 1, manual }));
  }

  function aplicarIdentidade(i: IdentidadeVisual) {
    setCampos((c) => ({
      ...c,
      site: i.site,
      logoUrl: i.logoUrl ?? "",
      corPrimaria: i.corPrimaria ?? "",
      corSecundaria: i.corSecundaria ?? "",
    }));
  }

  useEffect(() => {
    if (!cnpjAlterado.current) return;
    if (!cnpjValido(cnpjDigitado)) {
      setSituacao(null);
      return;
    }

    let cancelado = false;

    /** Apaga o que a consulta anterior escreveu e ninguém mexeu depois. */
    function limparAutomaticos() {
      const limpar: Partial<Campos> = {};
      for (const [campo, valor] of Object.entries(automaticos.current) as [CampoDeTexto, string][]) {
        if (camposAtuais.current[campo] === valor) limpar[campo] = "";
      }
      automaticos.current = {};
      setCampos((c) => ({ ...c, ...limpar }));
    }

    async function aplicar(dados: DadosDaEmpresa) {
      const atuais = camposAtuais.current;
      const livres: Partial<Record<CampoDeTexto, string>> = {};
      const conflitos: { campo: CampoDeTexto; rotulo: string; atual: string; novo: string }[] = [];

      for (const [campo, rotulo] of PREENCHIDOS_PELA_CONSULTA) {
        const novo = campo === "cep" ? formatarCep(dados.cep) : dados[campo];
        if (!novo) continue;
        const atual = atuais[campo];
        if (!atual || atual === novo || atual === automaticos.current[campo]) livres[campo] = novo;
        else conflitos.push({ campo, rotulo, atual, novo });
      }

      let escolhidos = livres;
      if (conflitos.length > 0) {
        const substituir = await confirmar({
          titulo: "A consulta trouxe dados diferentes",
          mensagem:
            "Estes campos já tinham outro valor:\n\n" +
            conflitos.map((c) => `${c.rotulo}: "${c.atual}" → "${c.novo}"`).join("\n"),
          rotuloConfirmar: "Usar os da consulta",
          rotuloCancelar: "Manter os atuais",
        });
        if (cancelado) return;
        if (substituir) {
          escolhidos = { ...livres, ...Object.fromEntries(conflitos.map((c) => [c.campo, c.novo])) };
        }
      }

      automaticos.current = { ...automaticos.current, ...escolhidos };
      setCampos((c) => ({ ...c, ...escolhidos }));
    }

    const espera = setTimeout(async () => {
      setSituacao({ tipo: "consultando" });
      const res = await consultarEmpresaPorCnpj(cnpjDigitado).catch(() => null);
      if (cancelado) return;

      if (!res || !res.ok) {
        const invalido = res?.message.startsWith("CNPJ inválido");
        setSituacao({ tipo: "erro", texto: invalido ? res!.message : FALHA_NA_CONSULTA });
        return;
      }

      if (!res.data) {
        limparAutomaticos();
        setSituacao({ tipo: "erro", texto: "CNPJ não encontrado. Verifique o número informado." });
        return;
      }

      const achada = res.data;
      if (achada.empresaId && achada.empresaId !== idDaEmpresa) {
        setSituacao({
          tipo: "erro",
          texto: `Este CNPJ já está cadastrado: ${achada.nome}.`,
          outraEmpresa: achada.empresaId,
        });
        return;
      }
      if (achada.empresaId) {
        setSituacao({ tipo: "info", texto: "É o CNPJ já gravado nesta empresa." });
        return;
      }

      await aplicar(achada.dados);
      if (cancelado) return;
      // Com nome e e-mail da Receita na tela, o site pode ser procurado.
      pedirBuscaDoSite(false);

      const s = achada.dados.situacaoCadastral;
      setSituacao(
        s && s.toUpperCase() !== "ATIVA"
          ? { tipo: "erro", texto: `Dados preenchidos pela consulta. Atenção: situação cadastral ${s}.` }
          : { tipo: "info", texto: "Dados preenchidos pela consulta. Confira antes de salvar." }
      );
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [cnpjDigitado, idDaEmpresa, confirmar]);

  // Procura do site: automática com o site vazio e dados novos; pelo botão, sempre.
  useEffect(() => {
    if (pedidoDeBusca.vez === 0) return;
    const c = camposAtuais.current;
    const chave = chaveDaBusca(c);

    if (!pedidoDeBusca.manual && (c.site.trim() || chave === ultimaBusca.current)) return;
    if (!c.razaoSocial.trim() && !c.nomeFantasia.trim() && !c.email.includes("@")) {
      if (pedidoDeBusca.manual) {
        setSituacaoDoSite({ tipo: "erro", texto: "Informe o nome ou o e-mail da empresa para procurar o site." });
      }
      return;
    }
    ultimaBusca.current = chave;

    let cancelado = false;
    (async () => {
      setSituacaoDoSite({ tipo: "procurando" });
      const res = await procurarSiteDaEmpresa({
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        email: c.email,
        cnpj: normalizarCnpj(c.cnpj),
      }).catch(() => null);
      if (cancelado) return;

      if (!res || !res.ok) {
        setSituacaoDoSite({ tipo: "erro", texto: res?.message ?? "Não foi possível procurar o site agora." });
        return;
      }
      if (!res.data) {
        setSituacaoDoSite({
          tipo: "info",
          texto: "Nenhum site encontrado pelo nome, e-mail ou CNPJ. Se a empresa tiver um, informe o endereço.",
        });
        return;
      }
      // Alguém digitou um site enquanto a busca automática corria: vale o dele.
      if (!pedidoDeBusca.manual && camposAtuais.current.site.trim()) {
        setSituacaoDoSite(null);
        return;
      }

      siteDigitadoAgora.current = false;
      aplicarIdentidade(res.data.identidade);
      setSituacaoDoSite({
        tipo: "info",
        texto: `Site encontrado: ${res.data.motivo}. ${resumoDaIdentidade(res.data.identidade)}. Confira antes de salvar.`,
      });
    })();

    return () => {
      cancelado = true;
    };
  }, [pedidoDeBusca]);

  // Site digitado: lê logo e cores dele, com uma pausa para não buscar a cada tecla.
  useEffect(() => {
    if (!siteDigitadoAgora.current) return;
    if (!siteValido(siteNormalizado)) {
      setSituacaoDoSite(null);
      return;
    }

    let cancelado = false;
    const espera = setTimeout(async () => {
      setSituacaoDoSite({ tipo: "lendo" });
      const res = await lerIdentidadeDoSite(siteNormalizado).catch(() => null);
      if (cancelado) return;

      if (!res || !res.ok) {
        setSituacaoDoSite({ tipo: "erro", texto: res?.message ?? "Não foi possível ler o site agora." });
        return;
      }
      if (!res.data) {
        setSituacaoDoSite({ tipo: "erro", texto: "O site não respondeu. Confira o endereço." });
        return;
      }
      siteDigitadoAgora.current = false;
      aplicarIdentidade(res.data);
      setSituacaoDoSite({ tipo: "info", texto: `${resumoDaIdentidade(res.data)}.` });
    }, 800);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [siteNormalizado]);

  async function gravar(alertarParecidas: boolean) {
    const entrada = {
      ...campos,
      cnpj: cnpjDigitado,
      site: siteNormalizado,
      logoUrl: campos.logoUrl || null,
    };
    return empresa
      ? atualizarEmpresa(empresa.id, entrada, { alertarParecidas })
      : criarEmpresa(entrada, { alertarParecidas });
  }

  async function salvar() {
    setErro(null);
    setParecidas([]);

    if (campos.razaoSocial.trim().length < 2) {
      setErro("Informe a razão social ou o nome da empresa.");
      return;
    }
    if (cnpjDigitado && !cnpjOk) {
      setSaiuDoCnpj(true);
      setErro("CNPJ inválido. Verifique o número informado.");
      return;
    }
    if (cnpjDeOutraEmpresa) {
      setErro("Este CNPJ já pertence a outra empresa.");
      return;
    }
    if (!campos.eCliente && !campos.eFornecedor) {
      setErro("Marque se a empresa é cliente, fornecedora ou as duas coisas.");
      return;
    }
    if (siteInvalido) {
      setErro("Site inválido. Informe o domínio, como empresa.com.br.");
      return;
    }

    setSalvando(true);
    try {
      let res = await gravar(true);

      if (!res.ok && res.parecidas?.length) {
        const lista = res.parecidas;
        const seguir = await confirmar({
          titulo: "Pode ser uma empresa já cadastrada",
          mensagem:
            lista
              .map(
                (p) =>
                  `• ${p.nome_fantasia || p.razao_social}${p.cnpj ? ` (${formatarCnpj(p.cnpj)})` : ""} — ${p.motivo}`
              )
              .join("\n") + "\n\nSe for a mesma, revise e use o cadastro existente.",
          rotuloConfirmar: editando ? "Salvar mesmo assim" : "Cadastrar mesmo assim",
          rotuloCancelar: "Revisar",
        });
        if (!seguir) {
          setParecidas(lista);
          return;
        }
        res = await gravar(false);
      }

      if (!res.ok) {
        setErro(res.message);
        return;
      }
      onSalva(res.data);
    } catch {
      setErro("Não foi possível salvar a empresa.");
    } finally {
      setSalvando(false);
    }
  }

  const situacaoNaTela = cnpjInvalido
    ? { texto: "CNPJ inválido. Verifique o número informado.", erro: true }
    : situacao?.tipo === "consultando"
      ? { texto: "Consultando CNPJ…", erro: false }
      : situacao
        ? { texto: situacao.texto, erro: situacao.tipo === "erro" }
        : null;

  const siteNaTela = siteInvalido
    ? { texto: "Informe só o domínio, como empresa.com.br.", erro: true }
    : situacaoDoSite?.tipo === "procurando"
      ? { texto: "Procurando o site da empresa…", erro: false }
      : situacaoDoSite?.tipo === "lendo"
        ? { texto: "Lendo logo e cores do site…", erro: false }
        : situacaoDoSite && "texto" in situacaoDoSite
          ? { texto: situacaoDoSite.texto, erro: situacaoDoSite.tipo === "erro" }
          : null;

  const procurarAoSair = () => pedirBuscaDoSite(false);

  return (
    <div className="mt-4 space-y-5 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
      {/* Identificação */}
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <legend className={grupo}>Identificação</legend>
        <div className="sm:col-span-2">
          <label htmlFor="empresa-cnpj" className={rotulo}>CNPJ</label>
          <input
            id="empresa-cnpj"
            value={campos.cnpj}
            onChange={(e) => {
              cnpjAlterado.current = true;
              setSaiuDoCnpj(false);
              set("cnpj", formatarCnpj(e.target.value));
            }}
            onBlur={() => setSaiuDoCnpj(true)}
            placeholder="Opcional — 00.000.000/0000-00"
            maxLength={18}
            aria-invalid={cnpjInvalido || Boolean(cnpjDeOutraEmpresa)}
            aria-describedby="empresa-cnpj-situacao"
            className={campo}
          />
          <p
            id="empresa-cnpj-situacao"
            aria-live="polite"
            className={
              situacaoNaTela
                ? `mt-1 flex flex-wrap items-center gap-1.5 text-xs ${
                    situacaoNaTela.erro ? "font-semibold text-[var(--erro-solid)]" : "text-[var(--muted)]"
                  }`
                : undefined
            }
          >
            {consultando && !cnpjInvalido && <Girando />}
            {situacaoNaTela?.texto}
            {cnpjDeOutraEmpresa && !cnpjInvalido && (
              <button
                type="button"
                onClick={() => onVerEmpresa(cnpjDeOutraEmpresa)}
                className="font-bold underline"
              >
                Ver cadastro
              </button>
            )}
          </p>
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="empresa-razao" className={rotulo}>Razão social *</label>
          <input
            id="empresa-razao"
            value={campos.razaoSocial}
            onChange={(e) => set("razaoSocial", e.target.value)}
            onBlur={procurarAoSair}
            placeholder="Como consta no CNPJ, ou o nome pelo qual a empresa é conhecida"
            className={campo}
          />
        </div>
        <div className="sm:col-span-6">
          <label htmlFor="empresa-fantasia" className={rotulo}>Nome fantasia</label>
          <input
            id="empresa-fantasia"
            value={campos.nomeFantasia}
            onChange={(e) => set("nomeFantasia", e.target.value)}
            onBlur={procurarAoSair}
            className={campo}
          />
        </div>
      </fieldset>

      {/* Classificação */}
      <fieldset>
        <legend className={grupo}>Relacionamento *</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["eCliente", "Cliente"],
              ["eFornecedor", "Fornecedor"],
            ] as const
          ).map(([chave, nome]) => (
            <label
              key={chave}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                campos[chave]
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                  : "border-[var(--stroke)] bg-[var(--neo-bg)] text-[var(--text)]"
              }`}
            >
              <input
                type="checkbox"
                checked={campos[chave]}
                onChange={(e) => set(chave, e.target.checked)}
              />
              {nome}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Marque os dois quando a empresa for cliente e fornecedora — ela continua sendo um cadastro só.
        </p>
      </fieldset>

      {/* Endereço */}
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <legend className={grupo}>Endereço</legend>
        <div className="sm:col-span-2">
          <label htmlFor="empresa-cep" className={rotulo}>CEP</label>
          <input
            id="empresa-cep"
            value={campos.cep}
            onChange={(e) => set("cep", formatarCep(e.target.value))}
            inputMode="numeric"
            placeholder="00000-000"
            className={campo}
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="empresa-logradouro" className={rotulo}>Logradouro</label>
          <input
            id="empresa-logradouro"
            value={campos.logradouro}
            onChange={(e) => set("logradouro", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="empresa-numero" className={rotulo}>Número</label>
          <input
            id="empresa-numero"
            value={campos.numero}
            onChange={(e) => set("numero", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="empresa-complemento" className={rotulo}>Complemento</label>
          <input
            id="empresa-complemento"
            value={campos.complemento}
            onChange={(e) => set("complemento", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="empresa-bairro" className={rotulo}>Bairro</label>
          <input
            id="empresa-bairro"
            value={campos.bairro}
            onChange={(e) => set("bairro", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="empresa-cidade" className={rotulo}>Cidade</label>
          <input
            id="empresa-cidade"
            value={campos.municipio}
            onChange={(e) => set("municipio", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="empresa-uf" className={rotulo}>UF</label>
          <input
            id="empresa-uf"
            value={campos.uf}
            onChange={(e) => set("uf", e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2))}
            placeholder="RJ"
            className={campo}
          />
        </div>
      </fieldset>

      {/* Contato */}
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <legend className={grupo}>Contato</legend>
        <div className="sm:col-span-3">
          <label htmlFor="empresa-email" className={rotulo}>E-mail</label>
          <input
            id="empresa-email"
            type="email"
            value={campos.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={procurarAoSair}
            className={campo}
          />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="empresa-telefone" className={rotulo}>Telefone</label>
          <input
            id="empresa-telefone"
            value={campos.telefone}
            onChange={(e) => set("telefone", formatarTelefone(e.target.value))}
            inputMode="tel"
            placeholder="(00) 00000-0000"
            className={campo}
          />
        </div>
        <div className="sm:col-span-6">
          <label htmlFor="empresa-site" className={rotulo}>Site</label>
          <div className="flex items-start gap-2">
            <input
              id="empresa-site"
              value={campos.site}
              onChange={(e) => {
                siteDigitadoAgora.current = true;
                set("site", e.target.value);
              }}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="empresa.com.br"
              aria-invalid={siteInvalido}
              aria-describedby="empresa-site-situacao"
              className={`${campo} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => pedirBuscaDoSite(true)}
              disabled={trabalhandoNoSite}
              className="neo-button mt-1 shrink-0 rounded-full px-4 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-60"
            >
              Procurar site
            </button>
          </div>
          <p
            id="empresa-site-situacao"
            aria-live="polite"
            className={
              siteNaTela
                ? `mt-1 flex flex-wrap items-center gap-1.5 text-xs ${
                    siteNaTela.erro ? "font-semibold text-[var(--erro-solid)]" : "text-[var(--muted)]"
                  }`
                : undefined
            }
          >
            {trabalhandoNoSite && !siteInvalido && <Girando />}
            {siteNaTela?.texto}
          </p>
        </div>
      </fieldset>

      {/* Identidade visual */}
      <fieldset>
        <legend className={grupo}>Identidade visual</legend>
        <div className="flex flex-wrap items-center gap-4">
          <LogoDaEmpresa
            nome={campos.nomeFantasia || campos.razaoSocial || "?"}
            logoUrl={campos.logoUrl || null}
            cor={campos.corPrimaria}
            tamanho={64}
          />
          {(
            [
              ["corPrimaria", "Cor principal"],
              ["corSecundaria", "Segunda cor"],
            ] as const
          ).map(([chave, nome]) => (
            <label key={chave} className="flex cursor-pointer items-center gap-2">
              <input
                type="color"
                value={campos[chave] || "#ffffff"}
                onChange={(e) => set(chave, e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--stroke)] bg-[var(--neo-bg)] p-0.5"
              />
              <span>
                <span className={rotulo}>{nome}</span>
                <span className="block font-mono text-xs text-[var(--text)]">{campos[chave] || "—"}</span>
              </span>
            </label>
          ))}
          <div className="flex flex-wrap gap-3">
            {campos.logoUrl && (
              <button
                type="button"
                onClick={() => set("logoUrl", "")}
                className="text-xs font-semibold text-[var(--muted)] hover:underline"
              >
                Remover logo
              </button>
            )}
            {(campos.corPrimaria || campos.corSecundaria) && (
              <button
                type="button"
                onClick={() => setCampos((c) => ({ ...c, corPrimaria: "", corSecundaria: "" }))}
                className="text-xs font-semibold text-[var(--muted)] hover:underline"
              >
                Remover cores
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Logo e cores vêm do site e caracterizam o cartão da empresa. Ajuste as cores se não forem as da
          marca; sem logo, o cartão mostra as iniciais.
        </p>
      </fieldset>

      {/* Demais informações */}
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <legend className={grupo}>Demais informações</legend>
        <div className="sm:col-span-2">
          <label htmlFor="empresa-situacao" className={rotulo}>Situação cadastral</label>
          <input
            id="empresa-situacao"
            value={campos.situacaoCadastral}
            onChange={(e) => set("situacaoCadastral", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="empresa-atividade" className={rotulo}>Atividade principal</label>
          <input
            id="empresa-atividade"
            value={campos.atividadePrincipal}
            onChange={(e) => set("atividadePrincipal", e.target.value)}
            className={campo}
          />
        </div>
        <div className="sm:col-span-6">
          <label htmlFor="empresa-observacao" className={rotulo}>Observação</label>
          <textarea
            id="empresa-observacao"
            rows={2}
            value={campos.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            className={campo}
          />
        </div>
      </fieldset>

      {parecidas.length > 0 && (
        <div className="rounded-2xl bg-[var(--aviso-bg)] px-4 py-3 text-sm text-[var(--text)]">
          <p className="font-semibold">Empresas parecidas já cadastradas:</p>
          <ul className="mt-2 space-y-1">
            {parecidas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {p.nome_fantasia || p.razao_social}
                  {p.cnpj ? ` (${formatarCnpj(p.cnpj)})` : ""} — {p.motivo}
                </span>
                <button
                  type="button"
                  onClick={() => onVerEmpresa(p.id)}
                  className="text-xs font-bold underline"
                >
                  Usar este cadastro
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (
        <p className="rounded-2xl bg-[var(--erro-bg)] px-4 py-3 text-sm font-semibold text-[var(--erro-fg)]">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || consultando || trabalhandoNoSite}
          className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60"
        >
          {salvando
            ? "Salvando…"
            : trabalhandoNoSite
              ? "Lendo o site…"
              : editando
                ? "Salvar alterações"
                : "Cadastrar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="neo-button rounded-full px-5 py-2.5 text-sm font-bold text-[var(--text)]"
        >
          Cancelar
        </button>
      </div>

      <Dialogo />
    </div>
  );
}

function Girando() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--stroke)] border-t-[var(--primary)]"
    />
  );
}

const campo =
  "mt-1 w-full rounded-[1rem] border border-[var(--stroke)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)]";
const rotulo =
  "block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
const grupo = "mb-2 text-sm font-bold text-[var(--text)]";
