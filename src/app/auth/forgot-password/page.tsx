"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/theme/ThemeToggle";
import LogoOcral from "@/components/ui/LogoOcral";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const supabase = createClient();
    const origin = window.location.origin;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        // A origem do navegador evita que um valor local seja enviado em
        // e-mails solicitados pelo site publicado.
        redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
      }
    );

    setLoading(false);

    if (resetError) {
      setError(
        resetError.message ||
          "Não foi possível enviar o e-mail. Tente novamente."
      );
      return;
    }

    // Sempre mostra sucesso (evita enumerar contas)
    setSuccess(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--neo-flat)] px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-md bg-[var(--neo-bg)] rounded-xl shadow-md p-8 border border-transparent">
        <div className="mb-8 text-center">
          <LogoOcral tamanho={120} comNome={false} className="justify-center" />
          <p className="text-[var(--text-muted)] mt-1">Recuperar senha</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-[var(--ok-bg)] border border-[var(--neo-line)] text-[var(--ok-fg)] rounded-lg px-4 py-3 text-sm">
              Se existir uma conta com <strong>{email}</strong>, enviamos um
              link para redefinir a senha. Verifique a caixa de entrada e o
              spam.
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              O link expira em alguns minutos. Depois de clicar, você poderá
              criar uma nova senha.
            </p>
            <Link
              href="/auth/login"
              className="block w-full text-center bg-[var(--primary)] hover:brightness-110 text-[var(--on-accent)] font-medium py-2 rounded-lg text-sm transition-colors"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              Informe o e-mail da sua conta. Enviaremos um link para redefinir
              a senha.
            </p>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[var(--neo-line)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="seu@email.com"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--erro-solid)] bg-[var(--erro-bg)] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--primary)] hover:brightness-110 text-[var(--on-accent)] font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </button>

            <p className="text-center text-sm text-[var(--text-muted)]">
              <Link
                href="/auth/login"
                className="text-[var(--primary)] hover:underline font-medium"
              >
                Voltar ao login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
