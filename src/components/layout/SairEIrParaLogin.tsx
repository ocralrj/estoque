"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Encerra a sessão e leva ao login.
 *
 * Um link direto para /auth/login não resolveria: o middleware devolve quem
 * está autenticado para o dashboard, que mostraria a mesma tela de novo. Sem
 * encerrar a sessão, o botão não sai do lugar.
 */
export default function SairEIrParaLogin({
  rotulo = "Sair do sistema",
  className = "rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] disabled:opacity-60",
}: {
  rotulo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      className={className}
    >
      {saindo ? "Saindo…" : rotulo}
    </button>
  );
}
