-- ============================================================
-- SCRIPT: Criar usuário Super Admin no Supabase
-- Email: jadirconsult@gmail.com
-- Senha: #Mudar@123
-- ============================================================

-- ATENÇÃO: Execute este script no Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql

-- O usuário será criado com role 'super_admin' automaticamente
-- pelo trigger handle_new_user() que verifica o email

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

-- O trigger handle_new_user() será executado automaticamente e criará:
-- - Registro na tabela 'profiles' com role 'super_admin'
-- - ID vinculado ao auth.users
