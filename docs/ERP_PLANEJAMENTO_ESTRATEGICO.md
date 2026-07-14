# Planejamento Estratégico - Evolução ERP OCRAL

## Data: 2026-07-14

---

## 1. DIAGNÓSTICO DO ESTADO ATUAL

### 1.1 Sistema Existente

**Tecnologias:**
- Frontend: Next.js 14.2.3, React 18, TypeScript
- Backend: Supabase (PostgreSQL + Auth)
- Estilo: Tailwind CSS
- Forms: React Hook Form
- Deploy: Vercel
- Repositório: GitHub (ocralrj/estoque)
- Total: ~1.850 linhas de código

**Módulo de Estoque (Implementado):**
- Gestão de produtos (CRUD completo)
- Movimentações (entrada/saída)
- Categorias de produtos
- Alertas de estoque baixo
- Relatórios básicos
- Controle de acesso (4 roles: super_admin, gestor, almoxarife, requisitante)

**Arquitetura Atual:**
```
src/
├── app/
│   ├── auth/              # Login e registro
│   ├── dashboard/         # Dashboard principal
│   │   ├── products/      # Produtos (140 linhas)
│   │   ├── movements/     # Movimentações (182 linhas)
│   │   ├── alerts/        # Alertas (115 linhas)
│   │   ├── reports/       # Relatórios (201 linhas)
│   │   └── users/         # Usuários (116 linhas)
│   └── layout.tsx
├── components/
│   └── Sidebar.tsx        # Menu lateral (76 linhas)
├── lib/
│   └── supabase/          # Clientes Supabase
└── types/                 # TypeScript definitions

supabase/
├── schema_estoque.sql     # Schema original
├── schema_estoque_safe.sql # Schema idempotente
└── fix_trigger_and_create_user.sql
```

**Schema do Banco de Dados:**
- `profiles` - Perfis de usuário com roles
- `categories` - Categorias de produtos
- `products` - Produtos do estoque
- `movements` - Movimentações de estoque
- Triggers automáticos para auditoria e controle de estoque
- RLS (Row Level Security) implementado

**Deploy Atual:**
- URL: https://ocral.vercel.app
- Status: Funcionando
- Autenticação: Operacional
- Super Admin: jadirconsult@gmail.com

---

## 2. ANÁLISE DE REAPROVEITAMENTO

### 2.1 ✅ MANTER E REAPROVEITAR

**Infraestrutura Base:**
- ✅ Autenticação Supabase (funcional e segura)
- ✅ Sistema de roles e permissões (arquitetura sólida)
- ✅ Layout Dashboard com Sidebar (estrutura reutilizável)
- ✅ Supabase client/server helpers
- ✅ Middleware de autenticação
- ✅ TypeScript types structure
- ✅ Tailwind CSS configuration
- ✅ Deploy pipeline Vercel

**Componentes Core:**
- ✅ Sidebar component (refatorar para menu multi-nível)
- ✅ Layout Dashboard (base sólida)
- ✅ Error handling pages
- ✅ Authentication pages (login/register)

**Módulos Funcionais:**
- ✅ Módulo de Estoque completo (já implementado)
- ✅ Sistema de categorias
- ✅ Gestão de usuários (básica implementada)
- ✅ Relatórios de estoque (expandir)

**Database Schema:**
- ✅ Tabela `profiles` (core do sistema)
- ✅ Tabela `categories` (reutilizar para outros módulos)
- ✅ Triggers de auditoria (padrão para todo ERP)
- ✅ RLS policies (padrão de segurança)

### 2.2 🔄 REFATORAR

**Estrutura de Navegação:**
- 🔄 Sidebar: transformar em menu hierárquico com submenus
- 🔄 Dashboard home: adaptar para visão geral do ERP
- 🔄 Breadcrumbs: adicionar navegação contextual

**Sistema de Permissões:**
- 🔄 Expandir roles para incluir grupos de usuários
- 🔄 Criar tabela `user_groups` e `group_permissions`
- 🔄 Refatorar RLS para suportar grupos

**Componentes Reutilizáveis:**
- 🔄 Criar biblioteca de componentes comum:
  - Tables (já usado em products)
  - Forms (já usado em movements)
  - Cards (já usado no dashboard)
  - Modals
  - File upload
  - Document viewer

### 2.3 ❌ REMOVER / SUBSTITUIR

**Nada a remover** - O sistema atual está bem estruturado e tudo pode ser reaproveitado. Apenas expandir.

---

## 3. ARQUITETURA PROPOSTA PARA O ERP

### 3.1 Estrutura Modular

```
src/
├── app/
│   ├── (auth)/                  # Grupo: Autenticação
│   │   ├── login/
│   │   └── register/
│   │
│   └── (dashboard)/             # Grupo: Dashboard
│       ├── layout.tsx           # Layout principal do ERP
│       ├── page.tsx             # Home Dashboard
│       │
│       ├── estoque/             # MÓDULO: Estoque
│       │   ├── produtos/
│       │   ├── movimentacoes/
│       │   ├── categorias/
│       │   ├── alertas/
│       │   └── relatorios/
│       │
│       ├── certificados/        # MÓDULO: Certificados
│       │   ├── lista/
│       │   ├── upload/
│       │   ├── validade/
│       │   └── tipos/
│       │
│       ├── ged/                 # MÓDULO: GED (Gestão Eletrônica de Documentos)
│       │   ├── documentos/
│       │   ├── pastas/
│       │   ├── busca/
│       │   ├── versionamento/
│       │   └── compartilhamento/
│       │
│       └── admin/               # MÓDULO: Administração
│           ├── usuarios/
│           ├── grupos/
│           ├── permissoes/
│           ├── auditoria/
│           └── configuracoes/
│
├── components/
│   ├── ui/                      # Componentes base
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Table/
│   │   ├── Modal/
│   │   ├── Card/
│   │   ├── FileUpload/
│   │   └── DocumentViewer/
│   │
│   ├── layout/                  # Componentes de layout
│   │   ├── Sidebar/
│   │   ├── Header/
│   │   ├── Breadcrumbs/
│   │   └── ModuleLayout/
│   │
│   └── modules/                 # Componentes específicos por módulo
│       ├── estoque/
│       ├── certificados/
│       ├── ged/
│       └── admin/
│
├── lib/
│   ├── supabase/
│   ├── utils/
│   ├── hooks/                   # React hooks customizados
│   └── api/                     # API helpers por módulo
│
└── types/
    ├── database.ts              # Types do banco
    ├── modules/
    │   ├── estoque.ts
    │   ├── certificados.ts
    │   ├── ged.ts
    │   └── admin.ts
    └── common.ts                # Types compartilhados
```

### 3.2 Schema do Banco de Dados (Completo)

```sql
-- CORE (já existe)
- profiles
- user_role (enum)

-- NOVO: Grupos e Permissões
- user_groups
- group_members
- permissions
- group_permissions

-- ESTOQUE (já existe)
- categories
- products
- movements

-- NOVO: Certificados
- certificate_types
- certificates
- certificate_files
- certificate_validations

-- NOVO: GED
- ged_folders
- ged_documents
- ged_versions
- ged_permissions
- ged_tags
- ged_document_tags

-- AUDITORIA (expandir)
- audit_logs (transversal para todos os módulos)
```

---

## 4. MAPA DOS MÓDULOS PRINCIPAIS

### 4.1 Módulo: ESTOQUE (Já Implementado)
**Status:** ✅ 100% Completo
- Produtos
- Movimentações
- Categorias
- Alertas de estoque
- Relatórios

### 4.2 Módulo: CERTIFICADOS
**Escopo:**
- Cadastro de certificados (ISO, técnicos, etc)
- Upload de arquivos PDF/imagens
- Controle de validade (alertas de vencimento)
- Tipos de certificados
- Histórico de renovações
- Relatórios de certificados vencidos/a vencer

**Tabelas:**
```sql
certificate_types (id, name, description, validity_days)
certificates (id, type_id, title, entity, issue_date, expiry_date, file_url, status, created_by)
certificate_files (id, certificate_id, file_url, file_name, file_type, uploaded_at)
certificate_validations (id, certificate_id, validated_by, validated_at, status, notes)
```

**Permissões:**
- super_admin: CRUD completo
- gestor: visualiza todos, cria e edita
- requisitante: apenas visualiza

### 4.3 Módulo: GED (Gestão Eletrônica de Documentos)
**Escopo:**
- Upload de documentos (PDF, Word, Excel, imagens)
- Estrutura de pastas hierárquica
- Busca full-text por conteúdo e metadados
- Versionamento de documentos
- Compartilhamento com permissões granulares
- Tags e categorização
- Download e visualização
- Auditoria de acesso

**Tabelas:**
```sql
ged_folders (id, parent_id, name, path, created_by, created_at)
ged_documents (id, folder_id, name, description, file_url, file_type, file_size, version, created_by, created_at)
ged_versions (id, document_id, version, file_url, changes, created_by, created_at)
ged_permissions (id, document_id, user_id, group_id, permission_type)
ged_tags (id, name, color)
ged_document_tags (document_id, tag_id)
ged_access_log (id, document_id, user_id, action, timestamp)
```

**Permissões:**
- super_admin: acesso total
- gestor: cria pastas, upload, compartilha
- almoxarife: upload em pastas específicas
- requisitante: acesso somente leitura (conforme permissão)

### 4.4 Módulo: USUÁRIOS E GRUPOS
**Escopo:**
- Gestão de usuários (já existe, expandir)
- Criação de grupos de usuários
- Atribuição de permissões por grupo
- Auditoria de ações de usuários
- Configurações de perfil

**Tabelas:**
```sql
user_groups (id, name, description, created_by, created_at)
group_members (group_id, user_id, added_by, added_at)
permissions (id, module, resource, action, description)
group_permissions (group_id, permission_id, granted_by, granted_at)
audit_logs (id, user_id, module, action, resource_id, details, timestamp)
```

**Permissões:**
- super_admin: CRUD completo de usuários e grupos
- gestor: visualiza usuários, não edita permissões críticas

---

## 5. ROADMAP DE IMPLEMENTAÇÃO

### FASE 0: PREPARAÇÃO E REFATORAÇÃO (Semana 1)
**Objetivo:** Preparar a base para expansão modular

**Tarefas:**
1. ✅ Refatorar estrutura de pastas para arquitetura modular
2. ✅ Criar biblioteca de componentes reutilizáveis (ui/)
3. ✅ Atualizar Sidebar para menu hierárquico com submenus
4. ✅ Criar componente Breadcrumbs
5. ✅ Implementar layout base para módulos (ModuleLayout)
6. ✅ Criar tabela de auditoria transversal
7. ✅ Documentar padrões de código e estrutura

**Entregáveis:**
- Nova estrutura de pastas implementada
- Componentes UI base criados
- Menu de navegação hierárquico
- Sistema de auditoria base

---

### FASE 1: GRUPOS DE USUÁRIOS (Semana 2)
**Objetivo:** Implementar sistema de grupos e permissões granulares

**Tarefas:**
1. ✅ Criar schema de grupos no banco de dados
2. ✅ Criar página de gestão de grupos
3. ✅ Criar página de permissões por grupo
4. ✅ Implementar lógica de verificação de permissões
5. ✅ Atualizar RLS policies para suportar grupos
6. ✅ Criar interface de atribuição de usuários a grupos
7. ✅ Adicionar auditoria de mudanças de permissões

**Entregáveis:**
- CRUD de grupos
- Sistema de permissões granular
- Interface de gestão de grupos
- Auditoria de permissões

---

### FASE 2: MÓDULO CERTIFICADOS (Semana 3-4)
**Objetivo:** Implementar gestão completa de certificados

**Tarefas:**
1. ✅ Criar schema de certificados no banco
2. ✅ Implementar upload de arquivos (Supabase Storage)
3. ✅ Criar CRUD de tipos de certificados
4. ✅ Criar CRUD de certificados
5. ✅ Implementar sistema de alertas de vencimento
6. ✅ Criar dashboard de certificados
7. ✅ Implementar relatórios de certificados
8. ✅ Adicionar validação de certificados
9. ✅ Implementar histórico de renovações

**Entregáveis:**
- Módulo completo de certificados
- Sistema de alertas de vencimento
- Upload e visualização de arquivos
- Relatórios de validade

---

### FASE 3: MÓDULO GED - PARTE 1 (Semana 5-6)
**Objetivo:** Implementar core do GED (upload, pastas, busca)

**Tarefas:**
1. ✅ Criar schema GED no banco
2. ✅ Implementar estrutura de pastas hierárquica
3. ✅ Criar interface de navegação de pastas
4. ✅ Implementar upload múltiplo de documentos
5. ✅ Criar visualizador de documentos (PDF, imagens)
6. ✅ Implementar busca básica por nome e metadados
7. ✅ Criar sistema de tags
8. ✅ Implementar download de documentos

**Entregáveis:**
- Estrutura de pastas funcional
- Upload e download de documentos
- Visualizador de documentos
- Busca básica e tags

---

### FASE 4: MÓDULO GED - PARTE 2 (Semana 7-8)
**Objetivo:** Implementar recursos avançados do GED

**Tarefas:**
1. ✅ Implementar versionamento de documentos
2. ✅ Criar sistema de permissões granulares por documento
3. ✅ Implementar compartilhamento de documentos
4. ✅ Criar busca full-text avançada
5. ✅ Implementar log de acesso a documentos
6. ✅ Criar relatórios de uso do GED
7. ✅ Implementar preview de documentos Office

**Entregáveis:**
- Versionamento completo
- Permissões granulares
- Auditoria de acesso
- Busca avançada

---

### FASE 5: DASHBOARD E RELATÓRIOS INTEGRADOS (Semana 9)
**Objetivo:** Criar visão unificada do ERP

**Tarefas:**
1. ✅ Redesenhar dashboard home com visão geral do ERP
2. ✅ Criar widgets de cada módulo no dashboard
3. ✅ Implementar relatórios consolidados
4. ✅ Criar gráficos de uso por módulo
5. ✅ Implementar exportação de dados (Excel, PDF)
6. ✅ Criar painel de auditoria transversal

**Entregáveis:**
- Dashboard ERP completo
- Relatórios consolidados
- Exportação de dados
- Painel de auditoria

---

### FASE 6: TESTES E AJUSTES (Semana 10)
**Objetivo:** Testar todo o sistema e fazer ajustes finais

**Tarefas:**
1. ✅ Testes de integração entre módulos
2. ✅ Testes de permissões e segurança
3. ✅ Testes de performance com volume de dados
4. ✅ Ajustes de UX e feedback dos usuários
5. ✅ Documentação de usuário final
6. ✅ Treinamento de usuários
7. ✅ Deploy em produção

**Entregáveis:**
- Sistema testado e validado
- Documentação completa
- Usuários treinados
- Deploy em produção

---

## 6. DEPENDÊNCIAS E RISCOS

### 6.1 Dependências Técnicas

**Supabase Storage:**
- Necessário para upload de arquivos (certificados e GED)
- Configurar bucket público/privado
- Implementar RLS no storage
- Definir limites de tamanho e tipos de arquivo

**Busca Full-Text:**
- PostgreSQL Full-Text Search (built-in)
- Considerar extensão pg_trgm para busca fuzzy
- Indexação de conteúdo de PDFs (requer processamento)

**Preview de Documentos:**
- PDF.js para preview de PDFs no browser
- Converter Office para PDF (ou usar Google Docs Viewer)
- Limitação: preview de arquivos grandes

**Performance:**
- Paginação obrigatória em todas as listagens
- Cache de queries frequentes
- Índices no banco de dados
- Lazy loading de módulos

### 6.2 Riscos Identificados

**Risco 1: Limite de Storage do Supabase**
- Impacto: Alto
- Plano gratuito: 1GB
- Mitigação: Migrar para plano pago ou usar S3

**Risco 2: Complexidade de Permissões Granulares**
- Impacto: Médio
- RLS pode ficar complexo
- Mitigação: Testes extensivos de permissões

**Risco 3: Performance com Volume de Documentos**
- Impacto: Médio
- Busca full-text pode ser lenta
- Mitigação: Índices adequados, paginação

**Risco 4: Versionamento de Documentos**
- Impacto: Baixo
- Pode ocupar muito espaço
- Mitigação: Limitar número de versões ou compactar antigas

**Risco 5: Escopo Crescente**
- Impacto: Alto
- ERP pode crescer indefinidamente
- Mitigação: Definir MVP de cada módulo e iterar

---

## 7. PREMISSAS E SUPOSIÇÕES

### 7.1 Premissas Técnicas
- Supabase continuará sendo o backend
- Vercel para deploy frontend
- Não é SaaS (single-tenant)
- Usuários internos da OCRAL
- Sem necessidade de multi-idioma (português)
- Sem necessidade de multi-moeda
- Sem integrações externas inicialmente

### 7.2 Premissas de Negócio
- Sistema para uso interno da OCRAL
- Sem cobrança por usuário
- Sem planos ou assinaturas
- Gestão centralizada (não self-service)
- Dados sensíveis (requer auditoria completa)

### 7.3 Suposições que Precisam ser Validadas

**❓ Volume de Dados Esperado:**
- Quantos usuários simultâneos?
- Quantos documentos no GED?
- Tamanho médio de arquivos?
- Quantos certificados cadastrados?

**❓ Integrações Futuras:**
- Integração com sistema contábil?
- Integração com ERP externo?
- API para terceiros?

**❓ Requisitos de Compliance:**
- LGPD: dados pessoais precisam de consentimento?
- Retenção de documentos: quanto tempo manter?
- Backup: frequência necessária?

**❓ Requisitos de Disponibilidade:**
- SLA esperado (99%, 99.9%)?
- Horário crítico de uso?
- Necessidade de alta disponibilidade?

---

## 8. RECOMENDAÇÕES TÉCNICAS

### 8.1 Arquitetura
- ✅ Manter Next.js App Router
- ✅ Usar Server Components onde possível (melhor performance)
- ✅ Client Components apenas quando necessário (interatividade)
- ✅ Implementar streaming de dados para listas grandes
- ✅ Code splitting por módulo (lazy loading)

### 8.2 Banco de Dados
- ✅ Criar índices em foreign keys e campos de busca
- ✅ Usar RLS para segurança em todas as tabelas
- ✅ Implementar soft delete (active: boolean) ao invés de DELETE
- ✅ Triggers de auditoria em todas as tabelas críticas
- ✅ Backup automático diário (Supabase já faz)

### 8.3 Storage
- ✅ Separar buckets por módulo (certificados/, ged/)
- ✅ Implementar RLS no Supabase Storage
- ✅ Validar tipo e tamanho de arquivo no backend
- ✅ Gerar thumbnails de imagens
- ✅ Comprimir PDFs grandes automaticamente

### 8.4 Segurança
- ✅ Todas as mutations via Server Actions (não API routes)
- ✅ Validação de permissões no servidor sempre
- ✅ Sanitização de inputs
- ✅ Content Security Policy (CSP)
- ✅ Rate limiting em uploads
- ✅ Auditoria completa de ações sensíveis

### 8.5 UX/UI
- ✅ Feedback visual imediato (loading states)
- ✅ Mensagens de erro claras
- ✅ Confirmação para ações destrutivas
- ✅ Breadcrumbs em todas as páginas
- ✅ Mobile responsive (opcional para ERP interno)
- ✅ Atalhos de teclado para power users

---

## 9. PRÓXIMOS PASSOS PRÁTICOS

### Passo 1: Validação com Stakeholders
**Antes de começar a implementação:**

1. ❓ Validar escopo dos módulos com usuários finais
2. ❓ Confirmar prioridades (Certificados vs GED primeiro?)
3. ❓ Definir usuários piloto para cada fase
4. ❓ Estabelecer critérios de aceitação por módulo

### Passo 2: Preparação do Ambiente
**Próximas ações técnicas:**

1. ✅ Criar branch `develop` no Git para desenvolvimento
2. ✅ Configurar Supabase Storage (buckets)
3. ✅ Atualizar plano do Supabase se necessário (storage)
4. ✅ Configurar variáveis de ambiente para storage
5. ✅ Criar ambiente de staging no Vercel

### Passo 3: Iniciar FASE 0
**Começar refatoração da estrutura:**

1. ✅ Reorganizar pastas para estrutura modular
2. ✅ Criar componentes UI base
3. ✅ Refatorar Sidebar para menu hierárquico
4. ✅ Implementar Breadcrumbs
5. ✅ Criar tabela de auditoria
6. ✅ Documentar padrões

---

## 10. PERGUNTAS PARA O USUÁRIO

Antes de prosseguir com a implementação, preciso de algumas decisões:

### Priorização de Módulos:
**Q1:** Qual módulo implementar primeiro após a refatoração?
- Opção A: Certificados (mais simples, entrega valor rápido)
- Opção B: GED (mais complexo, mas pode ser mais crítico)
- Opção C: Grupos de Usuários (base para permissões granulares)

### Escopo do MVP:
**Q2:** Focar em MVP enxuto ou implementação completa?
- Opção A: MVP rápido de cada módulo (3-4 semanas)
- Opção B: Implementação completa conforme roadmap (10 semanas)

### Abordagem de Desenvolvimento:
**Q3:** Como prefere que eu trabalhe?
- Opção A: Começar agora a refatoração (FASE 0)
- Opção B: Primeiro validar/ajustar o planejamento
- Opção C: Criar protótipo de tela de um módulo para validação

---

## 11. RESUMO EXECUTIVO

**Estado Atual:**
- Sistema de Estoque funcional e bem estruturado
- Autenticação e permissões implementadas
- 1.850 linhas de código reutilizáveis
- Deploy operacional em https://ocral.vercel.app

**Proposta:**
- Evolução para ERP modular com 4 módulos principais
- Arquitetura escalável e bem organizada
- Roadmap de 10 semanas dividido em 6 fases
- Foco em segurança, auditoria e permissões granulares

**Módulos Propostos:**
1. ✅ Estoque (já implementado)
2. 🆕 Certificados (gestão e alertas de validade)
3. 🆕 GED (documentos, pastas, versionamento)
4. 🆕 Usuários e Grupos (permissões granulares)

**Próximo Passo Sugerido:**
Iniciar FASE 0 (refatoração e preparação da base) enquanto validamos prioridades dos módulos novos.

---

**Documento criado em:** 2026-07-14
**Autor:** Claude AI (Nylla)
**Status:** Draft - Aguardando aprovação
