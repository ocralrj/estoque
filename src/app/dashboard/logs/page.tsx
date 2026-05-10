import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default async function LogsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["super_admin", "gestor"].includes(profile?.role ?? "")) {
    redirect("/dashboard");
  }

  const { data: logs } = await supabase
    .from("download_logs")
    .select("*, profiles(full_name, email), certificates(title)")
    .order("downloaded_at", { ascending: false })
    .limit(100);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Logs de Download</h1>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Usuário</th>
              <th className="px-4 py-3 text-left">Certificado</th>
              <th className="px-4 py-3 text-left">Data/Hora</th>
              <th className="px-4 py-3 text-left">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!logs?.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Nenhum download registrado.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">
                      {(log.profiles as { full_name: string | null; email: string } | null)?.full_name || "—"}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {(log.profiles as { full_name: string | null; email: string } | null)?.email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {(log.certificates as { title: string } | null)?.title || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {format(new Date(log.downloaded_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {log.ip_address || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
