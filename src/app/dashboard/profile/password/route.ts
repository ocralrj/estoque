import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

import { avaliarSenha } from "@/lib/senha";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (
    typeof password !== "string" ||
    typeof confirm !== "string" ||
    !password ||
    !confirm
  ) {
    return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
  }

  const avaliacao = avaliarSenha(password);
  if (!avaliacao.valida) {
    return NextResponse.json(
      { error: `A senha precisa de: ${avaliacao.faltando.join(", ").toLowerCase()}.` },
      { status: 400 }
    );
  }

  if (password !== confirm) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  const { supabase, user } = await getSession();
  if (!user) {
    // 303 troca o POST por GET no destino; o padrão (307) reenviaria o POST.
    return NextResponse.redirect(new URL("/auth/login", request.url), 303);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível atualizar a senha." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(new URL("/dashboard/profile", request.url), 303);
}
