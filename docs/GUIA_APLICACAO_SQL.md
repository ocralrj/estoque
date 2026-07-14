# Guia de Aplicação do Script SQL no Supabase

## Problema Identificado

**Sintoma:** Sistema trava ao fazer login - erro `ERR_TOO_MANY_REDIRECTS`

**Causa Raiz:** Políticas RLS (Row Level Security) recursivas na tabela `profiles` criam loop infinito:

1. Middleware verifica autenticação → sessão válida
2. Dashboard tenta buscar perfil: `SELECT FROM profiles WHERE id = user.id`
3. RLS precisa verificar permissão → executa política
4. Política faz `SELECT FROM profiles` para verificar role → ativa RLS novamente
5. **Loop infinito** → timeout → `getUser()` retorna null
6. Dashboard redireciona para `/auth/login`
7. Middleware vê usuário autenticado em rota de auth → redireciona para `/dashboard`
8. **ERR_TOO_MANY_REDIRECTS**

## Solução

Aplicar o script [fix_rls_redirect_loop.sql](../supabase/fix_rls_redirect_loop.sql) que:

1. Cria função `get_user_role()` com `SECURITY DEFINER` que bypassa RLS
2. Recriar políticas usando a função helper (sem recursão)
3. Adicionar política essencial: "Usuário vê seu próprio perfil"

## Passo a Passo para Aplicação

### 1. Acessar Supabase Dashboard

Acesse: https://supabase.com/dashboard/project/_/sql

Substitua `_` pelo ID do seu projeto OCRAL.

### 2. Abrir SQL Editor

No menu lateral esquerdo, clique em:
- **SQL Editor** → **New query**

### 3. Colar o Script

Abra o arquivo `supabase/fix_rls_redirect_loop.sql` e copie **todo** o conteúdo.

Cole no editor SQL do Supabase.

### 4. Executar o Script

Clique no botão **Run** (ou pressione Ctrl+Enter / Cmd+Enter).

Aguarde a execução completa. Você verá mensagens de sucesso.

### 5. Verificar Execução

O script deve executar sem erros. Se houver erros, verifique:

- Se você já aplicou o script antes (políticas duplicadas)
- Se a tabela `profiles` existe
- Se o tipo `user_role` está definido

### 6. Testar o Sistema

Após aplicar o script:

1. Acesse: https://ocral.vercel.app
2. Faça login com suas credenciais
3. Verifique que **não há mais loop de redirecionamento**
4. Confirme que o dashboard carrega corretamente

## O Que o Script Faz

### Função Helper (Bypass RLS)

```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER  -- ← Executa com privilégios do criador, bypassando RLS
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;
```

### Políticas Corrigidas

#### ANTES (recursivo - causa loop):
```sql
CREATE POLICY "Super admin e gestor veem todos os perfis"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p  -- ← PROBLEMA: consulta profiles dentro da política
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'gestor')
    )
  );
```

#### DEPOIS (sem recursão):
```sql
-- Política essencial: usuário vê próprio perfil (resolve o loop principal)
CREATE POLICY "Usuário vê seu próprio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Política para super_admin/gestor (sem recursão)
CREATE POLICY "Super admin e gestor veem todos os perfis"
  ON profiles FOR SELECT
  USING (public.get_user_role() IN ('super_admin', 'gestor'));
```

## Tabelas Afetadas

O script corrige recursão em:

- ✅ `profiles` (crítico - causa o loop)
- ✅ `categories`
- ✅ `products`
- ✅ `movements`

## Troubleshooting

### Erro: "policy already exists"

**Solução:** O script já foi aplicado antes. Execute apenas as linhas de `DROP POLICY` primeiro, depois execute novamente.

### Erro: "function get_user_role already exists"

**Solução:** Normal se já aplicou antes. O `CREATE OR REPLACE` deve resolver.

### Erro: "type user_role does not exist"

**Solução:** Execute primeiro o schema principal: `supabase/schema_estoque.sql`

### Sistema ainda trava após aplicar

**Verificações:**

1. Limpe cache do navegador (Ctrl+Shift+Delete)
2. Tente em janela anônima/privada
3. Verifique console do navegador (F12) para erros JavaScript
4. Teste com `curl` para isolar se é problema de browser:

```bash
curl -I https://ocral.vercel.app/dashboard
```

Se retornar muitos `302 Found`, o problema persiste no servidor.

## Impacto da Correção

**Antes:**
- Login funciona
- Redirecionamento para dashboard causa timeout
- Loop infinito de redirecionamento
- Sistema inacessível quando logado

**Depois:**
- Login funciona
- Dashboard carrega normalmente
- Queries RLS executam sem recursão
- Sistema funcional para todos os usuários

## Manutenção Futura

Ao criar novas políticas RLS:

1. **NUNCA** faça `SELECT FROM profiles` dentro de `USING(...)` ou `WITH CHECK(...)`
2. **SEMPRE** use `public.get_user_role()` para verificar role do usuário
3. **OU** use `auth.uid() = id` para verificações de propriedade

### Exemplo Correto de Nova Política

```sql
-- ✅ CORRETO: usa função helper
CREATE POLICY "Gestores gerenciam certificados"
  ON certificates FOR ALL
  USING (public.get_user_role() IN ('super_admin', 'gestor'));

-- ❌ ERRADO: recursão infinita
CREATE POLICY "Gestores gerenciam certificados"
  ON certificates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'gestor'
    )
  );
```

## Documentação Relacionada

- [PADROES_CODIGO_ESTRUTURA.md](./PADROES_CODIGO_ESTRUTURA.md) - Padrões de código do projeto
- [ERP_PLANEJAMENTO_ESTRATEGICO.md](./ERP_PLANEJAMENTO_ESTRATEGICO.md) - Planejamento estratégico do ERP
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)

## Histórico de Versões

- **v1.0** (2026-07-14): Criação do guia e script de correção
  - Identificação do problema de RLS recursivo
  - Implementação da função `get_user_role()`
  - Correção de todas as políticas afetadas
