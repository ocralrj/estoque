// Exemplo simples para OpenRouter (Node.js)
// Uso: defina OPENROUTER_API_KEY e opcionalmente OPENROUTER_MODEL, então rode:
//   node examples/openrouter_node.js

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const URL = "https://api.openrouter.ai/v1/chat/completions";

(async () => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY não definida no ambiente');
    }

    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Escreva um resumo curto em pt-BR' }],
        max_tokens: 200
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${data.error?.message || res.statusText}`);
    }

    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro:', err.message || err);
    process.exitCode = 1;
  }
})();
