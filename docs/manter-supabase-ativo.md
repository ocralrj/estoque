# Manter o Supabase ativo

Projetos no plano gratuito do Supabase podem ser pausados após uma semana com pouca atividade. Não existe comando SQL ou gatilho no PostgreSQL que altere essa regra da plataforma.

Este projeto disponibiliza o endpoint protegido `GET /api/internal/keep-alive`. Ele faz uma consulta simples ao banco, suficiente para registrar atividade quando chamado por uma agenda externa.

## Configuração

No ambiente de produção, defina as variáveis abaixo com valores secretos e diferentes entre si:

```env
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
CRON_SECRET=um-segredo-longo-e-aleatorio
```

## Agendamento automático (já configurado no repositório)

`.github/workflows/keep-alive.yml` chama o endpoint todos os dias às 06:30 UTC.
Exige dois secrets no repositório
(Settings → Secrets and variables → Actions):

| Secret | Valor |
| --- | --- |
| `APP_URL` | URL de produção, sem barra final (ex.: `https://ocral.vercel.app`) |
| `CRON_SECRET` | o mesmo valor definido nas variáveis de ambiente da Vercel |

O workflow também pode ser disparado manualmente em Actions → *Manter
Supabase ativo* → *Run workflow*, útil para testar a configuração.

Como o Supabase pausa após cerca de sete dias de inatividade, uma chamada
diária deixa margem larga: seriam necessárias sete falhas seguidas para o
banco chegar a pausar.

### Por que não usamos o Vercel Cron

O `vercel.json` com bloco `crons` foi removido: agendamentos são recurso de
plano Pro, e no plano Hobby a Vercel **recusa a configuração e falha o deploy
imediatamente**, antes de compilar. Se o projeto migrar para o Pro, dá para
reintroduzir o arquivo — mas o workflow acima já resolve, e sem depender do
plano.

## Agendamento manual (alternativa)

Se preferir um serviço externo de monitoramento, agende uma chamada diária ao
endereço abaixo:

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
