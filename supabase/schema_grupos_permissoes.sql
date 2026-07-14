-- ============================================================
-- FASE 1: GRUPOS DE USUÁRIOS E PERMISSÕES GRANULARES
-- Sistema de grupos e permissões para o ERP OCRAL
-- ============================================================

-- Tabela de grupos de usuários
CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de membros dos grupos
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Tabela de permissões disponíveis
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL, -- 'estoque', 'certificados', 'ged', 'admin'
  resource TEXT NOT NULL, -- 'products', 'certificates', 'documents', 'users'
  action TEXT NOT NULL, -- 'create', 'read', 'update', 'delete', 'download', 'upload'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(module, resource, action)
);

-- Tabela de permissões atribuídas a grupos
CREATE TABLE IF NOT EXISTS group_permissions (
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, permission_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_permissions_group_id ON group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- Trigger para updated_at em user_groups
CREATE TRIGGER update_user_groups_updated_at
  BEFORE UPDATE ON user_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS Policies para user_groups
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

-- Super admin pode fazer tudo
CREATE POLICY user_groups_super_admin_all ON user_groups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Gestor pode visualizar grupos
CREATE POLICY user_groups_gestor_read ON user_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'gestor')
    )
  );

-- RLS Policies para group_members
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Super admin pode fazer tudo
CREATE POLICY group_members_super_admin_all ON group_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Usuários podem ver seus próprios grupos
CREATE POLICY group_members_own_read ON group_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Gestor pode visualizar membros de grupos
CREATE POLICY group_members_gestor_read ON group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'gestor'
    )
  );

-- RLS Policies para permissions
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Todos podem visualizar permissões disponíveis
CREATE POLICY permissions_read_all ON permissions
  FOR SELECT
  USING (true);

-- Super admin pode criar/editar permissões
CREATE POLICY permissions_super_admin_all ON permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RLS Policies para group_permissions
ALTER TABLE group_permissions ENABLE ROW LEVEL SECURITY;

-- Super admin pode fazer tudo
CREATE POLICY group_permissions_super_admin_all ON group_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Usuários podem ver permissões dos seus grupos
CREATE POLICY group_permissions_own_read ON group_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_permissions.group_id
      AND group_members.user_id = auth.uid()
    )
  );

-- Gestor pode visualizar permissões de grupos
CREATE POLICY group_permissions_gestor_read ON group_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'gestor'
    )
  );

-- Função para verificar se usuário tem permissão
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_module TEXT,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_permission BOOLEAN;
  v_user_role user_role;
BEGIN
  -- Super admin tem todas as permissões
  SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
  IF v_user_role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- Verificar se usuário pertence a grupo com essa permissão
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    JOIN group_permissions gp ON gp.group_id = gm.group_id
    JOIN permissions p ON p.id = gp.permission_id
    WHERE gm.user_id = p_user_id
    AND p.module = p_module
    AND p.resource = p_resource
    AND p.action = p_action
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$;

-- Função para obter todas as permissões de um usuário
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE (
  module TEXT,
  resource TEXT,
  action TEXT,
  description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.module,
    p.resource,
    p.action,
    p.description
  FROM group_members gm
  JOIN group_permissions gp ON gp.group_id = gm.group_id
  JOIN permissions p ON p.id = gp.permission_id
  WHERE gm.user_id = p_user_id;
END;
$$;

-- Inserir permissões padrão do sistema
INSERT INTO permissions (module, resource, action, description) VALUES
-- Estoque
('estoque', 'products', 'create', 'Criar produtos'),
('estoque', 'products', 'read', 'Visualizar produtos'),
('estoque', 'products', 'update', 'Editar produtos'),
('estoque', 'products', 'delete', 'Excluir produtos'),
('estoque', 'movements', 'create', 'Registrar movimentações'),
('estoque', 'movements', 'read', 'Visualizar movimentações'),
('estoque', 'movements', 'delete', 'Excluir movimentações'),
('estoque', 'categories', 'create', 'Criar categorias'),
('estoque', 'categories', 'read', 'Visualizar categorias'),
('estoque', 'categories', 'update', 'Editar categorias'),
('estoque', 'categories', 'delete', 'Excluir categorias'),
('estoque', 'reports', 'read', 'Visualizar relatórios'),

-- Certificados
('certificados', 'certificates', 'create', 'Cadastrar certificados'),
('certificados', 'certificates', 'read', 'Visualizar certificados'),
('certificados', 'certificates', 'update', 'Editar certificados'),
('certificados', 'certificates', 'delete', 'Excluir certificados'),
('certificados', 'certificates', 'upload', 'Upload de arquivos de certificados'),
('certificados', 'certificates', 'download', 'Download de certificados'),

-- GED
('ged', 'documents', 'create', 'Criar documentos'),
('ged', 'documents', 'read', 'Visualizar documentos'),
('ged', 'documents', 'update', 'Editar documentos'),
('ged', 'documents', 'delete', 'Excluir documentos'),
('ged', 'documents', 'upload', 'Upload de documentos'),
('ged', 'documents', 'download', 'Download de documentos'),
('ged', 'folders', 'create', 'Criar pastas'),
('ged', 'folders', 'read', 'Visualizar pastas'),
('ged', 'folders', 'update', 'Editar pastas'),
('ged', 'folders', 'delete', 'Excluir pastas'),

-- Admin
('admin', 'users', 'create', 'Criar usuários'),
('admin', 'users', 'read', 'Visualizar usuários'),
('admin', 'users', 'update', 'Editar usuários'),
('admin', 'users', 'delete', 'Excluir usuários'),
('admin', 'groups', 'create', 'Criar grupos'),
('admin', 'groups', 'read', 'Visualizar grupos'),
('admin', 'groups', 'update', 'Editar grupos'),
('admin', 'groups', 'delete', 'Excluir grupos'),
('admin', 'permissions', 'manage', 'Gerenciar permissões'),
('admin', 'audit', 'read', 'Visualizar auditoria')
ON CONFLICT (module, resource, action) DO NOTHING;

-- Criar grupos padrão baseados nas roles existentes
INSERT INTO user_groups (name, description) VALUES
('Gestores', 'Grupo de gestores com permissões administrativas'),
('Almoxarifes', 'Grupo de almoxarifes com permissões de estoque'),
('Requisitantes', 'Grupo de requisitantes com permissões básicas')
ON CONFLICT (name) DO NOTHING;

-- Comentários para documentação
COMMENT ON TABLE user_groups IS 'Grupos de usuários para permissões granulares';
COMMENT ON TABLE group_members IS 'Membros dos grupos de usuários';
COMMENT ON TABLE permissions IS 'Permissões disponíveis no sistema';
COMMENT ON TABLE group_permissions IS 'Permissões atribuídas a grupos';
COMMENT ON FUNCTION user_has_permission IS 'Verifica se usuário tem uma permissão específica';
COMMENT ON FUNCTION get_user_permissions IS 'Retorna todas as permissões de um usuário';
