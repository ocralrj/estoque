-- ============================================================
-- SCHEMA DE AUDITORIA - ERP OCRAL
-- Sistema transversal de auditoria para todos os módulos
-- ============================================================

-- Criar tabela de auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  module TEXT NOT NULL, -- 'estoque', 'certificados', 'ged', 'admin'
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'view', 'download', 'upload'
  resource_type TEXT NOT NULL, -- 'product', 'movement', 'certificate', 'document', 'user', 'group'
  resource_id TEXT, -- ID do recurso afetado
  details JSONB, -- Detalhes adicionais da ação
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- RLS Policies para audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Super admin pode ver tudo
CREATE POLICY audit_logs_super_admin_all ON audit_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Gestor pode ver logs relacionados ao seu trabalho
CREATE POLICY audit_logs_gestor_read ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'gestor'
    )
  );

-- Função helper para registrar ações de auditoria
CREATE OR REPLACE FUNCTION log_audit(
  p_module TEXT,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id,
    module,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    auth.uid(),
    p_module,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

-- Trigger para auditoria automática em products
CREATE OR REPLACE FUNCTION audit_products_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'estoque',
      'create',
      'product',
      NEW.id::TEXT,
      jsonb_build_object('name', NEW.name, 'sku', NEW.sku)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'estoque',
      'update',
      'product',
      NEW.id::TEXT,
      jsonb_build_object(
        'old_name', OLD.name,
        'new_name', NEW.name,
        'old_quantity', OLD.quantity,
        'new_quantity', NEW.quantity
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'estoque',
      'delete',
      'product',
      OLD.id::TEXT,
      jsonb_build_object('name', OLD.name, 'sku', OLD.sku)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar trigger em products
DROP TRIGGER IF EXISTS products_audit_trigger ON products;
CREATE TRIGGER products_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW
  EXECUTE FUNCTION audit_products_changes();

-- Trigger para auditoria automática em movements
CREATE OR REPLACE FUNCTION audit_movements_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'estoque',
      'create',
      'movement',
      NEW.id::TEXT,
      jsonb_build_object(
        'product_id', NEW.product_id,
        'type', NEW.type,
        'quantity', NEW.quantity
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'estoque',
      'delete',
      'movement',
      OLD.id::TEXT,
      jsonb_build_object(
        'product_id', OLD.product_id,
        'type', OLD.type,
        'quantity', OLD.quantity
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar trigger em movements
DROP TRIGGER IF EXISTS movements_audit_trigger ON movements;
CREATE TRIGGER movements_audit_trigger
  AFTER INSERT OR DELETE ON movements
  FOR EACH ROW
  EXECUTE FUNCTION audit_movements_changes();

-- Trigger para auditoria automática em profiles (usuários)
CREATE OR REPLACE FUNCTION audit_profiles_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'admin',
      'create',
      'user',
      NEW.id::TEXT,
      jsonb_build_object('email', NEW.email, 'role', NEW.role)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'admin',
      'update',
      'user',
      NEW.id::TEXT,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'old_active', OLD.active,
        'new_active', NEW.active
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'admin',
      'delete',
      'user',
      OLD.id::TEXT,
      jsonb_build_object('email', OLD.email, 'role', OLD.role)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar trigger em profiles
DROP TRIGGER IF EXISTS profiles_audit_trigger ON profiles;
CREATE TRIGGER profiles_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_profiles_changes();

-- Função para limpar logs antigos (manutenção)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < now() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE audit_logs IS 'Tabela transversal de auditoria para todos os módulos do ERP';
COMMENT ON FUNCTION log_audit IS 'Função helper para registrar ações de auditoria manualmente';
COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Remove logs de auditoria mais antigos que X dias (padrão: 365)';
