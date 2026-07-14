"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/theme/ThemeToggle";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-md p-8 border border-transparent dark:border-gray-800">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">OCRAL</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Recuperar senha</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 text-green-800 rounded-lg px-4 py-3 text-sm">
              Se existir uma conta com <strong>{email}</strong>, enviamos um
              link para redefinir a senha. Verifique a caixa de entrada e o
              spam.
            </div>
            <p className="text-sm text-gray-500">
              O link expira em alguns minutos. Depois de clicar, você poderá
              criar uma nova senha.
            </p>
            <Link
              href="/auth/login"
              className="block w-full text-center bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600">
              Informe o e-mail da sua conta. Enviaremos um link para redefinir
              a senha.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="seu@email.com"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </button>

            <p className="text-center text-sm text-gray-500">
              <Link
                href="/auth/login"
                className="text-primary-600 hover:underline font-medium"
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
