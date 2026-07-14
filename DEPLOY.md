# Guia de Deploy - Sistema de Controle de Estoque OCRAL

## 1. Configuração do Supabase

### 1.1. Executar o Schema SQL

1. Acesse o Dashboard do Supabase: https://ffsymnxutfjmvwnurfby.supabase.co
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New Query**
4. Copie todo o conteúdo do arquivo `supabase/schema_estoque.sql`
5. Cole no editor e clique em **Run**

Isso criará:
- Tabelas: `profiles`, `categories`, `products`, `movements`
- Funções automáticas para atualização de estoque
- Políticas de segurança (RLS)
- 5 categorias padrão (Material de Escritório, Informática, etc)

### 1.2. Configurar Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com:

```
NEXT_PUBLIC_SUPABASE_URL=https://ffsymnxutfjmvwnurfby.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
```

Para obter as chaves:
1. No Dashboard do Supabase, vá em **Settings** → **API**
2. Copie:
   - **Project URL** para `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** para `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** para `SUPABASE_SERVICE_ROLE_KEY`

## 2. Deploy no Vercel

### 2.1. Conectar Repositório

1. Acesse https://vercel.com
2. Clique em **Add New** → **Project**
3. Conecte seu repositório GitHub: `ocralrj/estoque`
4. Configure as variáveis de ambiente:
   - Clique em **Environment Variables**
   - Adicione as mesmas variáveis do `.env.local`

### 2.2. Configurações de Build

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

### 2.3. Deploy

Clique em **Deploy** e aguarde o processo finalizar.

## 3. Primeiro Acesso

### 3.1. Criar Usuário Super Admin

1. Acesse a aplicação deployada
2. Clique em **Registrar** e crie uma conta com o email: `administrador@ocral.com.br`
3. Este usuário será automaticamente configurado como **super_admin**

### 3.2. Criar Outros Usuários

O super admin pode criar outros usuários através de:
- Menu **Usuários** no dashboard
- Atribuir roles: `gestor`, `almoxarife`, `requisitante`

## 4. Funcionalidades do Sistema

### 4.1. Papéis de Usuário

- **super_admin**: Acesso total ao sistema
- **gestor**: Visualiza relatórios, gerencia usuários e produtos
- **almoxarife**: Registra movimentações e gerencia produtos
- **requisitante**: Visualiza produtos (somente leitura)

### 4.2. Módulos Principais

- **Dashboard**: Métricas gerais e movimentações recentes
- **Produtos**: Cadastro e listagem de itens do almoxarifado
- **Movimentações**: Registro de entradas e saídas
- **Alertas**: Produtos com estoque abaixo do mínimo
- **Relatórios**: Estatísticas e análises de movimentação

## 5. Manutenção

### 5.1. Backup do Banco de Dados

No Supabase Dashboard:
1. Vá em **Database** → **Backups**
2. Configure backups automáticos diários

### 5.2. Monitoramento

- **Logs de Aplicação**: Vercel Dashboard → Logs
- **Logs do Banco**: Supabase Dashboard → Logs

## 6. Solução de Problemas

### Erro de Autenticação
- Verifique se as chaves do Supabase estão corretas no `.env.local`
- Confirme que o RLS (Row Level Security) está habilitado nas tabelas

### Produtos não aparecem
- Verifique se o produto está marcado como `active = true`
- Confirme que o usuário tem permissão para visualizar

### Movimentações não atualizam estoque
- Verifique se o trigger `movement_update_quantity` foi criado corretamente
- Cheque os logs do Supabase para erros

## 7. Próximos Passos

- Cadastrar categorias adicionais se necessário
- Criar produtos iniciais do almoxarifado
- Configurar níveis mínimos de estoque
- Treinar usuários no sistema
