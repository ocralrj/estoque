"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/ui/PasswordInput";
import FundoAutenticacao from "@/components/layout/FundoAutenticacao";
import Logo from "@/components/layout/Logo";
import RodapeAutenticacao from "@/components/layout/RodapeAutenticacao";
import { avaliarSenha } from "@/lib/senha";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();

      // Hash tokens (fluxo implícito legado) — troca por sessão se presentes
      if (typeof window !== "undefined" && window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        const type = hash.get("type");

        if (access_token && refresh_token && type === "recovery") {
          await supabase.auth.setSession({ access_token, refresh_token });
          // limpa hash da URL
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      setHasSession(Boolean(session));
      setChecking(false);
    }

    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!avaliarSenha(password).valida) {
      setError("A senha não atende aos requisitos: 8 caracteres, maiúscula, minúscula, número e caractere especial.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(
        updateError.message ||
          "Não foi possível redefinir a senha. Solicite um novo link."
      );
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
  }

  if (checking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[var(--neo-flat)]">
        <FundoAutenticacao />
        <p className="relative z-10 text-sm text-[var(--text-muted)]">Validando link...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--neo-flat)] px-4 py-8">
      <FundoAutenticacao />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)]">
        <h1 className="sr-only">OCRAL — definir nova senha</h1>

        <div className="mb-8 flex flex-col items-center">
          <Logo largura={150} prioridade />
          <p className="mt-4 text-[var(--text-muted)]">Definir nova senha</p>
        </div>

        {!hasSession ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--erro-solid)] bg-[var(--erro-bg)] rounded-lg px-3 py-2">
              Link inválido ou expirado. Solicite um novo e-mail de recuperação.
            </p>
            <Link
              href="/auth/forgot-password"
              className="block w-full text-center bg-[var(--primary)] hover:brightness-110 text-[var(--on-accent)] font-medium py-2 rounded-lg text-sm"
            >
              Solicitar novo link
            </Link>
            <p className="text-center text-sm text-[var(--text-muted)]">
              <Link href="/auth/login" className="text-[var(--primary)] hover:underline">
                Voltar ao login
              </Link>
            </p>
          </div>
        ) : success ? (
          <div className="bg-[var(--ok-bg)] border border-[var(--neo-line)] text-[var(--ok-fg)] rounded-lg px-4 py-3 text-sm">
            Senha atualizada com sucesso. Redirecionando...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Nova senha
              </label>
              <PasswordInput
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Confirmar senha
              </label>
              <PasswordInput
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repita a nova senha"
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
              {loading ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>

      <RodapeAutenticacao />
    </div>
  );
}
