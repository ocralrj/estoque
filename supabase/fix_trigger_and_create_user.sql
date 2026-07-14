-- ============================================================
-- SCRIPT DE CORREÇÃO: Trigger e Criação de Usuário
-- Execute este script inteiro no SQL Editor do Supabase
-- ============================================================

-- 1. VERIFICAR ESTADO ATUAL
SELECT 'Verificando tabela profiles...' as status;
SELECT COUNT(*) as profiles_count FROM profiles;

SELECT 'Verificando trigger...' as status;
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

SELECT 'Verificando usuários sem profile...' as status;
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- ============================================================
-- 2. RECRIAR TRIGGER COM MELHOR TRATAMENTO DE ERRO
-- ============================================================

-- Dropar trigger antigo
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recriar função com melhor log de erros
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_value user_role;
BEGIN
  -- Determinar role baseado no email
  IF new.email IN ('administrador@ocral.com.br', 'jadirconsult@gmail.com') THEN
    user_role_value := 'super_admin'::user_role;
  ELSE
    user_role_value := 'requisitante'::user_role;
  END IF;

  -- Inserir profile
  INSERT INTO public.profiles (id, email, full_name, role, active)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    user_role_value,
    true
  );

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erro ao criar profile para %: %', new.email, SQLERRM;
    RETURN new; -- Não falhar a criação do usuário mesmo se o profile falhar
END;
$$;

-- Recriar trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 3. LIMPAR USUÁRIOS SEM PROFILE (se existirem)
-- ============================================================

-- Criar profiles para usuários que já existem mas não têm profile
INSERT INTO profiles (id, email, full_name, role, active)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  CASE
    WHEN u.email IN ('administrador@ocral.com.br', 'jadirconsult@gmail.com')
    THEN 'super_admin'::user_role
    ELSE 'requisitante'::user_role
  END,
  true
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. VERIFICAR NOVAMENTE
-- ============================================================

SELECT 'Verificação final...' as status;
SELECT COUNT(*) as profiles_count FROM profiles;
SELECT COUNT(*) as users_count FROM auth.users;

SELECT 'Usuários sem profile após correção:' as status;
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;
