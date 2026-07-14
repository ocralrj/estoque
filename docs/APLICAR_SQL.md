# AÇÃO NECESSÁRIA: Aplicar Script SQL no Supabase

## Problema Atual
O site https://ocralrj.vercel.app está funcionando, mas o login com `jadirconsult@gmail.com` falha porque o script SQL ainda não foi aplicado no banco de dados.

## Solução: Executar Script SQL

### Passo a Passo

1. **Acesse o Supabase Dashboard**
   - Entre em https://supabase.com/dashboard
   - Faça login com sua conta
   - Selecione o projeto OCRAL (URL: `https://ffsymnxutfjmvwnurfby.supabase.co`)

2. **Abra o SQL Editor**
   - No menu lateral esquerdo, clique em **SQL Editor**
   - Clique em **New Query**

3. **Copie e cole o script**
   
   Copie TODO o conteúdo abaixo:

```sql
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
```

4. **Execute o script**
   - Clique no botão **Run** (ou pressione Ctrl+Enter)
   - Aguarde a execução (deve levar ~2 segundos)

5. **Verifique o resultado**
   - O script deve exibir uma tabela com os super admins
   - Você deve ver uma mensagem indicando se o usuário foi atualizado ou ainda não está cadastrado

## Após Executar o Script

### Se o usuário `jadirconsult@gmail.com` JÁ EXISTE no banco:
- O script atualiza automaticamente a role para `super_admin`
- Você pode fazer login imediatamente em https://ocralrj.vercel.app
  - Email: `jadirconsult@gmail.com`
  - Senha: `#Mudar@123`

### Se o usuário `jadirconsult@gmail.com` NÃO EXISTE ainda:
1. Acesse https://ocralrj.vercel.app/auth/register
2. Cadastre-se com:
   - Email: `jadirconsult@gmail.com`
   - Senha: `#Mudar@123`
   - Nome completo: (seu nome)
3. O sistema automaticamente atribuirá a role `super_admin`
4. Faça login normalmente

## Próximos Scripts Recomendados

Após aplicar o script 003, você pode executar os seguintes scripts de melhoria:

1. **[000_teste_rls_anon.sql](supabase/_manual_apply/000_teste_rls_anon.sql)**
   - Testa vazamento de dados via role `anon`
   - Verifica segurança do RLS
   - Recomendado: executar após qualquer alteração em políticas

2. **[001_indices_performance.sql](supabase/_manual_apply/001_indices_performance.sql)**
   - Cria índices para performance
   - Impacto: queries 5-100x mais rápidas
   - Idempotente: pode executar múltiplas vezes

## Arquivos de Referência

- Script completo: [supabase/_manual_apply/003_add_super_admin.sql](supabase/_manual_apply/003_add_super_admin.sql)
- Documentação de setup: [docs/SETUP.md](docs/SETUP.md)
- Requisitos do ERP: [docs/REQUISITOS_ERP.md](docs/REQUISITOS_ERP.md)
- Configuração Vercel: [docs/VERCEL_CONFIG.md](docs/VERCEL_CONFIG.md)
