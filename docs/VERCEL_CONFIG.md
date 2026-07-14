# Configuração do Vercel

## Problema Atual

Erro: `MIDDLEWARE_INVOCATION_FAILED` - `MIDDLEWARE_INVOCATION_FAILED`

**Causa**: Variáveis de ambiente do Supabase não configuradas no Vercel.

## Solução: Configurar Variáveis de Ambiente no Vercel

### Passos:

1. Acesse https://vercel.com/dashboard
2. Selecione o projeto **ocralrj** (URL: ocralrj.vercel.app)
3. Clique em **Settings** (menu superior)
4. No menu lateral, clique em **Environment Variables**
5. Adicione as seguintes variáveis:

#### Variável 1:
- **Name**: `NEXT_PUBLIC_SUPABASE_URL`
- **Value**: `https://ffsymnxutfjmvwnurfby.supabase.co`
- **Environments**: Marque as 3 checkboxes (Production, Preview, Development)
- Clique em **Save**

#### Variável 2:
- **Name**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmc3ltbnh1dGZqbXZ3bnVyZmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDU4NDQsImV4cCI6MjA5OTE4MTg0NH0.-BEjJ5-8QsJcvp-mJYHXupGZ1ajlIj4AK58BHjjpzwU`
- **Environments**: Marque as 3 checkboxes (Production, Preview, Development)
- Clique em **Save**

### 6. Redeploy (OBRIGATÓRIO)

**IMPORTANTE**: Adicionar variáveis de ambiente NÃO dispara deployment automático. Você DEVE fazer redeploy manual.

#### Se houver deployments na lista:
1. Vá em **Deployments** (menu lateral esquerdo ou superior)
2. Encontre o deployment mais recente na lista
3. Clique nos três pontinhos (...) à direita do deployment
4. Selecione **Redeploy**
5. Confirme clicando em **Redeploy** novamente

#### Se a lista de deployments estiver vazia:
O projeto pode não estar conectado ao repositório GitHub. Nesse caso:
1. Vá em **Settings** → **Git**
2. Verifique se o repositório está conectado
3. Se não estiver, clique em **Connect Git Repository**
4. Selecione o repositório `ocralrj/estoque` (ou o nome correto do seu repositório)
5. Após conectar, o Vercel fará o primeiro deployment automaticamente

#### Alternativa: Forçar deployment via Git
Se preferir, você pode forçar um novo deployment fazendo um push:
```bash
git commit --allow-empty -m "chore: trigger Vercel deployment"
git push origin main
```

### 7. Verificar

Após o redeploy completar (1-2 minutos):
1. Acesse https://ocralrj.vercel.app (ou sua URL do Vercel)
2. O erro 500 `MIDDLEWARE_INVOCATION_FAILED` deve desaparecer
3. Você deve ver a tela de login ou home page do sistema

## Referências

- Middleware: [src/middleware.ts:8-9](../src/middleware.ts#L8-L9)
- Supabase Client: [src/lib/supabase/client.ts:5-6](../src/lib/supabase/client.ts#L5-L6)
- Supabase Server: [src/lib/supabase/server.ts:7-8](../src/lib/supabase/server.ts#L7-L8)
