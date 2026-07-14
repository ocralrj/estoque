# Configurar Gemini (IA grátis do Google)

O OCRAL usa **Google Gemini** por padrão para:
- Sugerir uma melhoria (chat/resumo)
- Botão **Sugira com IA** nos formulários

## 1. Gerar a chave (grátis)

1. Acesse: https://aistudio.google.com/apikey  
2. Faça login com sua conta Google  
3. Clique em **Create API key**  
4. Copie a chave (começa em geral com `AIza...`)

## 2. Local (desenvolvimento)

Crie/edite `.env.local` na raiz do projeto:

```env
AI_SUGGESTIONS_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...sua_chave...
AI_MODEL=gemini-2.0-flash
```

Reinicie o `npm run dev`.

## 3. Produção (Vercel)

1. Vercel → projeto **ocral** → **Settings** → **Environment Variables**  
2. Adicione:

| Name | Value | Environments |
|------|--------|--------------|
| `GEMINI_API_KEY` | `AIza...` | Production, Preview |
| `AI_PROVIDER` | `gemini` | Production, Preview |
| `AI_SUGGESTIONS_ENABLED` | `true` | Production, Preview |
| `AI_MODEL` | `gemini-2.0-flash` | Production, Preview |

3. **Redeploy** (Deployments → ⋯ → Redeploy) para aplicar as variáveis.

Sem a chave, o sistema continua em **modo local** (regras, sem modelo).

## 4. Modelos recomendados (tier grátis)

| Modelo | Uso |
|--------|-----|
| `gemini-2.0-flash` | Padrão — rápido e bom para sugestões |
| `gemini-1.5-flash` | Alternativa estável |
| `gemini-2.5-flash` | Se disponível na sua conta |

## 5. Testar

1. Login no sistema  
2. Botão amarelo **Sugerir uma melhoria** → escreva uma ideia  
3. Ou em **Novo produto** → **Sugira com IA** na descrição  
4. Se a chave estiver ok, a UI deixa de mostrar “Modo local (IA indisponível ou sem chave)”

## Segurança

- A chave **nunca** deve ter prefixo `NEXT_PUBLIC_`  
- Só o servidor chama a API do Google  
- Rate limit por usuário (~40/hora) protege cota e custo  
