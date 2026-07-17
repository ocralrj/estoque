-- ============================================================
-- SCRIPT: Verificar se o usuário foi criado corretamente
-- Execute após criar o usuário super admin
-- ============================================================

-- 1. Verificar se o usuário existe em auth.users
SELECT
  id,
  email,
  email_confirmed_at,
  created_at,
  raw_user_meta_data->>'full_name' as nome_completo
FROM auth.users
WHERE email = 'jadirconsult@gmail.com';

-- 2. Verificar se o perfil foi criado com role super_admin
SELECT
  id,
  email,
  full_name,
  role,
  active,
  created_at
FROM profiles
WHERE email = 'jadirconsult@gmail.com';

-- 3. Verificar todos os usuários com role super_admin
SELECT
  p.email,
  p.full_name,
  p.role,
  p.active,
  p.created_at
FROM profiles p
WHERE p.role = 'super_admin'
ORDER BY p.created_at DESC;
