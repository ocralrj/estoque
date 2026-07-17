# Como Criar Usuário Super Admin no Supabase

## Site Deployado
- **URL**: https://ocral.vercel.app
- **Status**: Funcionando com variáveis de ambiente configuradas

## Criar usuário jadirconsult@gmail.com

### Opção 1: Via Dashboard do Supabase (MAIS SIMPLES - RECOMENDADO)

1. Acesse [Dashboard do Supabase](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby)
2. No menu lateral, clique em **Authentication**
3. Clique na aba **Users**
4. Clique no botão **Add user** (ou **Invite user**)
5. Preencha:
   - **Email**: `jadirconsult@gmail.com`
   - **Password**: `#Mudar@123`
   - Marque **Auto Confirm User** (para não precisar confirmar o email)
6. Clique em **Create user**

O trigger `handle_new_user()` será executado automaticamente e criará o perfil com role `super_admin`.

**IMPORTANTE**: Esta é a forma mais segura e simples. O Supabase gerencia automaticamente o hash da senha e a criação do usuário.

### Opção 2: Via SQL Editor (AVANÇADO)

Se preferir criar via SQL, use o script preparado:

1. Acesse [SQL Editor do Supabase](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql)
2. Copie e cole o conteúdo do arquivo [criar_usuario_super_admin.sql](scripts/criar_usuario_super_admin.sql)
3. Clique em **Run** para executar
4. Verifique se o usuário foi criado com o script [verificar_usuario_criado.sql](scripts/verificar_usuario_criado.sql)

O trigger `handle_new_user()` será executado automaticamente e criará o perfil com role `super_admin`.

### Opção 3: Via Página de Registro (ALTERNATIVA)

1. Acesse [Página de Registro](https://ocral.vercel.app/auth/register)
2. Preencha:
   - **Nome completo**: `Administrador OCRAL`
   - **Email**: `jadirconsult@gmail.com`
   - **Senha**: `#Mudar@123`
3. Clique em **Cadastrar**

O sistema criará o usuário e o trigger automático atribuirá a role `super_admin` porque o email `jadirconsult@gmail.com` está configurado no schema.

## Verificar se funcionou

### Verificação via SQL (RECOMENDADO)

Execute o script [verificar_usuario_criado.sql](scripts/verificar_usuario_criado.sql) no [SQL Editor do Supabase](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql) para verificar:

1. Se o usuário existe em `auth.users`
2. Se o perfil foi criado em `profiles` com role `super_admin`
3. Lista de todos os super admins cadastrados

### Verificação via Login

Após criar o usuário:

1. Acesse [Página de Login](https://ocral.vercel.app/auth/login)
2. Login:
   - **Email**: `jadirconsult@gmail.com`
   - **Senha**: `#Mudar@123`
3. Você deve ser redirecionado para o dashboard com permissões de super admin

## Troubleshooting

### Erro "Email ou senha inválidos"
- Verifique se o usuário foi criado no Supabase (Authentication → Users)
- Confirme que o email está correto (sem espaços ou caracteres extras)
- Verifique se a senha está correta

### Erro "Database error saving new user"
- Indica que o schema não está aplicado corretamente
- Execute o arquivo [schema_estoque.sql](../supabase/schema_estoque.sql) no SQL Editor do Supabase
- Certifique-se de que a tabela `profiles` existe e o trigger `on_auth_user_created` está ativo

### Usuário criado mas não consegue fazer login
- Verifique no Dashboard do Supabase se o usuário está com status "Confirmed"
- Se necessário, confirme o email manualmente no Dashboard (Authentication > Users > selecione o usuário > Confirm email)

## Resumo da Configuração

- Site: https://ocral.vercel.app
- Projeto Vercel: ocral
- Supabase URL: https://ffsymnxutfjmvwnurfby.supabase.co
- Email Super Admin: jadirconsult@gmail.com
- Senha: #Mudar@123
