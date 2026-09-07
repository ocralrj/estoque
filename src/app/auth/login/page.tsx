"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/ui/PasswordInput";
import FundoAutenticacao from "@/components/layout/FundoAutenticacao";
import Logo from "@/components/layout/Logo";

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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--neo-flat)] px-4 py-8">
      <FundoAutenticacao />

      {/* A sombra é mais funda do que a dos cartões internos: aqui o cartão
          precisa se descolar de uma foto, não de uma superfície lisa. */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)]">
        {/* A marca ocupa o lugar do título escrito, mas o título continua
            existindo para leitor de tela e para os buscadores: uma imagem não
            é lida por nenhum dos dois. */}
        <h1 className="sr-only">OCRAL — acesse sua conta</h1>

        <div className="mb-8 flex justify-center">
          <Logo largura={150} prioridade />
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

        {/* Crédito de quem desenvolveu. Telefone como link tel: — no celular,
            que é onde a maioria vê esta tela, tocar no número disca. */}
        <footer className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-[var(--text-muted)]">
          <span>
            Desenvolvido por{" "}
            <a
              href="https://www.icardcase.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--primary)] hover:underline"
            >
              www.icardcase.com.br
            </a>
          </span>
          <span aria-hidden className="text-[var(--neo-line)]">|</span>
          <a
            href="tel:+5521988785170"
            className="font-semibold text-[var(--primary)] hover:underline"
          >
            (21) 98878-5170
          </a>
        </footer>
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
