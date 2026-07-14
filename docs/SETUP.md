# Guia de Configuração - Sistema ERP OCRAL

## Credenciais do Super Admin

### Contas com acesso super_admin

1. **jadirconsult@gmail.com**
   - Senha: `#Mudar@123`
   - Status: Configurado no sistema

2. **administrador@ocral.com.br**
   - Senha: (definida no primeiro registro)
   - Status: Disponível para registro

## Aplicar Configurações no Supabase

### 1. Atualizar função handle_new_user

Execute o script [supabase/_manual_apply/003_add_super_admin.sql](../supabase/_manual_apply/003_add_super_admin.sql) no Supabase SQL Editor.

Este script:
- Atualiza a função `handle_new_user` para reconhecer `jadirconsult@gmail.com` como super admin
- Se o usuário já estiver cadastrado, atualiza automaticamente sua role para `super_admin`
- Lista todos os super admins após a execução

**Tempo de execução:** ~5 segundos

### 2. Verificar aplicação

Após executar o script, você pode verificar os super admins com:

```sql
SELECT email, full_name, role
FROM profiles
WHERE role = 'super_admin'
ORDER BY email;
```

## Próximos Passos

### Scripts pendentes de aplicação:

1. **[000_teste_rls_anon.sql](../supabase/_manual_apply/000_teste_rls_anon.sql)**
   - Testa vazamento de dados via role `anon`
   - Verifica se RLS está funcionando corretamente
   - Recomendado executar após qualquer alteração em políticas RLS

2. **[001_indices_performance.sql](../supabase/_manual_apply/001_indices_performance.sql)**
   - Cria índices para otimização de performance
   - Impacto: queries 5-100x mais rápidas com crescimento de dados
   - Idempotente: pode executar múltiplas vezes

3. **[002_fix_rls_recursion.sql](../supabase/_manual_apply/002_fix_rls_recursion.sql)**
   - Status: JÁ APLICADO
   - Corrige recursão infinita nas políticas RLS

## Deploy no Vercel

### Status Atual
- Variáveis de ambiente: CONFIGURADAS
- Deployment: PENDENTE

### Ação Necessária

O site está retornando 404 DEPLOYMENT_NOT_FOUND. Para resolver:

**Opção 1: Redeploy manual no Vercel Dashboard**
1. Acesse https://vercel.com/dashboard
2. Selecione o projeto "ocralrj"
3. Vá em **Deployments**
4. Clique nos três pontinhos (...) do deployment mais recente
5. Selecione **Redeploy**
6. Confirme

**Opção 2: Forçar deployment via Git**
```bash
git commit --allow-empty -m "chore: trigger Vercel deployment"
git push origin main
```

Consulte [VERCEL_CONFIG.md](VERCEL_CONFIG.md) para mais detalhes.

## Primeiro Acesso ao Sistema

1. Acesse https://ocralrj.vercel.app (após o redeploy)
2. Faça login com `jadirconsult@gmail.com` e senha `#Mudar@123`
3. Configure outros usuários através do painel de usuários no dashboard

## Estrutura de Permissões

| Role | Descrição | Permissões |
|---|---|---|
| **super_admin** | Administrador total | Acesso completo ao sistema, gerencia usuários e permissões |
| **gestor** | Gestor de operações | Visualiza relatórios, gerencia usuários, visualiza produtos e movimentações |
| **almoxarife** | Operador do almoxarifado | Registra movimentações (entrada/saída), gerencia produtos, visualiza alertas |
| **requisitante** | Usuário padrão | Visualiza produtos (somente leitura), não pode registrar movimentações |

## Referências

- Documento de requisitos completo: [REQUISITOS_ERP.md](REQUISITOS_ERP.md)
- Configuração do Vercel: [VERCEL_CONFIG.md](VERCEL_CONFIG.md)
- Schema do banco: [supabase/schema_estoque.sql](../supabase/schema_estoque.sql)
- README geral: [README.md](../README.md)
