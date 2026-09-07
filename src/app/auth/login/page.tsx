"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/ui/PasswordInput";
import FundoAutenticacao from "@/components/layout/FundoAutenticacao";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "link_invalido") {
      setError("Link de recuperação inválido ou expirado. Solicite um novo.");
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email ou senha inválidos.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--neo-flat)] px-4">
      <FundoAutenticacao />

      {/* A sombra é mais funda do que a dos cartões internos: aqui o cartão
          precisa se descolar de uma foto, não de uma superfície lisa. */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)]">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--text)]">OCRAL</h1>
          <p className="text-[var(--text-muted)] mt-1">Acesse sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-[var(--text)]">
                Senha
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-[var(--primary)] hover:underline font-medium"
              >
                Esqueci a senha
              </Link>
            </div>
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Não tem conta?{" "}
          <Link href="/auth/register" className="text-[var(--primary)] hover:underline font-medium">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center bg-[var(--neo-flat)]">
          <FundoAutenticacao />
          <p className="relative z-10 text-sm text-[var(--text-muted)]">Carregando...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
