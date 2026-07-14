# Sistema de Controle de Estoque OCRAL

Sistema completo de gerenciamento de almoxarifado desenvolvido com Next.js 14, Supabase e TypeScript.

## Funcionalidades

### Gestão de Produtos
- Cadastro completo de produtos (código, nome, descrição, categoria)
- Controle de quantidade em estoque
- Definição de níveis mínimos
- Localização física no almoxarifado
- Status automático de estoque baixo

### Movimentações
- Registro de entradas e saídas
- Histórico completo de movimentações
- Validação automática de quantidade disponível
- Auditoria com usuário e timestamp

### Alertas
- Notificações de produtos com estoque abaixo do mínimo
- Visualização clara de produtos críticos
- Ação rápida para registrar entrada

### Relatórios
- Dashboard com métricas em tempo real
- Análise por período customizável
- Top 10 produtos mais movimentados
- Estatísticas por categoria
- Volume de entradas e saídas

### Controle de Acesso
- 4 níveis de permissão (super_admin, gestor, almoxarife, requisitante)
- Autenticação segura via Supabase
- Políticas de segurança em nível de banco (RLS)

## Tecnologias

- **Frontend**: Next.js 14, React 18, TypeScript
- **Estilo**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth
- **Deploy**: Vercel
- **Forms**: React Hook Form
- **Data**: date-fns

## Estrutura do Projeto

```
src/
├── app/
│   ├── auth/              # Páginas de login e registro
│   ├── dashboard/         # Dashboard principal
│   │   ├── products/      # Gestão de produtos
│   │   ├── movements/     # Movimentações
│   │   ├── alerts/        # Alertas de estoque
│   │   ├── reports/       # Relatórios
│   │   └── users/         # Gestão de usuários
│   └── api/               # API routes
├── components/            # Componentes reutilizáveis
├── lib/                   # Utilitários e configurações
└── types/                 # Definições TypeScript

supabase/
└── schema_estoque.sql     # Schema do banco de dados
```

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/ocralrj/estoque.git
cd estoque
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

### 4. Configurar banco de dados

1. Acesse o dashboard do Supabase
2. Vá em SQL Editor
3. Execute o conteúdo do arquivo `supabase/schema_estoque.sql`

### 5. Executar em desenvolvimento

```bash
npm run dev
```

Acesse http://localhost:3000

## Deploy

Consulte o arquivo [DEPLOY.md](DEPLOY.md) para instruções detalhadas de deploy no Vercel e Supabase.

## Uso

### Primeiro Acesso

1. Acesse a aplicação
2. Faça login com uma das contas super_admin:
   - `jadirconsult@gmail.com` (senha: `#Mudar@123`)
   - `administrador@ocral.com.br` (se registrado)
3. Configure outros usuários através do painel de usuários

**Nota:** Novos registros com os emails `jadirconsult@gmail.com` ou `administrador@ocral.com.br` recebem automaticamente a role `super_admin`.

### Cadastrar Produtos

1. Acesse **Produtos** no menu
2. Clique em **Novo Produto**
3. Preencha os dados (código, nome, categoria, quantidade mínima, etc)
4. Salve

### Registrar Movimentação

1. Acesse **Movimentações** no menu
2. Clique em **Nova Movimentação**
3. Selecione tipo (Entrada/Saída)
4. Escolha o produto
5. Informe quantidade e motivo
6. Registre

### Visualizar Alertas

1. Acesse **Alertas de Estoque** no menu
2. Produtos com estoque baixo aparecem automaticamente
3. Clique em **Registrar Entrada** para repor

## Categorias Padrão

O sistema vem com 5 categorias pré-cadastradas:

- Material de Escritório
- Informática
- Impressoras
- Consumíveis de Impressão
- Material de Limpeza

Você pode adicionar novas categorias através do SQL Editor do Supabase.

## Permissões

### Super Admin
- Acesso total ao sistema
- Gerencia usuários e permissões
- Visualiza todos os relatórios

### Gestor
- Visualiza relatórios completos
- Gerencia usuários
- Visualiza produtos e movimentações

### Almoxarife
- Registra movimentações (entrada/saída)
- Gerencia produtos
- Visualiza alertas

### Requisitante
- Visualiza produtos (somente leitura)
- Não pode registrar movimentações

## Suporte

Para dúvidas ou problemas:
- Abra uma issue no GitHub
- Entre em contato com a equipe OCRAL

## Licença

Propriedade de OCRAL - Todos os direitos reservados.
