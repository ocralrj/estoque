import forge from "node-forge";

/**
 * Lê os dados de um certificado digital, no navegador.
 *
 * A senha do .pfx é a chave privada na prática: com ela, assina-se em nome da
 * empresa. Por isso a leitura acontece aqui, no navegador de quem envia — a
 * senha é usada para abrir o arquivo, os dados são extraídos, e ela é
 * descartada. Nunca vai para o servidor, nunca é gravada.
 *
 * O que é lido vem de dentro do certificado, e não de campos digitados: o
 * titular, o CNPJ, o emissor e as datas são o que o arquivo diz que são. Quem
 * digita erra a data de validade; o certificado, não.
 */

export interface DadosDoCertificado {
  titular: string;
  /** CNPJ ou CPF do titular, quando o certificado o traz. */
  documento: string | null;
  emissor: string | null;
  numeroSerie: string | null;
  validadeInicio: string;
  validadeFim: string;
  /** Dias até vencer no momento da leitura. Negativo quer dizer vencido. */
  diasParaVencer: number;
}

function paraData(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Separa o nome do documento no padrão do ICP-Brasil.
 *
 * O nome comum de um e-CNPJ vem como "RAZAO SOCIAL LTDA:12345678000199" — o
 * documento colado ao nome, depois de dois-pontos. Onde esse padrão não
 * aparecer, o nome inteiro é o titular e o documento fica em branco, em vez de
 * inventarmos um recorte.
 */
function separarTitular(nomeComum: string): { titular: string; documento: string | null } {
  const partes = nomeComum.split(":");
  if (partes.length < 2) return { titular: nomeComum.trim(), documento: null };

  const possivelDocumento = partes[partes.length - 1].replace(/\D/g, "");
  if (possivelDocumento.length !== 11 && possivelDocumento.length !== 14) {
    return { titular: nomeComum.trim(), documento: null };
  }

  return {
    titular: partes.slice(0, -1).join(":").trim(),
    documento: possivelDocumento,
  };
}

function extrairDoCertificado(cert: forge.pki.Certificate): DadosDoCertificado {
  const nomeComum =
    (cert.subject.getField("CN")?.value as string | undefined) ?? "Sem nome";
  const { titular, documento } = separarTitular(nomeComum);

  const hoje = new Date();
  const fim = cert.validity.notAfter;

  return {
    titular,
    documento,
    emissor: (cert.issuer.getField("CN")?.value as string | undefined) ?? null,
    numeroSerie: cert.serialNumber ?? null,
    validadeInicio: paraData(cert.validity.notBefore),
    validadeFim: paraData(fim),
    diasParaVencer: Math.ceil(
      (fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    ),
  };
}

/**
 * Abre um .pfx/.p12 com a senha e devolve os dados.
 *
 * @throws quando a senha está errada — que é a única forma de saber, já que o
 * arquivo é cifrado por inteiro.
 */
export async function lerPfx(
  arquivo: Blob,
  senha: string
): Promise<DadosDoCertificado> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const binario = forge.util.createBuffer(bytes as unknown as string);

  let p12;
  try {
    const asn1 = forge.asn1.fromDer(binario);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  } catch {
    throw new Error(
      "Não foi possível abrir o certificado. Confira a senha — é a única coisa que impede a leitura."
    );
  }

  const sacos = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certificados = sacos[forge.pki.oids.certBag] ?? [];

  // Um .pfx traz a cadeia inteira: o certificado do titular e os da autoridade
  // que o emitiu. O do titular é o que NÃO assinou a si mesmo.
  const doTitular =
    certificados.find(
      (b) =>
        b.cert &&
        b.cert.subject.getField("CN")?.value !== b.cert.issuer.getField("CN")?.value
    ) ?? certificados[0];

  if (!doTitular?.cert) {
    throw new Error("O arquivo não contém um certificado legível.");
  }

  return extrairDoCertificado(doTitular.cert);
}

/** Lê um .cer/.crt, que é público e dispensa senha. */
export async function lerCer(arquivo: Blob): Promise<DadosDoCertificado> {
  const texto = await arquivo.text();

  try {
    if (texto.includes("BEGIN CERTIFICATE")) {
      return extrairDoCertificado(forge.pki.certificateFromPem(texto));
    }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(bytes as unknown as string)
    );
    return extrairDoCertificado(forge.pki.certificateFromAsn1(asn1));
  } catch {
    throw new Error("Não foi possível ler este certificado.");
  }
}

/** Situação do certificado, para a pastilha da tela. */
export function situacaoDaValidade(validadeFim: string): {
  chave: "vencido" | "vencendo" | "atencao" | "ok";
  texto: string;
  classe: string;
  dias: number;
} {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const dias = Math.round(
    (new Date(validadeFim + "T00:00:00").getTime() -
      new Date(hoje + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (dias < 0) {
    return {
      chave: "vencido",
      texto: `Vencido há ${Math.abs(dias)} dia(s)`,
      classe: "neo-sit neo-sit--erro",
      dias,
    };
  }
  if (dias <= 30) {
    return {
      chave: "vencendo",
      texto: dias === 0 ? "Vence hoje" : `Vence em ${dias} dia(s)`,
      classe: "neo-sit neo-sit--erro",
      dias,
    };
  }
  if (dias <= 90) {
    return {
      chave: "atencao",
      texto: `Vence em ${dias} dias`,
      classe: "neo-sit neo-sit--aviso",
      dias,
    };
  }
  return {
    chave: "ok",
    texto: `Válido por ${dias} dias`,
    classe: "neo-sit neo-sit--ok",
    dias,
  };
}
