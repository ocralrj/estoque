# Possíveis Causas do Erro no Registro

## 1. Confirmação de Email Obrigatória
O Supabase pode estar configurado para exigir confirmação de email. Se estiver, o usuário não consegue fazer login até confirmar.

**Solução**: Desabilitar confirmação de email no Supabase Dashboard

### Passos:
1. Acesse https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby
2. Vá em **Authentication** → **Settings**
3. Procure por **Enable email confirmations**
4. Desmarque esta opção
5. Clique em **Save**

## 2. Senha muito fraca
O Supabase pode ter requisitos de senha mais fortes que os 6 caracteres do código.

**Verificar**: A senha precisa ter pelo menos 6 caracteres (já validado no código)

## 3. Provider de Email não configurado
O Supabase pode não ter o provider de email configurado.

**Solução**: Habilitar Email Provider

### Passos:
1. Acesse https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby
2. Vá em **Authentication** → **Providers**
3. Procure por **Email**
4. Certifique-se de que está **Enabled**

## 4. RLS (Row Level Security) muito restritivo
As políticas RLS podem estar impedindo a criação do perfil.

**Verificar**: O trigger `handle_new_user()` roda com `security definer`, então deve funcionar.

## RECOMENDAÇÃO IMEDIATA

Criar o usuário diretamente pelo Dashboard do Supabase:

1. Acesse https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby
2. Vá em **Authentication** → **Users**
3. Clique em **Add user**
4. Preencha:
   - Email: jadirconsult@gmail.com
   - Password: #Mudar@123
   - **IMPORTANTE**: Marque **Auto Confirm User**
5. Clique em **Create user**

O trigger SQL vai atribuir automaticamente a role `super_admin` ao criar o usuário.

Depois teste o login em https://ocral.vercel.app/auth/login
