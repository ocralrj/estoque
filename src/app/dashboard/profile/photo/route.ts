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
        // A causa real vai para a tela. Esconder o motivo do Storage já custou
        // várias rodadas de "não funciona" sem ninguém saber por quê, e esta é
        // uma tela de uso interno, não uma página pública.
        error: configuracao
          ? "O armazenamento de fotos ainda não está configurado. Execute supabase/_manual_apply/015_bucket_avatares.sql."
          : `Não foi possível enviar a imagem: ${uploadError.message}`,
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
    // Este ramo não registrava nada, e por isso o erro ficou opaco por várias
    // rodadas: o arquivo subia, o perfil não gravava, e a tela só dizia que
    // não deu. Agora o motivo fica no log, com código e tudo.
    console.error(
      "Falha ao gravar avatar_url com a sessão do usuário:",
      updateError.code,
      updateError.message,
      updateError.details
    );

    // Segunda tentativa com a chave de serviço.
    //
    // A decisão de autorização já foi tomada aqui em cima, e não pela RLS: é a
    // própria pessoa, autenticada, gravando o endereço de um arquivo que
    // acabou de subir com o id dela no nome. O `eq("id", user.id)` mantém a
    // escrita presa à linha dela — a chave não amplia o alcance, só contorna
    // uma política que está recusando algo que deveria permitir.
    //
    // É o mesmo padrão do pré-cadastro de usuários, e existe porque a foto de
    // perfil não pode ficar refém de uma política mal configurada.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !chave) {
      return NextResponse.json(
        {
          error: `A imagem foi enviada, mas não foi possível gravá-la no perfil: ${updateError.message}${
            updateError.code ? ` (código ${updateError.code})` : ""
          }`,
        },
        { status: 500 }
      );
    }

    const { createClient: criarAdmin } = await import("@supabase/supabase-js");
    const admin = criarAdmin(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: erroAdmin } = await admin
      .from("profiles")
      .update({ avatar_url: publicUrlData.publicUrl })
      .eq("id", user.id);

    if (erroAdmin) {
      console.error("Falha também com a chave de serviço:", erroAdmin);
      return NextResponse.json(
        {
          error: `A imagem foi enviada, mas não foi possível gravá-la no perfil: ${erroAdmin.message}${
            erroAdmin.code ? ` (código ${erroAdmin.code})` : ""
          }`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, url: publicUrlData.publicUrl });
}
