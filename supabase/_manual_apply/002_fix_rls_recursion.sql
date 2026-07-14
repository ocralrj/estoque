-- ============================================================
-- FIX: Remover recursão infinita nas políticas RLS de profiles
-- Executar no Supabase Dashboard → SQL Editor
--
-- PROBLEMA:
-- Políticas que fazem SELECT em profiles dentro de USING(...)
-- criam loop infinito quando RLS está habilitado na própria tabela
--
-- SOLUÇÃO:
-- Usar função SECURITY DEFINER que bypassa RLS para ler role
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

-- Remover políticas recursivas antigas
DROP POLICY IF EXISTS "Super admin e gestor veem todos os perfis" ON profiles;
DROP POLICY IF EXISTS "Super admin atualiza qualquer perfil" ON profiles;
DROP POLICY IF EXISTS "Usuário atualiza seu próprio perfil" ON profiles;

-- Recriar políticas usando a função helper (sem recursão)
CREATE POLICY "Super admin e gestor veem todos os perfis"
  ON profiles FOR SELECT
  USING (public.get_user_role() IN ('super_admin', 'gestor'));

CREATE POLICY "Super admin atualiza qualquer perfil"
  ON profiles FOR UPDATE
  USING (public.get_user_role() = 'super_admin');

CREATE POLICY "Usuário atualiza seu próprio perfil"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (role = public.get_user_role());

-- ============================================================
-- Aplicar mesmo fix nas outras tabelas afetadas
-- ============================================================

-- Categories
DROP POLICY IF EXISTS "Super admin e gestor gerenciam categorias" ON categories;
CREATE POLICY "Super admin e gestor gerenciam categorias"
  ON categories FOR ALL
  USING (public.get_user_role() IN ('super_admin', 'gestor'));

-- Products (SELECT policy para super_admin)
DROP POLICY IF EXISTS "Super admin vê todos os produtos" ON products;
CREATE POLICY "Super admin vê todos os produtos"
  ON products FOR SELECT
  USING (public.get_user_role() = 'super_admin');

-- Products (ALL policy)
DROP POLICY IF EXISTS "Super admin, gestor e almoxarife gerenciam produtos" ON products;
CREATE POLICY "Super admin, gestor e almoxarife gerenciam produtos"
  ON products FOR ALL
  USING (public.get_user_role() IN ('super_admin', 'gestor', 'almoxarife'));

-- Movements (INSERT policy)
DROP POLICY IF EXISTS "Almoxarife registra movimentações" ON movements;
CREATE POLICY "Almoxarife registra movimentações"
  ON movements FOR INSERT
  WITH CHECK (public.get_user_role() IN ('super_admin', 'gestor', 'almoxarife'));

-- ============================================================
-- VERIFICAÇÃO:
-- Após executar, rodar novamente 000_teste_rls_anon.sql
-- Agora não deve retornar erro de recursão infinita
-- ============================================================
