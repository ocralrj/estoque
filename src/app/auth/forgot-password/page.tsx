"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FundoAutenticacao from "@/components/layout/FundoAutenticacao";
import Logo from "@/components/layout/Logo";
import RodapeAutenticacao from "@/components/layout/RodapeAutenticacao";

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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--neo-flat)] px-4 py-8">
      <FundoAutenticacao />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)]">
        <h1 className="sr-only">OCRAL — recuperar senha</h1>

        <div className="mb-8 flex flex-col items-center">
          <Logo largura={150} prioridade />
          <p className="mt-4 text-[var(--text-muted)]">Recuperar senha</p>
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

      <RodapeAutenticacao />
    </div>
  );
}
