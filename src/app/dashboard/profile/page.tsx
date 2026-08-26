import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) redirect("/auth/login");

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-2xl text-slate-700">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="Avatar do usuário" className="h-full w-full object-cover" />
            ) : (
              <span>{(profile.full_name || profile.email)?.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Meu Perfil</h1>
            <p className="text-sm text-gray-500">Gerencie sua foto e senha. O acesso continua definido pelo admin.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Nome completo</p>
              <p className="text-base font-medium text-gray-900">{profile.full_name || "Não informado"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="text-base font-medium text-gray-900">{profile.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Função</p>
              <p className="text-base font-medium text-gray-900">{profile.role.replace("_", " ")}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-sm font-semibold text-slate-900 mb-2">Acesso e permissões</p>
            <p className="text-sm text-slate-600">
              O acesso e a função deste usuário são gerenciados pelo administrador e não podem ser alterados aqui.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Atualizar foto</h2>
          <form action="/dashboard/profile/photo" method="post" encType="multipart/form-data" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Foto do perfil</label>
              <input
                type="file"
                name="avatar"
                accept="image/*"
                className="mt-2 block w-full text-sm text-gray-600 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:rounded-lg file:text-sm file:font-medium file:text-slate-700"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
            >
              Enviar foto
            </button>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Alterar senha</h2>
          <form action="/dashboard/profile/password" method="post" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nova senha</label>
              <input
                name="password"
                type="password"
                minLength={6}
                required
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Confirmar senha</label>
              <input
                name="confirm"
                type="password"
                minLength={6}
                required
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
            >
              Atualizar senha
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
