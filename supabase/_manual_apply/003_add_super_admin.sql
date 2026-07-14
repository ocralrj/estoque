-- ============================================================
-- ATUALIZAÇÃO: Adicionar novo super admin
-- Executar no Supabase Dashboard → SQL Editor
-- ============================================================

-- Atualizar função para incluir jadirconsult@gmail.com como super_admin
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN new.email IN ('administrador@ocral.com.br', 'jadirconsult@gmail.com') THEN 'super_admin'::user_role
      ELSE 'requisitante'::user_role
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ATUALIZAR PERFIL EXISTENTE (se o usuário já estiver cadastrado)
-- ============================================================

-- Verificar se o usuário jadirconsult@gmail.com já existe
DO $$
DECLARE
  user_id uuid;
BEGIN
  -- Buscar ID do usuário na tabela auth.users
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = 'jadirconsult@gmail.com';

  -- Se encontrou, atualizar role para super_admin
  IF user_id IS NOT NULL THEN
    UPDATE profiles
    SET role = 'super_admin'::user_role
    WHERE id = user_id;

    RAISE NOTICE 'Perfil de jadirconsult@gmail.com atualizado para super_admin';
  ELSE
    RAISE NOTICE 'Usuário jadirconsult@gmail.com ainda não está cadastrado';
  END IF;
END $$;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================

-- Listar todos os super admins
SELECT email, full_name, role
FROM profiles
WHERE role = 'super_admin'
ORDER BY email;
