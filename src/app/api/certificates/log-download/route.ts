import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { certificateId } = await request.json();
  if (!certificateId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : null;

  await supabase.from("download_logs").insert({
    certificate_id: certificateId,
    user_id: user.id,
    ip_address: ip,
  });

  return NextResponse.json({ ok: true });
}
