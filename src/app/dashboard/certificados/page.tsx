import { exigirPermissao, pode } from "@/lib/permissoes";
import { listarCertificados, listarEmpresas } from "@/app/actions/certificados";
import CertificadosClient from "./CertificadosClient";

export default async function CertificadosPage() {
  await exigirPermissao("certificados", "certificates", "read");

  const [certificados, empresas, podeEnviar, podeExcluir] = await Promise.all([
    listarCertificados(),
    listarEmpresas(),
    pode("certificados", "certificates", "upload"),
    pode("certificados", "certificates", "delete"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Certificados digitais</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Guardados por empresa, ordenados pelo que vence primeiro. A senha do
          certificado não é guardada — ela continua só com o titular.
        </p>
      </div>

      {certificados.ok ? (
        <CertificadosClient
          certificados={certificados.data}
          empresas={empresas.ok ? empresas.data : []}
          podeEnviar={podeEnviar}
          podeExcluir={podeExcluir}
        />
      ) : (
        <p className="neo-card p-8 text-center text-sm text-[var(--danger)]">
          {certificados.message}
        </p>
      )}
    </div>
  );
}
