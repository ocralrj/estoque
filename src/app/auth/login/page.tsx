"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/ui/PasswordInput";
import FundoAutenticacao from "@/components/layout/FundoAutenticacao";
import Logo from "@/components/layout/Logo";
import RodapeAutenticacao from "@/components/layout/RodapeAutenticacao";
import { avaliarSenha } from "@/lib/senha";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailTocado, setEmailTocado] = useState(false);
  const [senhaTocada, setSenhaTocada] = useState(false);
  const [senhaAntiga, setSenhaAntiga] = useState(false);

  // O rótulo vermelho aparece a partir do momento em que o campo é tocado, e
  // não antes: um formulário que já abre acusando erro pune quem ainda nem
  // começou a preencher.
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const avaliacaoSenha = avaliarSenha(password);
  const senhaValida = avaliacaoSenha.valida;

  const emailEmErro = emailTocado && !emailValido;
  const senhaEmErro = senhaTocada && !senhaValida && !senhaAntiga;

  // O botão só aparece quando os dois campos estão satisfeitos — ou quando a
  // pessoa declara que sua senha é anterior às regras atuais. Sem essa saída,
  // quem tem senha antiga sem caractere especial ficaria trancado do lado de
  // fora, sem botão e sem explicação.
  const podeEntrar = emailValido && (senhaValida || (senhaAntiga && password.length > 0));

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
            <label
              htmlFor="login-email"
              className={`mb-1 block text-sm font-medium transition-colors ${
                emailEmErro ? "text-[var(--erro-solid)]" : "text-[var(--text)]"
              }`}
            >
              Email
              {emailEmErro && (
                <span className="ml-2 font-normal">— endereço incompleto</span>
              )}
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={emailEmErro}
              value={email}
              onFocus={() => setEmailTocado(true)}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[var(--neo-line)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="login-senha"
                className={`block text-sm font-medium transition-colors ${
                  senhaEmErro ? "text-[var(--erro-solid)]" : "text-[var(--text)]"
                }`}
              >
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
              id="login-senha"
              required
              autoComplete="current-password"
              value={password}
              onFocus={() => setSenhaTocada(true)}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {/* O que falta, e não um "senha inválida" genérico: quem não sabe
                qual requisito não atendeu fica tentando no escuro. */}
            {senhaEmErro && (
              <ul className="mt-2 space-y-0.5">
                {avaliacaoSenha.faltando.map((f: string) => (
                  <li key={f} className="text-xs text-[var(--erro-solid)]">
                    Falta: {f}
                  </li>
                ))}
              </ul>
            )}

            {senhaTocada && !senhaValida && !senhaAntiga && (
              <button
                type="button"
                onClick={() => setSenhaAntiga(true)}
                className="mt-2 text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Minha senha é anterior a estas regras — entrar assim mesmo
              </button>
            )}
          </div>

          {error && (
            <p className="text-sm text-[var(--erro-solid)] bg-[var(--erro-bg)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* O botão só existe quando dá para entrar. Enquanto não aparece, o
              lugar dele fica com o que falta — um espaço vazio deixaria a
              pessoa procurando um botão que sumiu sem explicação. */}
          {podeEntrar ? (
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          ) : (
            <p className="rounded-lg bg-[var(--neo-flat)] px-3 py-2 text-center text-xs text-[var(--text-muted)]">
              {!emailValido
                ? "Informe um e-mail válido para continuar"
                : "Complete a senha para continuar"}
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Não tem conta?{" "}
          <Link href="/auth/register" className="text-[var(--primary)] hover:underline font-medium">
            Cadastre-se
          </Link>
        </p>
      </div>

      <RodapeAutenticacao />
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
