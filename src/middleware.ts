import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicRoute = pathname === "/";
  // Telas de /auth que uma pessoa JÁ autenticada precisa alcançar.
  //
  // A regra abaixo tira de /auth quem já entrou, o que faz sentido para o
  // login. Mas há telas ali que só existem para quem tem sessão, e mandá-las
  // para o dashboard cria um laço: o dashboard devolve para a tela, a tela
  // devolve para o dashboard, e a pessoa fica presa numa página que nunca
  // termina de carregar.
  //
  // Foi o que aconteceu com a troca da senha inicial: quem era pré-cadastrado
  // entrava, era mandado para /auth/trocar-senha pelo layout, voltava para
  // /dashboard pelo middleware, e não conseguia nem trocar a senha nem usar o
  // sistema. Toda tela nova sob /auth destinada a quem tem sessão precisa
  // entrar nesta lista.
  const isPasswordRecoveryRoute =
    pathname.startsWith("/auth/reset-password") ||
    pathname.startsWith("/auth/trocar-senha") ||
    pathname.startsWith("/auth/callback");

  if (!user && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (user && isAuthRoute && !isPasswordRecoveryRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  // `api` fica de fora: rotas de API autenticam por conta própria (sessão ou
  // CRON_SECRET) e não têm cookie de navegador. Sem esta exclusão o middleware
  // redirecionava /api/internal/keep-alive para o login com 307, e a rotina
  // anti-pausa do Supabase nunca chegava a executar.
  //
  // Os arquivos estáticos também ficam de fora, e a lista precisa cobrir todos
  // os que a tela de login usa: quem ainda não entrou é redirecionado por este
  // middleware, então qualquer mídia esquecida aqui volta 307 justamente na
  // única tela em que ninguém está autenticado. Foi o que aconteceu com o
  // vídeo da marca, que só tinha imagens na lista.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|ogg|mp3|woff|woff2|ttf|otf)$).*)",
  ],
};
