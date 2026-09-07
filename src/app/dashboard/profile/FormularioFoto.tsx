"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SeletorDeFoto from "@/components/ui/SeletorDeFoto";
import type { AvatarPreparado } from "@/lib/imagens/avatar";

/**
 * Troca da própria foto.
 *
 * O envio deixou de ser um `form` HTML puro para que o tratamento da imagem
 * aconteça antes de a rede ser usada: o arquivo que sobe já é o quadrado de
 * 256 pixels, e não a foto original do celular.
 */
export default function FormularioFoto({
  nome,
  email,
  urlAtual,
}: {
  nome?: string | null;
  email?: string | null;
  urlAtual?: string | null;
}) {
  const router = useRouter();
  const [foto, setFoto] = useState<AvatarPreparado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function enviar() {
    if (!foto) return;
    setEnviando(true);
    setAviso(null);

    const dados = new FormData();
    dados.append("avatar", foto.blob, `avatar.${foto.extensao}`);

    try {
      const resposta = await fetch("/dashboard/profile/photo", {
        method: "POST",
        body: dados,
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setAviso({
          tipo: "erro",
          texto: corpo?.error ?? "Não foi possível enviar a foto.",
        });
        return;
      }

      setAviso({ tipo: "ok", texto: "Foto atualizada." });
      setFoto(null);
      router.refresh();
    } catch {
      setAviso({ tipo: "erro", texto: "Falha de conexão ao enviar a foto." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <SeletorDeFoto
        nome={nome}
        email={email}
        urlAtual={urlAtual}
        rotulo="Foto do perfil"
        aoEscolher={setFoto}
      />

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            aviso.tipo === "ok"
              ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
              : "bg-[var(--erro-bg)] text-[var(--erro-fg)]"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <button
        type="button"
        onClick={enviar}
        disabled={!foto || enviando}
        className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] transition-colors hover:brightness-110 disabled:opacity-50"
      >
        {enviando ? "Enviando…" : "Salvar foto"}
      </button>
    </div>
  );
}
