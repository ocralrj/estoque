# Aplicar tabela de Sugestões (corrige o erro ao enviar pedido)

## Erro

```
Could not find the table 'public.improvement_suggestions' in the schema cache
```

**Causa:** o SQL da feature ainda não foi executado no Supabase de produção.

## Correção (2 minutos)

1. Abra o SQL Editor do projeto OCRAL:  
   **https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql/new**

2. Abra o arquivo local:  
   `supabase/schema_sugestoes.sql`

3. Copie **todo** o conteúdo → cole no editor → clique em **Run**

4. Confirme:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'improvement_suggestions';
```

Deve retornar 1 linha.

5. Volte ao site, recarregue e envie o pedido de novo.

Não precisa redeploy no Vercel só por criar a tabela.
