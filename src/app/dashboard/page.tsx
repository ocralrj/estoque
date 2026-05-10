import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { count: totalCerts } = await supabase
    .from("certificates")
    .select("*", { count: "exact", head: true });

  const { count: expiredCerts } = await supabase
    .from("certificates")
    .select("*", { count: "exact", head: true })
    .eq("is_expired", true);

  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Olá, {profile?.full_name || profile?.email}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">Total de certificados</p>
          <p className="text-3xl font-bold text-primary-600 mt-1">{totalCerts ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <p className="text-sm text-gray-500">Certificados expirados</p>
          <p className="text-3xl font-bold text-red-500 mt-1">{expiredCerts ?? 0}</p>
        </div>
        {(profile?.role === "super_admin" || profile?.role === "gestor") && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500">Usuários cadastrados</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{totalUsers ?? 0}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Seu perfil</h2>
        <p className="text-sm text-gray-600">Email: {profile?.email}</p>
        <p className="text-sm text-gray-600 mt-1">
          Função:{" "}
          <span className="font-medium capitalize">
            {profile?.role?.replace("_", " ")}
          </span>
        </p>
      </div>
    </div>
  );
}
