# Aplicar os schemas SQL no Supabase

Este projeto não usa ferramenta de migration: os schemas ficam em `supabase/` e
são aplicados manualmente pelo SQL Editor do Supabase. Todos os arquivos são
idempotentes — reexecutar não quebra o que já existe.

**SQL Editor do projeto:**
<https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql/new>

Para cada arquivo: abra-o, copie todo o conteúdo, cole no editor e clique em
**Run**.

## Ordem de aplicação

| # | Arquivo | O que cria |
| --- | --- | --- |
| 1 | `supabase/schema_estoque.sql` | Base do sistema: `profiles`, `categories`, `products`, `movements`, `notifications`, `protocolos`, triggers de estoque e RLS |
| 2 | `supabase/schema_auditoria.sql` | Trilha de auditoria transversal |
| 3 | `supabase/schema_grupos_permissoes.sql` | Grupos de usuários e permissões granulares |
| 4 | `supabase/schema_sugestoes.sql` | `improvement_suggestions` (módulo "Sugerir uma melhoria") |
| 5 | `supabase/schema_ged.sql` | Módulo GED: documentos, pastas, certificados, temporalidade e auditoria documental |

A ordem importa: os schemas 2 a 5 referenciam `profiles`, criada no passo 1.

## Correções pontuais

A pasta `supabase/_manual_apply/` guarda ajustes aplicáveis sob demanda
(índices de performance, correção de recursão em RLS, promoção de super admin).
Aplique apenas quando o problema correspondente aparecer.

Os arquivos `supabase/fix_rls_redirect_loop.sql` e
`supabase/fix_trigger_and_create_user.sql` corrigem, respectivamente, o loop de
redirecionamento causado por política RLS recursiva em `profiles` e falhas do
trigger que cria o perfil no cadastro.

## Conferir o que está exposto sem login

A checagem mais rápida de vazamento usa a própria API REST com a chave pública
(`anon`), que é pública por design. Toda tabela deve devolver `[]` ou um erro —
nunca linhas de dados:

```bash
for t in profiles notifications products movements protocolos permissions ged_documents; do
  printf "%-24s " "$t"
  curl -s -H "apikey: <chave anon>"     "https://ffsymnxutfjmvwnurfby.supabase.co/rest/v1/$t?select=*&limit=1"
  echo
done
```

Foi assim que se detectou, em 06/09/2026, que `permissions` devolvia as 38
linhas do catálogo a visitantes anônimos — corrigido por
`_manual_apply/004_fix_permissions_anon_read.sql`.

## Conferir o resultado

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Para checar que o RLS está ativo em todas as tabelas:

```sql
select relname as tabela, relrowsecurity as rls_ativo
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;
```

Toda tabela deve retornar `rls_ativo = true`.

## Sintomas comuns

| Erro na aplicação | Causa | O que aplicar |
| --- | --- | --- |
| `Could not find the table 'public.<nome>' in the schema cache` | Schema da feature não foi executado | O arquivo correspondente na tabela acima |
| `Failed to create user: Database error creating new user` | Trigger `handle_new_user` ausente ou com falha | `supabase/schema_estoque.sql` e, se persistir, `supabase/fix_trigger_and_create_user.sql` |
| `ERR_TOO_MANY_REDIRECTS` no login | Política RLS recursiva em `profiles` | `supabase/fix_rls_redirect_loop.sql` |
| Listas vazias mesmo com dados | RLS bloqueando o papel do usuário | Reveja as políticas da tabela no SQL Editor |
