#!/usr/bin/env python3
"""Exemplo simples para OpenRouter (Python stdlib).
Uso: defina OPENROUTER_API_KEY e opcionalmente OPENROUTER_MODEL, então rode:
    python examples/openrouter_py.py
"""
import os
import json
import sys
from urllib import request, error

MODEL = os.environ.get("OPENROUTER_MODEL", "gpt-4o-mini")
URL = "https://api.openrouter.ai/v1/chat/completions"

def main():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("OPENROUTER_API_KEY não definida", file=sys.stderr)
        sys.exit(1)

    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Escreva um resumo curto em pt-BR"}],
        "max_tokens": 200,
    }

    data = json.dumps(payload).encode('utf-8')
    req = request.Request(URL, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {api_key}')

    try:
        with request.urlopen(req) as resp:
            resp_body = resp.read().decode('utf-8')
            parsed = json.loads(resp_body)
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except error.HTTPError as e:
        print('HTTP Error:', e.code, e.reason, file=sys.stderr)
        try:
            body = e.read().decode('utf-8')
            print(body, file=sys.stderr)
        except Exception:
            pass
        sys.exit(1)
    except Exception as e:
        print('Erro:', e, file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
