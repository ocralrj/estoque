# Requisitos do Sistema ERP - OCRAL

**Data:** 2026-07-14  
**Versão:** 1.0  
**Status:** Em desenvolvimento

---

## 1. Visão Geral

### 1.1 Contexto
O sistema OCRAL está em transição de um sistema de certificados para um ERP completo. Atualmente, o sistema possui um módulo de controle de estoque/almoxarifado funcional, e existe um legado de interface relacionado a certificados que precisa ser tratado.

### 1.2 Objetivo do Documento
Estruturar os requisitos para evolução do sistema atual em um ERP completo, definindo prioridades, regras de acesso e escopo de cada módulo.

### 1.3 Escopo Atual
- **Implementado:** Sistema de controle de estoque com gestão de produtos, movimentações, alertas e relatórios
- **Legado:** Referências a "Certificados OCRAL" na interface de autenticação
- **Próximos passos:** Módulo de certificados (oculto para não-administradores) + expansão do ERP

---

## 2. Requisitos Funcionais

### 2.1 Autenticação e Gestão de Usuários
**Status:** Implementado  
**Prioridade:** Alta

#### RF-001: Sistema de autenticação
- Login via email/senha com Supabase Auth
- Logout
- Registro de novos usuários
- Recuperação de senha

**Localização:** [src/app/auth/login/page.tsx](../src/app/auth/login/page.tsx), [src/app/auth/register/page.tsx](../src/app/auth/register/page.tsx)

#### RF-002: Gestão de perfis de usuário
- 4 níveis de permissão: super_admin, gestor, almoxarife, requisitante
- Emails que recebem automaticamente role super_admin:
  - `jadirconsult@gmail.com`
  - `administrador@ocral.com.br`
- Perfis criados automaticamente via trigger no Supabase

**Localização:** [supabase/schema_estoque.sql:17-25](../supabase/schema_estoque.sql#L17-L25)

#### RF-003: Painel de gestão de usuários
- Listagem de todos os usuários (super_admin e gestor)
- Alteração de permissões (super_admin)
- Ativação/desativação de usuários

**Localização:** [src/app/dashboard/users/page.tsx](../src/app/dashboard/users/page.tsx)

### 2.2 Módulo de Estoque/Almoxarifado
**Status:** Implementado  
**Prioridade:** Alta

#### RF-004: Gestão de categorias
- Cadastro de categorias de produtos
- 5 categorias padrão: Material de Escritório, Informática, Impressoras, Consumíveis de Impressão, Material de Limpeza
- Acesso: todos usuários visualizam, super_admin e gestor gerenciam

**Localização:** [supabase/schema_estoque.sql:30-35](../supabase/schema_estoque.sql#L30-L35)

#### RF-005: Cadastro de produtos
- Campos: código (único), nome, descrição, categoria, unidade, quantidade mínima, localização física
- Flag de status (ativo/inativo)
- Cálculo automático de estoque baixo (quantity_current <= quantity_minimum)
- Acesso: todos visualizam produtos ativos, super_admin/gestor/almoxarife gerenciam

**Localização:** [supabase/schema_estoque.sql:40-57](../supabase/schema_estoque.sql#L40-L57)

#### RF-006: Movimentações de estoque
- Tipos: entrada e saída
- Validação automática de quantidade disponível (não permite saldo negativo)
- Histórico completo com usuário e timestamp
- Campos: produto, tipo, quantidade, motivo, observações, quantidade anterior/nova
- Acesso: todos visualizam, super_admin/gestor/almoxarife registram

**Localização:** [supabase/schema_estoque.sql:62-73](../supabase/schema_estoque.sql#L62-L73)

#### RF-007: Alertas de estoque baixo
- Listagem automática de produtos com estoque <= mínimo
- Ação rápida para registrar entrada
- Visualização clara de produtos críticos

**Localização:** [src/app/dashboard/alerts/page.tsx](../src/app/dashboard/alerts/page.tsx)

#### RF-008: Relatórios e dashboard
- Métricas em tempo real: total de produtos, estoque baixo, categorias, usuários
- Análise por período customizável
- Top 10 produtos mais movimentados
- Estatísticas por categoria
- Volume de entradas e saídas
- Movimentações recentes (últimas 5)

**Localização:** [src/app/dashboard/reports/page.tsx](../src/app/dashboard/reports/page.tsx), [src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx)

### 2.3 Módulo de Certificados
**Status:** Planejado (legado de interface existe)  
**Prioridade:** Média

#### RF-009: Cadastro de certificados (futuro)
- Módulo deve ser mantido no sistema
- **Visibilidade:** oculto para todos os usuários exceto super_admin
- Funcionalidades específicas: a definir
- Interface atual usa título "Certificados OCRAL" nas páginas de login/registro

**Decisão pendente:** Definir escopo completo do módulo de certificados

**Legado existente:** [src/app/auth/login/page.tsx:37](../src/app/auth/login/page.tsx#L37)

---

## 3. Regras de Acesso e Permissões

### 3.1 Matriz de Permissões por Role

| Funcionalidade | super_admin | gestor | almoxarife | requisitante |
|---|---|---|---|---|
| **Usuários** |
| Visualizar todos os usuários | ✓ | ✓ | ✗ | ✗ |
| Alterar permissões | ✓ | ✗ | ✗ | ✗ |
| Ativar/desativar usuários | ✓ | ✗ | ✗ | ✗ |
| **Categorias** |
| Visualizar categorias | ✓ | ✓ | ✓ | ✓ |
| Criar/editar categorias | ✓ | ✓ | ✗ | ✗ |
| **Produtos** |
| Visualizar produtos ativos | ✓ | ✓ | ✓ | ✓ |
| Visualizar produtos inativos | ✓ | ✗ | ✗ | ✗ |
| Criar/editar produtos | ✓ | ✓ | ✓ | ✗ |
| Desativar produtos | ✓ | ✓ | ✓ | ✗ |
| **Movimentações** |
| Visualizar movimentações | ✓ | ✓ | ✓ | ✓ |
| Registrar entrada/saída | ✓ | ✓ | ✓ | ✗ |
| **Alertas** |
| Visualizar alertas de estoque | ✓ | ✓ | ✓ | ✓ |
| **Relatórios** |
| Visualizar relatórios completos | ✓ | ✓ | ✓ | ✓ |
| **Certificados (futuro)** |
| Visualizar módulo de certificados | ✓ | ✗ | ✗ | ✗ |
| Gerenciar certificados | ✓ | ✗ | ✗ | ✗ |

### 3.2 Implementação de Segurança

#### Row Level Security (RLS)
Todas as tabelas possuem RLS habilitado no Supabase:
- profiles: usuário vê próprio perfil, super_admin/gestor veem todos
- categories: todos veem, super_admin/gestor gerenciam
- products: todos veem ativos, super_admin vê todos, super_admin/gestor/almoxarife gerenciam
- movements: todos veem, super_admin/gestor/almoxarife registram

**Localização:** [supabase/schema_estoque.sql:156-246](../supabase/schema_estoque.sql#L156-L246)

#### Correções de Segurança Aplicadas
- **Problema resolvido:** Recursão infinita nas políticas RLS (políticas que faziam SELECT em profiles dentro de USING)
- **Solução:** Função helper `get_user_role()` com SECURITY DEFINER que bypassa RLS para ler role
- **Arquivo:** [supabase/_manual_apply/002_fix_rls_recursion.sql](../supabase/_manual_apply/002_fix_rls_recursion.sql)

---

## 4. Módulo de Estoque/Almoxarifado

### 4.1 Objetivos Principais
1. Controlar quantidade de itens em estoque
2. Rastrear movimentações (entradas e saídas) com auditoria completa
3. Alertar sobre produtos com estoque abaixo do mínimo
4. Fornecer relatórios para tomada de decisão
5. Manter histórico completo de movimentações

### 4.2 Funcionalidades Detalhadas

#### 4.2.1 Cadastro de Produtos
- Código único por produto (não pode duplicar)
- Categoria obrigatória
- Unidade de medida (ex: unidade, caixa, kg, litro)
- Quantidade mínima para trigger de alerta
- Localização física no almoxarifado
- Status ativo/inativo
- Campo calculado automático: is_low_stock (gerado always as)

#### 4.2.2 Movimentações
- Validação automática via trigger `movement_update_quantity`
- Atualização atômica do estoque (transaction-safe)
- Não permite saída com quantidade maior que estoque atual
- Registra quantidade anterior e nova para auditoria
- Motivo obrigatório
- Observações opcionais

#### 4.2.3 Triggers e Automações
1. **handle_new_user**: Cria perfil automaticamente ao registrar usuário
2. **update_updated_at**: Atualiza timestamp em profiles e products
3. **update_product_quantity**: Atualiza estoque após movimentação

**Localização:** [supabase/schema_estoque.sql:78-151](../supabase/schema_estoque.sql#L78-L151)

### 4.3 Fluxos Principais

#### Fluxo 1: Registrar Entrada
1. Almoxarife/gestor/super_admin acessa Movimentações
2. Clica em "Nova Movimentação"
3. Seleciona tipo "Entrada"
4. Escolhe produto
5. Informa quantidade e motivo
6. Sistema valida e atualiza estoque automaticamente
7. Registra movimentação no histórico

#### Fluxo 2: Registrar Saída
1. Almoxarife/gestor/super_admin acessa Movimentações
2. Clica em "Nova Movimentação"
3. Seleciona tipo "Saída"
4. Escolhe produto
5. Informa quantidade e motivo
6. Sistema valida se há estoque suficiente
7. Se sim: atualiza estoque e registra; Se não: exibe erro
8. Se estoque ficar <= mínimo: produto aparece em Alertas

#### Fluxo 3: Visualizar Alertas
1. Qualquer usuário autenticado acessa Alertas
2. Sistema lista produtos com is_low_stock = true
3. Almoxarife pode clicar em "Registrar Entrada" para repor

---

## 5. Pendências e Dúvidas

### 5.1 Módulo de Certificados
**Status:** Definição de escopo pendente

**Questões a validar:**
1. Qual o propósito do módulo de certificados?
   - Certificados digitais (SSL/TLS)?
   - Certificados de cursos/treinamentos?
   - Certificados de qualidade/conformidade?
   - Outro tipo de certificado?

2. Quais funcionalidades o módulo deve ter?
   - Cadastro de certificados
   - Upload de arquivos
   - Validação/renovação
   - Histórico de vencimentos
   - Notificações de expiração

3. Quem deve ter acesso além do super_admin?
   - Atualmente planejado: apenas super_admin
   - Necessário confirmar se gestor também deve ter acesso

4. O módulo de certificados tem relação com o estoque?
   - Se sim: definir integrações necessárias
   - Se não: manter como módulo independente

### 5.2 Interface de Autenticação
**Status:** Decisão de naming pendente

**Situação atual:**
- Páginas de login/registro exibem "Certificados OCRAL" como título
- Sistema atual é de estoque/almoxarifado, não de certificados

**Decisão necessária:**
1. Manter "Certificados OCRAL" (preparando para módulo futuro)?
2. Alterar para "Sistema OCRAL" ou "ERP OCRAL" (mais genérico)?
3. Alterar para "Estoque OCRAL" (específico ao módulo atual)?

**Arquivos afetados:**
- [src/app/auth/login/page.tsx:37](../src/app/auth/login/page.tsx#L37)
- [src/app/auth/register/page.tsx:48](../src/app/auth/register/page.tsx#L48)

### 5.3 Deploy no Vercel
**Status:** Bloqueado - aguardando redeploy

**Situação:**
- Variáveis de ambiente configuradas no Vercel
- Site retornando 404 DEPLOYMENT_NOT_FOUND
- Redeploy manual necessário

**Ação necessária:**
- Usuário deve fazer redeploy no Vercel Dashboard ou
- Fazer push para disparar novo deployment automaticamente

**Documentação:** [docs/VERCEL_CONFIG.md](VERCEL_CONFIG.md)

### 5.6 Credenciais do Super Admin
**Status:** Configuradas

**Contas super admin:**
- `jadirconsult@gmail.com` - Senha: `#Mudar@123`
- `administrador@ocral.com.br` - (se registrado)

**Nota:** Para aplicar as mudanças no Supabase, execute o script [supabase/_manual_apply/003_add_super_admin.sql](../supabase/_manual_apply/003_add_super_admin.sql) no SQL Editor.

### 5.7 Aplicação de Scripts SQL no Supabase
**Status:** Scripts prontos, aplicação pendente

**Scripts disponíveis:**
1. [003_add_super_admin.sql](../supabase/_manual_apply/003_add_super_admin.sql) - Adicionar jadirconsult@gmail.com como super admin
2. [000_teste_rls_anon.sql](../supabase/_manual_apply/000_teste_rls_anon.sql) - Teste de vazamento RLS
3. [001_indices_performance.sql](../supabase/_manual_apply/001_indices_performance.sql) - Criação de índices

**Ação necessária:**
- Executar script 003 no Supabase SQL Editor para ativar o super admin
- Executar scripts 000 e 001 para melhorias de performance e segurança

### 5.4 Expansão do ERP
**Status:** Planejamento futuro

**Módulos potenciais para expansão:**
1. Financeiro (contas a pagar/receber)
2. Compras (pedidos, fornecedores)
3. Vendas (pedidos, clientes)
4. Recursos Humanos (funcionários, folha)
5. Produção (ordens de produção, BOM)

**Priorização necessária:** Qual módulo implementar primeiro após certificados?

### 5.5 Melhorias de Performance
**Status:** Scripts SQL prontos, aplicação pendente

**Arquivos disponíveis:**
1. [supabase/_manual_apply/000_teste_rls_anon.sql](../supabase/_manual_apply/000_teste_rls_anon.sql) - Teste de vazamento RLS
2. [supabase/_manual_apply/001_indices_performance.sql](../supabase/_manual_apply/001_indices_performance.sql) - Criação de índices
3. [supabase/_manual_apply/002_fix_rls_recursion.sql](../supabase/_manual_apply/002_fix_rls_recursion.sql) - Correção RLS (aplicado)

**Ação necessária:**
- Executar scripts 000 e 001 no Supabase SQL Editor
- Validar impacto de performance

---

## 6. Sugestões de Próximos Passos

### 6.1 Curto Prazo (Imediato)

#### 1. Aplicar atualização do super admin no Supabase
**Prioridade:** Crítica  
**Ação:** Executar [supabase/_manual_apply/003_add_super_admin.sql](../supabase/_manual_apply/003_add_super_admin.sql) no Supabase SQL Editor  
**Benefício:** Ativa jadirconsult@gmail.com como super admin  
**Tempo estimado:** 1 minuto

#### 2. Resolver deploy no Vercel
**Prioridade:** Crítica  
**Ação:** Redeploy manual no Vercel ou git push para disparar deployment  
**Responsável:** Usuário/DevOps  
**Documentação:** [docs/VERCEL_CONFIG.md](VERCEL_CONFIG.md)

#### 2. Definir escopo do módulo de certificados
**Prioridade:** Alta  
**Ação:** Reunião com stakeholders para definir:
- Tipo de certificado
- Funcionalidades necessárias
- Regras de acesso
- Integrações com outros módulos

**Resultado esperado:** Documento de requisitos específico do módulo

#### 3. Decidir naming da interface de autenticação
**Prioridade:** Média  
**Ação:** Escolher entre "Certificados OCRAL", "Sistema OCRAL", "ERP OCRAL" ou "Estoque OCRAL"  
**Impacto:** 2 arquivos a alterar  

#### 4. Aplicar melhorias de performance no Supabase
**Prioridade:** Média  
**Ação:** Executar scripts SQL de teste RLS e criação de índices  
**Benefício:** Queries 5-100x mais rápidas conforme crescimento de dados

### 6.2 Médio Prazo (1-2 meses)

#### 1. Implementar módulo de certificados
**Dependência:** Definição de escopo (item 6.1.2)  
**Ação:** Desenvolvimento do módulo com acesso restrito a super_admin

#### 2. Melhorar UX do módulo de estoque
**Sugestões:**
- Busca/filtros avançados em produtos
- Exportação de relatórios (Excel, PDF)
- Gráficos visuais no dashboard
- Notificações por email de estoque baixo
- Histórico de alterações em produtos

#### 3. Implementar testes automatizados
**Cobertura sugerida:**
- Testes unitários para validações de negócio
- Testes de integração para triggers e RLS
- Testes E2E para fluxos principais

### 6.3 Longo Prazo (3-6 meses)

#### 1. Definir roadmap de expansão do ERP
**Ação:** Priorizar próximos módulos (Financeiro, Compras, Vendas, RH, Produção)

#### 2. Arquitetura para multi-tenant (se aplicável)
**Avaliar:** Sistema será usado por múltiplas empresas/filiais?

#### 3. Integrações externas
**Possibilidades:**
- ERP externo
- Sistema fiscal
- Nota fiscal eletrônica
- API de fornecedores

---

## 7. Dependências e Riscos

### 7.1 Dependências Técnicas
- **Supabase:** Autenticação, banco de dados, RLS
- **Vercel:** Hospedagem e deployment
- **Next.js 14:** Framework frontend/backend
- **TypeScript:** Type safety

### 7.2 Riscos Identificados

#### Risco 1: Deploy bloqueado no Vercel
**Probabilidade:** Alta (em andamento)  
**Impacto:** Crítico  
**Mitigação:** Documentação clara criada, aguardando ação do usuário

#### Risco 2: Escopo indefinido do módulo de certificados
**Probabilidade:** Média  
**Impacto:** Alto (pode atrasar roadmap)  
**Mitigação:** Priorizar definição de escopo

#### Risco 3: Performance com crescimento de dados
**Probabilidade:** Média  
**Impacto:** Médio  
**Mitigação:** Scripts de índices já preparados, aplicação pendente

#### Risco 4: Segurança - vazamento via RLS
**Probabilidade:** Baixa (já tratado)  
**Impacto:** Crítico  
**Mitigação:** Fix aplicado, script de teste disponível

---

## 8. Histórico de Mudanças

| Data | Versão | Autor | Descrição |
|---|---|---|---|
| 2026-07-14 | 1.0 | Claude Code | Criação inicial do documento de requisitos |

---

## 9. Referências

### Documentação Técnica
- [README.md](../README.md) - Documentação geral do projeto
- [DEPLOY.md](../DEPLOY.md) - Guia de deployment
- [VERCEL_CONFIG.md](VERCEL_CONFIG.md) - Configuração do Vercel
- [RELATORIO-2026-07-14.md](RELATORIO-2026-07-14.md) - Relatório de auditoria

### Código Fonte
- Schema do banco: [supabase/schema_estoque.sql](../supabase/schema_estoque.sql)
- Middleware de autenticação: [src/middleware.ts](../src/middleware.ts)
- Dashboard principal: [src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx)

### Scripts SQL de Manutenção
- Teste RLS: [supabase/_manual_apply/000_teste_rls_anon.sql](../supabase/_manual_apply/000_teste_rls_anon.sql)
- Índices: [supabase/_manual_apply/001_indices_performance.sql](../supabase/_manual_apply/001_indices_performance.sql)
- Fix RLS: [supabase/_manual_apply/002_fix_rls_recursion.sql](../supabase/_manual_apply/002_fix_rls_recursion.sql)
