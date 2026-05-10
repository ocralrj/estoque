import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "uploader"].includes(profile.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não suportado" }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máx 10MB)" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const mediaType = file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Analise este certificado e extraia as seguintes informações em JSON:
{
  "title": "título ou nome do certificado",
  "issuer": "quem emitiu o certificado (organização/instituição)",
  "issued_to": "nome de quem recebeu o certificado",
  "issued_date": "data de emissão no formato YYYY-MM-DD",
  "expiry_date": "data de validade no formato YYYY-MM-DD ou null se não houver",
  "category": "categoria do certificado (ex: Treinamento, Habilitação, Conformidade, etc)",
  "description": "breve descrição do certificado"
}
Retorne APENAS o JSON, sem texto adicional.`,
          },
        ],
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";

  let extracted: Record<string, string | null> = {};
  try {
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    extracted = JSON.parse(clean);
  } catch {
    extracted = {};
  }

  return NextResponse.json({ extracted });
}
