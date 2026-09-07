"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/ui/PasswordInput";
import ThemeToggle from "@/components/theme/ThemeToggle";
import LogoOcral from "@/components/ui/LogoOcral";
import { avaliarSenha, REGRAS_SENHA } from "@/lib/senha";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const avaliacao = avaliarSenha(password);
    if (!avaliacao.valida) {
      setError(`A senha precisa de: ${avaliacao.faltando.join(", ").toLowerCase()}.`);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      // Com o cadastro público desligado no Supabase, o provedor recusa aqui.
      // A mensagem dele vem em inglês e não explica o caminho certo.
      const msg = error.message.toLowerCase();
      setError(
        msg.includes("signup") || msg.includes("disabled") || msg.includes("not allowed")
          ? "O cadastro é feito por convite. Peça a um administrador que envie o convite para o seu e-mail."
          : error.message
      );
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--neo-flat)] px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-md bg-[var(--neo-bg)] rounded-xl shadow-md p-8 border border-transparent">
        <div className="mb-8 text-center">
          <LogoOcral tamanho={120} comNome={false} className="justify-center" />
          <p className="text-[var(--text-muted)] mt-1">Crie sua conta</p>
          <p className="mt-3 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-xs text-[var(--info-fg)]">
            O acesso é por convite. Se a sua empresa já o cadastrou, procure o e-mail
            com o link para definir a senha.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Nome completo
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-[var(--neo-line)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[var(--neo-line)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              Senha
            </label>
            <PasswordInput
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
            <ul className="mt-2 space-y-1">
              {REGRAS_SENHA.map((r) => {
                const ok = r.testa(password);
                return (
                  <li
                    key={r.id}
                    className={`flex items-center gap-2 text-xs ${
                      ok ? "text-[var(--ok-fg)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    <span aria-hidden>{ok ? "✓" : "○"}</span>
                    {r.texto}
                  </li>
                );
              })}
            </ul>
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
            {loading ? "Cadastrando..." : "Cadastrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Já tem conta?{" "}
          <Link href="/auth/login" className="text-[var(--primary)] hover:underline font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
