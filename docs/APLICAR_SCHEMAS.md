# Aplicação dos Schemas no Supabase

## FASE 0 - Concluída ✓
- Componentes UI base criados
- Sidebar refatorado com menu hierárquico
- Breadcrumbs implementado
- Documentação de padrões criada

## FASE 1 - Em Progresso

### Schemas SQL para Aplicar no Supabase

Acesse o SQL Editor do Supabase em:
https://supabase.com/dashboard/project/ffsymnxutfjmvwnurfby/sql/new

#### 1. Schema de Auditoria (supabase/schema_auditoria.sql)
Aplicar primeiro - sistema transversal de auditoria para todos os módulos

#### 2. Schema de Grupos e Permissões (supabase/schema_grupos_permissoes.sql)
Aplicar depois da auditoria - sistema de grupos de usuários com permissões granulares

### Ordem de Aplicação:
1. Executar `supabase/schema_auditoria.sql` completo
2. Executar `supabase/schema_grupos_permissoes.sql` completo
3. Verificar se as tabelas foram criadas:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   ORDER BY table_name;
   ```

### Tabelas que Serão Criadas:

**Auditoria:**
- audit_logs

**Grupos e Permissões:**
- user_groups
- group_members
- permissions (com 42 permissões padrão)
- group_permissions

### Próximos Passos:
1. Aplicar schemas no Supabase
2. Criar interface de gestão de grupos (pages)
3. Criar interface de gestão de permissões
4. Testar sistema de permissões
5. Commitar FASE 1
