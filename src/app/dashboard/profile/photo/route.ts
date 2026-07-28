import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Selecione um arquivo válido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const fileName = `${user.id}-${Date.now()}.${file.name.split(".").pop()}`;
  const fileData = await file.arrayBuffer();

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(fileName, new Uint8Array(fileData), {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(uploadData.path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/dashboard/profile", request.url));
}
