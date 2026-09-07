import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hasValidSecret(request: NextRequest, expectedSecret: string) {
  const authorization = request.headers.get("authorization");
  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-cron-secret");

  if (!providedSecret) return false;

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);

  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { erro: "Serviço de manutenção não configurado." },
      { status: 503 }
    );
  }

  if (!hasValidSecret(request, cronSecret)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.from("categories").select("id").limit(1);

  if (error) {
    console.error("Falha no heartbeat do Supabase:", error.message);
    return NextResponse.json(
      { erro: "Não foi possível consultar o banco de dados." },
      { status: 502 }
    );
  }

  // A rotina diária aproveita a viagem para a faxina: notificação lida perde a
  // utilidade e a tabela cresceria para sempre. Um agendamento próprio só para
  // isso seria mais uma peça para manter, e esta já roda todo dia.
  //
  // A limpeza não pode derrubar o heartbeat: se ela falhar, o que importa
  // — manter o projeto acordado — já aconteceu.
  let notificacoesRemovidas: number | null = null;
  const { data: removidas, error: erroLimpeza } = await supabase.rpc(
    "limpar_notificacoes_antigas"
  );

  if (erroLimpeza) {
    console.error("Falha ao limpar notificações:", erroLimpeza.message);
  } else if (typeof removidas === "number") {
    notificacoesRemovidas = removidas;
  }

  // Sugestão que o autor deu por atendida sai 30 dias depois: o que ficou
  // resolvido não precisa ocupar a lista para sempre.
  let sugestoesRemovidas: number | null = null;
  const { data: sugestoes, error: erroSugestoes } = await supabase.rpc(
    "limpar_sugestoes_atendidas"
  );

  if (erroSugestoes) {
    console.error("Falha ao limpar sugestões:", erroSugestoes.message);
  } else if (typeof sugestoes === "number") {
    sugestoesRemovidas = sugestoes;
  }

  return NextResponse.json({
    status: "ok",
    notificacoesRemovidas,
    sugestoesRemovidas,
  });
}
