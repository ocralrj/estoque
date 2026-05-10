import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default async function CertificatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: certificates } = await supabase
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Certificados</h1>
        {["super_admin", "uploader"].includes(profile?.role ?? "") && (
          <Link
            href="/dashboard/upload"
            className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Enviar certificado
          </Link>
        )}
      </div>

      {!certificates?.length ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          Nenhum certificado disponível.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificates.map((cert) => (
            <div key={cert.id} className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <h2 className="font-semibold text-gray-800 text-sm leading-tight">{cert.title}</h2>
                {cert.is_expired && (
                  <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5 ml-2 shrink-0">
                    Expirado
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">Emissor: {cert.issuer}</p>
              <p className="text-xs text-gray-500">Para: {cert.issued_to}</p>
              <p className="text-xs text-gray-500">
                Emitido em:{" "}
                {format(new Date(cert.issued_date), "dd/MM/yyyy", { locale: ptBR })}
              </p>
              {cert.expiry_date && (
                <p className="text-xs text-gray-500">
                  Validade:{" "}
                  {format(new Date(cert.expiry_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              )}
              {cert.category && (
                <span className="text-xs bg-primary-100 text-primary-700 rounded-full px-2 py-0.5 w-fit">
                  {cert.category}
                </span>
              )}
              <Link
                href={`/dashboard/certificates/${cert.id}`}
                className="mt-auto text-xs text-primary-600 hover:underline font-medium"
              >
                Ver detalhes →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
