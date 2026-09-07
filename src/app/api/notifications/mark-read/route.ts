import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { supabase, user } = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Sem corpo, marca todas — é o "marcar todas como lidas". Com um id, marca
  // só aquela: abrir o painel deixou de dar tudo por lido, porque bater o olho
  // na lista não é o mesmo que ter lido o aviso.
  let id: string | null = null;
  try {
    const corpo = await request.json();
    if (typeof corpo?.id === "string") id = corpo.id;
  } catch {
    /* sem corpo: marca todas */
  }

  let consulta = supabase
    .from("notifications")
    .update({ is_read: true, updated_at: new Date().toISOString() })
    // O filtro por dono fica aqui, e não só no RLS: um id de outra pessoa
    // chegando por aqui não deve alcançar linha nenhuma.
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (id) consulta = consulta.eq("id", id);

  const { error } = await consulta;

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível marcar as notificações como lidas." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
