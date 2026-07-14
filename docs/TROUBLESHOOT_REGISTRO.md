# Troubleshooting - Erro no Registro de Usuários

## Problema
Ao tentar registrar qualquer usuário pela página [https://ocral.vercel.app/auth/register](https://ocral.vercel.app/auth/register), aparece um erro (ícone vermelho `{}`) mas a mensagem não é exibida.

## Causa Provável
O Supabase está configurado para exigir **confirmação de email** antes de permitir login. Isso impede que usuários se registrem sem confirmar o email primeiro.

## Solução 1: Desabilitar Confirmação de Email (RECOMENDADO)

### Passos:
1. Acesse [https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/settings/auth](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/settings/auth)
2. Role até a seção **Email Auth**
3. Encontre a opção **"Enable email confirmations"**
4. **Desmarque** esta opção
5. Clique em **Save** no final da página

Após isso, qualquer usuário poderá se registrar pela página sem precisar confirmar email.

## Solução 2: Criar Usuário Diretamente no Dashboard

Se você precisa criar o usuário super admin AGORA, sem alterar configurações:

### Passos:
1. Acesse [https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/auth/users](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/auth/users)
2. Clique em **"Add user"** (botão verde no canto superior direito)
3. Selecione **"Create new user"**
4. Preencha:
   - **Email**: `jadirconsult@gmail.com`
   - **Password**: `#Mudar@123`
   - **IMPORTANTE**: Marque **"Auto Confirm User"**
5. Clique em **"Create user"**

O trigger SQL `handle_new_user()` vai atribuir automaticamente a role `super_admin` ao criar o usuário.

## Verificar se Funcionou

Após criar o usuário (por qualquer método acima):

1. Acesse [https://ocral.vercel.app/auth/login](https://ocral.vercel.app/auth/login)
2. Login:
   - **Email**: `jadirconsult@gmail.com`
   - **Senha**: `#Mudar@123`
3. Você deve ser redirecionado para o dashboard

## Outras Configurações para Verificar

### Verificar se Email Provider está habilitado:
1. Acesse [https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/auth/providers](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/auth/providers)
2. Verifique se **Email** está com status **"Enabled"**
3. Se não estiver, clique em **Email** e habilite

### Verificar políticas de senha:
1. Acesse [https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/settings/auth](https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/settings/auth)
2. Role até **Password Requirements**
3. Verifique se a senha `#Mudar@123` atende aos requisitos

## Estado Atual das Tabelas

✅ Tabelas criadas no Supabase:
- `categories` (com dados iniciais)
- `movements`
- `products`
- `profiles`

✅ Triggers configurados:
- `handle_new_user()` - Cria profile automaticamente ao registrar
- `on_auth_user_created` - Dispara o trigger acima
- Triggers de atualização automática de `updated_at`

✅ RLS (Row Level Security) habilitado em todas as tabelas

## Resumo da Configuração Atual

- **Site**: https://ocral.vercel.app
- **Projeto Vercel**: ocral
- **Supabase URL**: https://ffsymnxutfjmvwnurfby.supabase.co
- **Schema**: Aplicado com sucesso
- **Próximo passo**: Criar o primeiro usuário super admin
