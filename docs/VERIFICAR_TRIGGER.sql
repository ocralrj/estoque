-- Execute este script no Supabase SQL Editor para verificar o trigger

-- 1. Verificar se o trigger existe
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 2. Verificar se a função existe
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'handle_new_user';

-- 3. Verificar se a tabela profiles existe
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'profiles';

-- 4. Verificar se o tipo user_role existe
SELECT
  typname,
  typcategory
FROM pg_type
WHERE typname = 'user_role';

-- 5. Contar usuários existentes
SELECT COUNT(*) as total_users FROM auth.users;

-- 6. Contar profiles existentes
SELECT COUNT(*) as total_profiles FROM profiles;

-- 7. Ver usuários sem profile (problema comum)
SELECT
  u.id,
  u.email,
  u.created_at
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;
