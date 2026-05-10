import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DownloadButton from "@/components/DownloadButton";

export default async function CertificateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: cert } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!cert) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: accessGroups } = await supabase
    .from("certificate_access")
    .select("group_id, groups(name)")
    .eq("certificate_id", cert.id);

  const { data: logs } = await supabase
    .from("download_logs")
    .select("downloaded_at, profiles(full_name, email)")
    .eq("certificate_id", cert.id)
    .order("downloaded_at", { ascending: false })
    .limit(10);

  const canDownload =
    !cert.is_expired &&
    (["super_admin", "gestor", "uploader"].includes(profile?.role ?? "") ||
      (accessGroups?.length ?? 0) > 0);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{cert.title}</h1>
          {cert.is_expired && (
            <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-1">
              Expirado
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500">Emissor</dt>
            <dd className="font-medium text-gray-800">{cert.issuer}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Emitido para</dt>
            <dd className="font-medium text-gray-800">{cert.issued_to}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Data de emissão</dt>
            <dd className="font-medium text-gray-800">
              {format(new Date(cert.issued_date), "dd/MM/yyyy", { locale: ptBR })}
            </dd>
          </div>
          {cert.expiry_date && (
            <div>
              <dt className="text-gray-500">Validade</dt>
              <dd className="font-medium text-gray-800">
                {format(new Date(cert.expiry_date), "dd/MM/yyyy", { locale: ptBR })}
              </dd>
            </div>
          )}
          {cert.category && (
            <div>
              <dt className="text-gray-500">Categoria</dt>
              <dd className="font-medium text-gray-800">{cert.category}</dd>
            </div>
          )}
        </dl>

        {cert.description && (
          <p className="mt-4 text-sm text-gray-600">{cert.description}</p>
        )}

        {canDownload && (
          <div className="mt-6">
            <DownloadButton certificateId={cert.id} filePath={cert.file_path} fileName={cert.file_name} />
          </div>
        )}
      </div>

      {["super_admin", "gestor"].includes(profile?.role ?? "") && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
            <h2 className="font-semibold text-gray-800 mb-3">Grupos com acesso</h2>
            {!accessGroups?.length ? (
              <p className="text-sm text-gray-400">Nenhum grupo habilitado.</p>
            ) : (
              <ul className="space-y-1">
                {accessGroups.map((a) => (
                  <li key={a.group_id} className="text-sm text-gray-700">
                    {(a.groups as { name: string } | null)?.name ?? a.group_id}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-3">Últimos downloads</h2>
            {!logs?.length ? (
              <p className="text-sm text-gray-400">Nenhum download registrado.</p>
            ) : (
              <ul className="space-y-2">
                {logs.map((log) => (
                  <li key={log.downloaded_at} className="text-sm text-gray-700 flex justify-between">
                    <span>
                      {(log.profiles as { full_name: string | null; email: string } | null)?.full_name ||
                        (log.profiles as { full_name: string | null; email: string } | null)?.email}
                    </span>
                    <span className="text-gray-400">
                      {format(new Date(log.downloaded_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
