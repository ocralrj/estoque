import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { roleLabel } from "@/lib/labels";
import FormularioNome from "./FormularioNome";
import FormularioFoto from "./FormularioFoto";
import Avatar from "@/components/ui/Avatar";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile } = await requireSession();

  if (!profile) redirect("/auth/login");

  return (
    <div className="space-y-6">
      <div className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar
            nome={profile.full_name}
            email={profile.email}
            url={profile.avatar_url}
            tamanho={64}
          />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Meu Perfil</h1>
            <p className="text-sm text-[var(--text-muted)]">Gerencie sua foto e senha. O acesso continua definido pelo admin.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <FormularioNome nomeAtual={profile.full_name} />
            <div>
              <p className="text-sm text-[var(--text-muted)]">Email</p>
              <p className="text-base font-medium text-[var(--text)]">{profile.email}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Função</p>
              <p className="text-base font-medium text-[var(--text)]">{roleLabel(profile.role)}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--neo-flat)] p-5 border border-[var(--neo-line)]">
            <p className="text-sm font-semibold text-[var(--text)] mb-2">Acesso e permissões</p>
            <p className="text-sm text-[var(--text-muted)]">
              O acesso e a função deste usuário são gerenciados pelo administrador e não podem ser alterados aqui.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-[var(--text)] mb-4">Atualizar foto</h2>
          <FormularioFoto
            nome={profile.full_name}
            email={profile.email}
            urlAtual={profile.avatar_url}
          />
        </section>

        <section className="bg-[var(--neo-bg)] rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-[var(--text)] mb-4">Alterar senha</h2>
          <form action="/dashboard/profile/password" method="post" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text)]">Nova senha</label>
              <input
                name="password"
                type="password"
                minLength={6}
                required
                className="mt-2 block w-full rounded-lg border border-[var(--neo-line)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)]">Confirmar senha</label>
              <input
                name="confirm"
                type="password"
                minLength={6}
                required
                className="mt-2 block w-full rounded-lg border border-[var(--neo-line)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] hover:brightness-110 transition-colors"
            >
              Atualizar senha
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
