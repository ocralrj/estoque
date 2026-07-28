import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (!password || !confirm || typeof password !== "string" || typeof confirm !== "string") {
    return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
  }

  if (password !== confirm) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/dashboard/profile", request.url));
}
