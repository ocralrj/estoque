# Manter o Supabase ativo

Projetos no plano gratuito do Supabase podem ser pausados após uma semana com pouca atividade. Não existe comando SQL ou gatilho no PostgreSQL que altere essa regra da plataforma.

Este projeto disponibiliza o endpoint protegido `GET /api/internal/keep-alive`. Ele faz uma consulta simples ao banco, suficiente para registrar atividade quando chamado por uma agenda externa.

## Configuração

No ambiente de produção, defina as variáveis abaixo com valores secretos e diferentes entre si:

```env
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
CRON_SECRET=um-segredo-longo-e-aleatorio
```

Agende uma chamada diária ao endereço abaixo no serviço de monitoramento ou agendamento de sua preferência:

```text
https://SEU-DOMINIO/api/internal/keep-alive
```

Envie um destes cabeçalhos na chamada:

```text
Authorization: Bearer <CRON_SECRET>
```

ou:

```text
x-cron-secret: <CRON_SECRET>
```

O endpoint devolve `200` com `{"status":"ok"}` quando a consulta ao banco funciona. Não coloque o segredo na URL, em código do cliente ou em variáveis `NEXT_PUBLIC_*`.

## Opção definitiva

Em ambiente de produção, migre a organização para um plano pago do Supabase. Projetos pagos não sofrem pausa automática por inatividade.
