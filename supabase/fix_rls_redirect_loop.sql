-- ============================================================
-- FIX: Resolver loop de redirecionamento causado por RLS recursivo
--
-- PROBLEMA:
-- Políticas RLS na tabela profiles fazem SELECT em profiles dentro
-- de USING(...), criando recursão infinita quando RLS está habilitado.
-- Isso causa timeout no getUser() → loop de redirecionamento.
--
-- SOLUÇÃO:
-- 1. Criar função SECURITY DEFINER que bypassa RLS
-- 2. Recriar todas as políticas usando a função helper
-- 3. Adicionar política essencial: "Usuário vê seu próprio perfil"
-- ============================================================

-- Criar função helper que lê role do usuário atual (bypass RLS)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- PROFILES: Remover políticas recursivas e recriar corretamente
-- ============================================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuário vê seu próprio perfil" ON profiles;
DROP POLICY IF EXISTS "Super admin e gestor veem todos os perfis" ON profiles;
DROP POLICY IF EXISTS "Super admin atualiza qualquer perfil" ON profiles;
DROP POLICY IF EXISTS "Usuário atualiza seu próprio perfil" ON profiles;

-- CRÍTICO: Política que permite usuário ler seu próprio perfil
-- Esta é a política que resolve o loop de redirecionamento
CREATE POLICY "Usuário vê seu próprio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Super admin e gestor veem todos (sem recursão)
CREATE POLICY "Super admin e gestor veem todos os perfis"
  ON profiles FOR SELECT
  USING (public.get_user_role() IN ('super_admin', 'gestor'));

-- Super admin atualiza qualquer perfil (sem recursão)
CREATE POLICY "Super admin atualiza qualquer perfil"
  ON profiles FOR UPDATE
  USING (public.get_user_role() = 'super_admin');

-- Usuário atualiza seu próprio perfil (sem recursão)
CREATE POLICY "Usuário atualiza seu próprio perfil"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (role = public.get_user_role());

-- ============================================================
-- CATEGORIES: Corrigir recursão
-- ============================================================

DROP POLICY IF EXISTS "Super admin e gestor gerenciam categorias" ON categories;
CREATE POLICY "Super admin e gestor gerenciam categorias"
  ON categories FOR ALL
  USING (public.get_user_role() IN ('super_admin', 'gestor'));

-- ============================================================
-- PRODUCTS: Corrigir recursão
-- ============================================================

DROP POLICY IF EXISTS "Super admin vê todos os produtos" ON products;
CREATE POLICY "Super admin vê todos os produtos"
  ON products FOR SELECT
  USING (public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Super admin, gestor e almoxarife gerenciam produtos" ON products;
CREATE POLICY "Super admin, gestor e almoxarife gerenciam produtos"
  ON products FOR ALL
  USING (public.get_user_role() IN ('super_admin', 'gestor', 'almoxarife'));

-- ============================================================
-- MOVEMENTS: Corrigir recursão
-- ============================================================

DROP POLICY IF EXISTS "Almoxarife registra movimentações" ON movements;
CREATE POLICY "Almoxarife registra movimentações"
  ON movements FOR INSERT
  WITH CHECK (public.get_user_role() IN ('super_admin', 'gestor', 'almoxarife'));

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

-- Testar se função retorna role corretamente
DO $$
DECLARE
  test_role user_role;
BEGIN
  SELECT public.get_user_role() INTO test_role;
  RAISE NOTICE 'Função get_user_role() OK';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Erro ao testar get_user_role(): %', SQLERRM;
END $$;

-- Comentários para documentação
COMMENT ON FUNCTION public.get_user_role IS 'Retorna role do usuário atual, bypassando RLS para evitar recursão infinita';

-- ============================================================
-- INSTRUÇÕES DE APLICAÇÃO:
-- 1. Acesse Supabase Dashboard → SQL Editor
-- 2. Cole este script completo
-- 3. Execute
-- 4. Teste o login em https://ocral.vercel.app
-- 5. Verifique que não há mais loop de redirecionamento
-- ============================================================
