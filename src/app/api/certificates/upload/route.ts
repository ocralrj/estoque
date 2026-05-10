import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const metadata = JSON.parse(formData.get("metadata") as string);

  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não suportado" }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máx 10MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop();
  const filePath = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("certificates")
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Erro ao fazer upload do arquivo" }, { status: 500 });
  }

  const { data: cert, error: insertError } = await supabase
    .from("certificates")
    .insert({
      title: metadata.title,
      description: metadata.description || null,
      issuer: metadata.issuer,
      issued_to: metadata.issued_to,
      issued_date: metadata.issued_date,
      expiry_date: metadata.expiry_date || null,
      category: metadata.category || null,
      tags: metadata.tags || null,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    await supabase.storage.from("certificates").remove([filePath]);
    return NextResponse.json({ error: "Erro ao salvar certificado" }, { status: 500 });
  }

  return NextResponse.json({ certificate: cert });
}
