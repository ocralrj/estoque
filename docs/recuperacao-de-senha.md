# Recuperação de senha em produção

O link de redefinição usa automaticamente o domínio que o usuário acessou. Para funcionar no ambiente publicado, configure o domínio definitivo também no Supabase:

1. Acesse **Authentication > URL Configuration** no projeto Supabase.
2. Em **Site URL**, informe `https://SEU-DOMINIO`.
3. Em **Redirect URLs**, adicione `https://SEU-DOMINIO/auth/callback`.
4. No provedor de deploy, defina `NEXT_PUBLIC_APP_URL=https://SEU-DOMINIO` e faça um novo deploy.

Para desenvolvimento local, mantenha `http://localhost:3000/auth/callback` em **Redirect URLs** e `NEXT_PUBLIC_APP_URL=http://localhost:3000` no arquivo local.

O endereço de produção precisa usar HTTPS e não pode apontar para `localhost`.
