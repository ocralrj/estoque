"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { concluirTrocaDeSenha } from "@/app/actions/users";
import PasswordInput from "@/components/ui/PasswordInput";
import { avaliarSenha, REGRAS_SENHA } from "@/lib/senha";

/**
 * Troca obrigatória da senha inicial.
 *
 * Enquanto a pessoa não passa por aqui, o dashboard a devolve para esta tela: a
 * senha que ela tem foi definida por outro alguém e é conhecida por quem
 * cadastrou — e por qualquer um que tenha lido o e-mail.
 */
export default function TrocarSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const avaliacao = avaliarSenha(senha);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (!avaliacao.valida) {
      setErro("A senha ainda não atende aos requisitos abaixo.");
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("same")
          ? "Escolha uma senha diferente da atual."
          : "Não foi possível alterar a senha."
      );
      setSalvando(false);
      return;
    }

    const res = await concluirTrocaDeSenha();
    if (!res.ok) {
      setErro(res.message);
      setSalvando(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--neo-flat)] px-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--neo-bg)] p-8 shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-[var(--text)]">
            Defina sua senha
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Você entrou com uma senha provisória, criada por quem cadastrou seu
            acesso. Escolha uma senha só sua para continuar.
          </p>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">
              Nova senha
            </label>
            <PasswordInput
              required
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <ul className="space-y-1">
            {REGRAS_SENHA.map((r) => {
              const ok = r.testa(senha);
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

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">
              Confirme a nova senha
            </label>
            <PasswordInput
              required
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p className="rounded-lg bg-[var(--erro-bg)] px-3 py-2 text-sm text-[var(--erro-fg)]">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando || !avaliacao.valida}
            className="w-full rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar e entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
