# Como Criar Usuário Super Admin no Supabase

## Site Deployado
- **URL**: https://ocral.vercel.app
- **Status**: Funcionando com variáveis de ambiente configuradas

## Criar usuário jadirconsult@gmail.com

### Opção 1: Via Dashboard do Supabase (RECOMENDADO)

1. Acesse https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby
2. No menu lateral, clique em **Authentication**
3. Clique na aba **Users**
4. Clique no botão **Add user** (ou **Invite user**)
5. Preencha:
   - **Email**: `jadirconsult@gmail.com`
   - **Password**: `#Mudar@123`
   - Marque **Auto Confirm User** (para não precisar confirmar o email)
6. Clique em **Create user**

O trigger `handle_new_user()` será executado automaticamente e criará o perfil com role `super_admin`.

### Opção 2: Via SQL Editor

Se preferir criar via SQL:

```sql
-- 1. Criar o usuário na tabela auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'jadirconsult@gmail.com',
  crypt('#Mudar@123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Administrador OCRAL"}',
  false,
  ''
);

-- O trigger handle_new_user() criará automaticamente o perfil com role super_admin
```

### Opção 3: Via Página de Registro

1. Acesse https://ocral.vercel.app/auth/register
2. Preencha:
   - **Nome completo**: `Administrador OCRAL`
   - **Email**: `jadirconsult@gmail.com`
   - **Senha**: `#Mudar@123`
3. Clique em **Cadastrar**

O sistema criará o usuário e o trigger automático atribuirá a role `super_admin`.

## Verificar se funcionou

Após criar o usuário:

1. Acesse https://ocral.vercel.app/auth/login
2. Login:
   - **Email**: `jadirconsult@gmail.com`
   - **Senha**: `#Mudar@123`
3. Você deve ser redirecionado para o dashboard

## Troubleshooting

### Erro "Email ou senha inválidos"
- Verifique se o usuário foi criado no Supabase (Authentication → Users)
- Confirme que o email está correto (sem espaços ou caracteres extras)
- Verifique se a senha está correta

### Erro "Database error saving new user"
- Indica que o schema não está aplicado corretamente
- Execute o arquivo [supabase/schema_estoque.sql](../supabase/schema_estoque.sql) no SQL Editor do Supabase
- Certifique-se de que a tabela `profiles` existe e o trigger `on_auth_user_created` está ativo

## Resumo da Configuração

- Site: https://ocral.vercel.app
- Projeto Vercel: ocral
- Supabase URL: https://ffsymnxutfjmvwnurfby.supabase.co
- Email Super Admin: jadirconsult@gmail.com
- Senha: #Mudar@123
