"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { departamentosParaPedido, pedirAcesso } from "@/app/actions/acessos";
import FundoAutenticacao from "@/components/layout/FundoAutenticacao";
import Logo from "@/components/layout/Logo";

/**
 * Pedido de acesso, no lugar do cadastro que criava conta na hora.
 *
 * A tela anterior pedia uma senha e abria a conta — o contrário do que o
 * próprio aviso dela dizia ("o acesso é por convite"): quem soubesse o
 * endereço entrava. Aqui a pessoa escolhe o departamento em que trabalha, e
 * quem responde por aquele departamento decide e envia o convite.
 *
 * Os rótulos ficam vermelhos enquanto o campo não atende ao que precisa, e só
 * depois de a pessoa tocar nele: um formulário que já abre acusando erro pune
 * quem ainda nem começou.
 */
export default function RegisterPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [departamentos, setDepartamentos] = useState<string[]>([]);

  const [tocado, setTocado] = useState({ nome: false, email: false, dep: false });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    // Vem por Server Action, que roda no servidor: nada é exposto ao papel
    // anônimo no banco, e a lista devolvida é só de nomes.
    departamentosParaPedido().then(setDepartamentos);
  }, []);

  const nomeValido = nome.trim().length >= 3;
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const depValido = departamento.trim().length > 0;

  const erroNome = tocado.nome && !nomeValido;
  const erroEmail = tocado.email && !emailValido;
  const erroDep = tocado.dep && !depValido;

  const podeEnviar = nomeValido && emailValido && depValido;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setErro("");
    setEnviando(true);

    const res = await pedirAcesso({ nome, email, departamento });
    setEnviando(false);

    if (!res.ok) {
      setErro(res.message);
      return;
    }
    setEnviado(true);
  }

  const rotulo = (emErro: boolean) =>
    `mb-1 block text-sm font-medium transition-colors ${
      emErro ? "text-[var(--erro-solid)]" : "text-[var(--text)]"
    }`;

  const campo =
    "w-full rounded-lg border border-[var(--neo-line)] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--neo-flat)] px-4 py-8">
      <FundoAutenticacao />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--neo-line)] bg-[var(--neo-bg)] p-8 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)]">
        <h1 className="sr-only">OCRAL — pedir acesso</h1>

        <div className="mb-6 flex justify-center">
          <Logo largura={140} prioridade />
        </div>

        {enviado ? (
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text)]">Pedido enviado</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Quem responde pelo departamento <strong>{departamento}</strong> foi
              avisado. Assim que aprovar, você recebe o acesso com uma senha
              provisória, que deverá trocar no primeiro uso.
            </p>
            <Link
              href="/auth/login"
              className="mt-6 inline-block rounded-lg bg-[var(--primary)] px-5 py-2 text-sm font-medium text-[var(--on-accent)]"
            >
              Voltar ao início
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-center text-sm text-[var(--info-fg)]">
              O acesso é aprovado por quem responde pelo seu departamento. Você
              não escolhe senha aqui — ela vem no convite.
            </p>

            <form onSubmit={enviar} className="space-y-4">
              <div>
                <label htmlFor="nome" className={rotulo(erroNome)}>
                  Nome completo
                  {erroNome && (
                    <span className="ml-2 font-normal">— escreva nome e sobrenome</span>
                  )}
                </label>
                <input
                  id="nome"
                  value={nome}
                  aria-invalid={erroNome}
                  onFocus={() => setTocado((t) => ({ ...t, nome: true }))}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Como você é chamado no trabalho"
                  className={campo}
                />
              </div>

              <div>
                <label htmlFor="email" className={rotulo(erroEmail)}>
                  Email
                  {erroEmail && (
                    <span className="ml-2 font-normal">— endereço incompleto</span>
                  )}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  aria-invalid={erroEmail}
                  onFocus={() => setTocado((t) => ({ ...t, email: true }))}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className={campo}
                />
              </div>

              <div>
                <label htmlFor="departamento" className={rotulo(erroDep)}>
                  Departamento
                  {erroDep && <span className="ml-2 font-normal">— escolha um</span>}
                </label>
                <select
                  id="departamento"
                  value={departamento}
                  aria-invalid={erroDep}
                  onFocus={() => setTocado((t) => ({ ...t, dep: true }))}
                  onChange={(e) => setDepartamento(e.target.value)}
                  className={campo}
                >
                  <option value="">Onde você trabalha</option>
                  {departamentos.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Quem responde por este departamento recebe seu pedido.
                </p>
              </div>

              {erro && (
                <p className="rounded-lg bg-[var(--erro-bg)] px-3 py-2 text-sm text-[var(--erro-fg)]">
                  {erro}
                </p>
              )}

              {podeEnviar ? (
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  {enviando ? "Enviando..." : "Pedir acesso"}
                </button>
              ) : (
                <p className="rounded-lg bg-[var(--neo-flat)] px-3 py-2 text-center text-xs text-[var(--text-muted)]">
                  {!nomeValido
                    ? "Escreva seu nome completo para continuar"
                    : !emailValido
                      ? "Informe um e-mail válido para continuar"
                      : "Escolha o departamento para continuar"}
                </p>
              )}
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Já tem conta?{" "}
          <Link href="/auth/login" className="font-medium text-[var(--primary)] hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
