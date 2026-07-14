# Como Aplicar o Schema no Supabase

## Erro Atual
```
Failed to create user: Database error creating new user
```

Este erro ocorre porque o schema do banco de dados não está aplicado no Supabase.

## Solução: Aplicar o Schema SQL

### Passo 1: Acessar o SQL Editor

1. Acesse https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby
2. No menu lateral esquerdo, clique em **SQL Editor**
3. Clique em **New query** (ou **+ New Query**)

### Passo 2: Copiar e Colar o Script SQL

**IMPORTANTE**: Use o arquivo [supabase/schema_estoque_safe.sql](../supabase/schema_estoque_safe.sql) que verifica o que já existe antes de criar.

Abra o arquivo e copie todo o conteúdo. Cole no editor SQL do Supabase.

### Passo 3: Executar o Script

1. Clique no botão **Run** (ou pressione Ctrl+Enter)
2. Aguarde a execução completar
3. Verifique se há erros no console

### Passo 4: Verificar se o Schema foi Aplicado

Execute esta query para verificar:

```sql
-- Verificar se a tabela profiles existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'categories', 'products', 'movements');

-- Verificar se o trigger existe
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Verificar se o tipo user_role existe
SELECT typname 
FROM pg_type 
WHERE typname = 'user_role';
```

Se todas as queries retornarem resultados, o schema foi aplicado corretamente.

### Passo 5: Criar o Usuário

Após aplicar o schema, você pode criar o usuário de 3 formas:

**Opção 1 - Via Dashboard (RECOMENDADO)**
1. Vá em Authentication → Users
2. Clique em "Add user"
3. Email: `jadirconsult@gmail.com`
4. Password: `#Mudar@123`
5. Marque "Auto Confirm User"
6. Clique em "Create user"

**Opção 2 - Via SQL Editor**
```sql
-- Este método NÃO funcionará porque não temos acesso direto à tabela auth.users
-- Use o Dashboard (Opção 1) ou a página de registro (Opção 3)
```

**Opção 3 - Via Página de Registro**
1. Acesse https://ocral.vercel.app/auth/register
2. Preencha os dados
3. Clique em "Cadastrar"

## Troubleshooting

### Erro: "relation 'profiles' does not exist"
- O schema não foi aplicado
- Execute o script SQL completo conforme instruções acima

### Erro: "type 'user_role' does not exist"
- Execute a parte do script que cria o ENUM:
```sql
create type user_role as enum ('super_admin', 'gestor', 'almoxarife', 'requisitante');
```

### Erro: "trigger 'on_auth_user_created' does not exist"
- Execute a parte do script que cria o trigger:
```sql
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.email in ('administrador@ocral.com.br', 'jadirconsult@gmail.com') then 'super_admin'::user_role
      else 'requisitante'::user_role
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

## Resumo

1. Abra o SQL Editor no Supabase
2. Cole o conteúdo completo de [supabase/schema_estoque.sql](../supabase/schema_estoque.sql)
3. Execute o script
4. Crie o usuário via Dashboard (Authentication → Users)
5. Teste o login em https://ocral.vercel.app/auth/login
