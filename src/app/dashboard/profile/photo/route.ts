import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MAX_SAIDA_BYTES } from "@/lib/imagens/avatar";

// A tela trata a imagem antes de enviar: o que chega aqui é o quadrado de 256
// pixels, que fica na casa das dezenas de kB. O teto existe para recusar o que
// não passou por esse caminho — antes eram 5 MB, e uma foto de celular inteira
// era gravada sem ninguém notar.
const MAX_BYTES = MAX_SAIDA_BYTES;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Selecione um arquivo válido." }, { status: 400 });
  }

  // O tipo vem do cliente: só aceitamos a lista conhecida e derivamos a extensão
  // dela, em vez de confiar no nome do arquivo enviado.
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Formato não suportado. Envie JPG, PNG, WebP ou GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error:
          "A imagem excede o limite depois do tratamento. Recarregue a página e escolha de novo.",
      },
      { status: 400 }
    );
  }

  const { supabase, user } = await getSession();
  if (!user) {
    // Responde em JSON, e não em redirect: quem chama é um fetch, que seguiria
    // o redirect e receberia a página de login com status 200.
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const fileName = `${user.id}-${Date.now()}.${extension}`;
  const fileData = await file.arrayBuffer();

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(fileName, new Uint8Array(fileData), {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    // A mensagem genérica deixou o problema invisível por semanas: a foto era
    // tratada, enviada e recusada, e a tela dizia apenas que não deu. O erro do
    // Storage vai para o log do servidor, e a tela distingue o caso que a
    // pessoa não tem como resolver sozinha — bucket ausente é configuração,
    // não culpa de quem envia.
    console.error("Falha ao enviar avatar:", uploadError);

    const motivo = uploadError.message?.toLowerCase() ?? "";
    const configuracao =
      motivo.includes("bucket") || motivo.includes("not found");

    return NextResponse.json(
      {
        error: configuracao
          ? "O armazenamento de fotos ainda não está configurado. Execute supabase/_manual_apply/015_bucket_avatares.sql."
          : "Não foi possível enviar a imagem. Tente de novo em instantes.",
      },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(uploadData.path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Não foi possível salvar a foto no perfil." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, url: publicUrlData.publicUrl });
}
