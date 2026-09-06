# Login Neumórfico — Guia de Implementação

**Alvo:** React / Next.js · **Base visual:** a gravação "Embossed Login Signup UI"
**Correção aplicada:** contraste elevado ao nível WCAG 2.1 AA · **Sem login social**

---

## 0. O que foi verificado antes deste documento

Este guia não é teoria. O código abaixo foi escrito, renderizado no Chromium e inspecionado quadro a quadro. O que a verificação encontrou e corrigiu:

| Defeito encontrado na primeira versão | Correção |
|---|---|
| Sublinhado azul do foco caía **por cima** da mensagem de erro | Sublinhado movido para dentro de `.neo-control`, que envolve só o input |
| Mensagem de erro de 2 linhas **invadia** o campo seguinte | Mensagem retirada do contêiner posicionado; altura passa a fluir |
| Label continuava **azul** no estado inválido (especificidade CSS) | Regra `.is-invalid input:not(:placeholder-shown) + label` com peso maior |
| Flip auto-focava campo vazio e, ao sair, **acusava erro sem o usuário digitar nada** | Validação no `blur` só dispara em campo tocado ou preenchido |
| 3 combinações de cor **reprovavam** em contraste | Contorno, gradiente azul e verde de sucesso escurecidos |
| No React, o foco após submit inválido **não ia para campo nenhum** (id montado a partir do nome do campo, que não existe no DOM) | Refs por campo (`registrar`), foco direto no elemento |
| Com o cartão virado, o **Tab caía nos campos da face invisível** | Atributo `inert` aplicado à face oculta |

Prova de que o flip 3D roda de fato (matriz interpolando `rotateY` 0→180° e altura acompanhando a face ativa):

```
t= 60ms  transform=matrix(1, 0, 0, 1, 0, 0)                       height=533px
t=120ms  transform=matrix3d(-0.425157, 0, -0.905119, 0, ...)      height=602px
t=200ms  transform=matrix3d(-0.852679, 0, -0.522436, 0, ...)      height=622px
t=300ms  transform=matrix3d(-0.972643, 0, -0.232307, 0, ...)      height=633px
t=500ms  transform=matrix3d(-1, 0, 0, 0, 0, 1, 0, 0, ...)         height=642px
```

---

O componente React foi compilado com esbuild e submetido a 17 verificações funcionais em navegador — montagem sem erro, validação por campo, foco no primeiro inválido, cor do label inválido, erro vindo do backend, estado de sucesso, callbacks recebendo os dados, olho de senha com `aria-pressed`, flip, `inert` na face oculta, altura acompanhando a face, senhas divergentes e cadastro completo. **17/17 passaram.**

---

## 1. Os nove efeitos e como cada um funciona

| # | Efeito no vídeo | Técnica | Onde está no código |
|---|---|---|---|
| 1 | Cartão e campos "esculpidos" | `box-shadow` dupla: clara em cima-esquerda, escura embaixo-direita. Campos usam `inset` para parecerem afundados | `.neo-face`, `.neo-field input` |
| 2 | **Flip 3D** Login ↔ Criar conta | `perspective` no pai, `transform-style: preserve-3d` no giratório, `rotateY(180deg)` + `backface-visibility: hidden` | `.neo-scene`, `.neo-flipper`, `.neo-face` |
| 3 | Label que sobe e vira azul | `:focus` / `:not(:placeholder-shown)` + `transform: translateY() scale()` | `.neo-field label` |
| 4 | Linha crescendo sob o campo | Pseudo-elemento `::after` com `scaleX(0→1)` e `transform-origin: left` | `.neo-control::after` |
| 5 | Botão com gradiente e brilho | `::before` com `linear-gradient` que ganha opacidade + `box-shadow` colorida | `.neo-btn::before` |
| 6 | Botão vira "✓ Sucesso" | Troca de classe `.is-loading` → `.is-success` | `.neo-btn.is-success` |
| 7 | Olho de mostrar/ocultar senha | Alterna `type` entre `password` e `text` | `.neo-eye` |
| 8 | Bolhas desfocadas no fundo | Divs com `filter: blur(60px)` e `@keyframes` de deriva | `.neo-blobs` |
| 9 | Ripple no botão redondo | `radial-gradient` em `::after` expandindo com `scale(0→10)` | `.neo-round.is-rippling` |

Nenhum deles depende de biblioteca externa. É CSS puro mais um pouco de estado em React.

---

## 2. Design tokens

Cole no topo do seu CSS global, ou dentro do módulo do login.

```css
:root{
  /* superfície neumórfica */
  --neo-bg:#e6eaf0;        /* fundo E cartão: em neumorfismo são a mesma cor */
  --neo-light:#ffffff;     /* luz — sombra superior-esquerda */
  --neo-dark:#b4bdcb;      /* sombra inferior-direita */
  --neo-edge:#7b8493;      /* contorno de componente — 3.13:1 vs fundo */

  /* texto */
  --text:#16202f;
  --text-muted:#4a5568;

  /* ação */
  --primary:#1d4ed8;
  --primary-dark:#1e3a8a;
  --primary-soft:#2563eb;

  /* estados */
  --danger:#b3261e;
  --success:#146c43;

  /* forma e tempo */
  --radius-card:26px;
  --radius-field:14px;
  --dur:.42s;
  --ease:cubic-bezier(.22,.61,.36,1);
}
```

### Contraste medido (WCAG 2.1 AA)

| Elemento | Cor | Razão | Mínimo | |
|---|---|---|---|---|
| Texto principal | `#16202f` | **13.57:1** | 4.5 | ✅ |
| Texto secundário | `#4a5568` | **6.23:1** | 4.5 | ✅ |
| Link e label flutuante | `#1d4ed8` | **5.55:1** | 4.5 | ✅ |
| Rótulo do botão em repouso | `#1e3a8a` | **8.58:1** | 4.5 | ✅ |
| Mensagem de erro | `#b3261e` | **5.41:1** | 4.5 | ✅ |
| Contorno de campo e botão | `#7b8493` | **3.13:1** | 3.0 | ✅ |
| Branco sobre a ponta clara do gradiente | `#ffffff` | **5.17:1** | 4.5 | ✅ |
| Branco sobre o verde de sucesso | `#ffffff` | **5.87:1** | 4.5 | ✅ |
| Borda de foco | `#2563eb` | **4.28:1** | 3.0 | ✅ |

> **Por que o contorno `--neo-edge` existe.** No vídeo original os campos são delimitados só pela sombra neumórfica, que fica em torno de 1.4:1 — bem abaixo do mínimo de 3:1 do critério WCAG 1.4.11 (contraste de elementos não textuais). Uma borda de 1px a 3.13:1 resolve sem matar o efeito esculpido. Se você optar por remover essa borda, saiba que está abrindo mão da conformidade AA conscientemente.

---

## 3. `login-neo.css`

```css
/* ============ 1. CENA E CARTÃO (flip 3D) ============ */
.neo-scene{position:relative;z-index:1;width:100%;max-width:400px;perspective:1600px}
.neo-flipper{
  position:relative;transform-style:preserve-3d;
  transition:transform var(--dur) var(--ease), height var(--dur) var(--ease);
}
.neo-scene[data-face="signup"] .neo-flipper{transform:rotateY(180deg)}
.neo-face{
  position:absolute;inset:0 0 auto 0;
  backface-visibility:hidden;-webkit-backface-visibility:hidden;
  background:var(--neo-bg);border-radius:var(--radius-card);padding:34px 28px 28px;
  box-shadow:12px 12px 26px var(--neo-dark), -12px -12px 26px var(--neo-light);
}
.neo-face--signup{transform:rotateY(180deg)}

/* ============ SELO E TÍTULOS ============ */
.neo-badge{
  width:74px;height:74px;margin:0 auto 16px;border-radius:50%;
  display:grid;place-items:center;font-size:30px;background:var(--neo-bg);
  box-shadow:7px 7px 14px var(--neo-dark), -7px -7px 14px var(--neo-light);
}
.neo-title{margin:0;text-align:center;font-size:1.6rem;font-weight:700;letter-spacing:-.02em}
.neo-sub{margin:6px 0 26px;text-align:center;font-size:.875rem;color:var(--text-muted)}

/* ============ 3+4. CAMPO, LABEL FLUTUANTE, SUBLINHADO ============ */
.neo-field{margin-bottom:20px}
.neo-control{position:relative}          /* ⚠ envolve SÓ input+label+olho */
.neo-field input{
  width:100%;height:54px;padding:20px 44px 6px 18px;
  font-size:.95rem;font-family:inherit;color:var(--text);
  background:var(--neo-bg);border:1px solid var(--neo-edge);border-radius:var(--radius-field);
  box-shadow:inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light);
  outline:none;transition:border-color .2s var(--ease), box-shadow .2s var(--ease);
}
.neo-field input::placeholder{color:transparent}   /* o placeholder " " sustenta o truque do label */
.neo-field label{
  position:absolute;left:18px;top:17px;font-size:.95rem;color:var(--text-muted);
  pointer-events:none;transform-origin:left top;
  transition:transform .2s var(--ease), color .2s var(--ease);
}
.neo-field input:focus + label,
.neo-field input:not(:placeholder-shown) + label{
  transform:translateY(-11px) scale(.72);color:var(--primary);font-weight:600;
}
.neo-field input:focus{border-color:var(--primary-soft)}

.neo-control::after{
  content:"";position:absolute;left:16px;right:16px;bottom:5px;height:2px;
  background:var(--primary);border-radius:2px;
  transform:scaleX(0);transform-origin:left;transition:transform .28s var(--ease);
}
.neo-control:focus-within::after{transform:scaleX(1)}
.neo-field.is-invalid .neo-control::after{background:var(--danger)}

/* ============ 7. MOSTRAR / OCULTAR SENHA ============ */
.neo-eye{
  position:absolute;right:8px;top:9px;width:36px;height:36px;border:0;border-radius:50%;
  background:var(--neo-bg);color:var(--text-muted);cursor:pointer;display:grid;place-items:center;
  box-shadow:3px 3px 6px var(--neo-dark), -3px -3px 6px var(--neo-light);
}
.neo-eye:hover{color:var(--primary)}
.neo-eye:active{box-shadow:inset 3px 3px 6px var(--neo-dark), inset -3px -3px 6px var(--neo-light)}
.neo-eye:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.neo-eye svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9}

/* ============ MENSAGEM DE ERRO ============ */
.neo-error{
  display:block;margin:6px 0 0 4px;font-size:.78rem;font-weight:600;
  color:var(--danger);opacity:0;transform:translateY(-4px);
  transition:opacity .2s var(--ease), transform .2s var(--ease);
}
.neo-field.is-invalid input{
  border-color:var(--danger);
  box-shadow:inset 4px 4px 8px #cfa9a5, inset -4px -4px 8px var(--neo-light);
}
.neo-field.is-invalid input + label,
.neo-field.is-invalid input:focus + label,
.neo-field.is-invalid input:not(:placeholder-shown) + label{color:var(--danger)}
.neo-field.is-invalid .neo-error{opacity:1;transform:translateY(0)}
.neo-error--geral{opacity:1;transform:none;margin-bottom:12px}   /* erro vindo do backend */

/* ============ LINHA AUXILIAR ============ */
.neo-row{display:flex;align-items:center;justify-content:space-between;margin:-6px 0 22px;font-size:.82rem}
.neo-check{display:flex;align-items:center;gap:8px;color:var(--text-muted);cursor:pointer}
.neo-check input{width:17px;height:17px;accent-color:var(--primary);cursor:pointer}
.neo-link{color:var(--primary);font-weight:600;text-decoration:none}
.neo-link:hover{text-decoration:underline}
.neo-link:focus-visible{outline:2px solid var(--primary);outline-offset:3px;border-radius:4px}

/* ============ 5+6. BOTÃO PRINCIPAL ============ */
.neo-btn{
  position:relative;width:100%;height:52px;
  border:1px solid var(--neo-edge);border-radius:var(--radius-field);
  font:600 .95rem/1 inherit;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
  color:var(--primary-dark);background:var(--neo-bg);overflow:hidden;
  box-shadow:6px 6px 13px var(--neo-dark), -6px -6px 13px var(--neo-light);
  transition:color .25s var(--ease), box-shadow .25s var(--ease), border-color .25s var(--ease);
}
.neo-btn span{position:relative;z-index:1}
.neo-btn::before{
  content:"";position:absolute;inset:0;z-index:0;border-radius:inherit;
  background:linear-gradient(135deg,var(--primary-soft),var(--primary) 55%,var(--primary-dark));
  opacity:0;transition:opacity .25s var(--ease);
}
.neo-btn:hover{color:#fff;border-color:transparent;box-shadow:0 8px 22px rgba(29,78,216,.42)}
.neo-btn:hover::before{opacity:1}
.neo-btn:focus-visible{outline:3px solid var(--primary-dark);outline-offset:3px}
.neo-btn:active{box-shadow:inset 5px 5px 10px var(--neo-dark), inset -5px -5px 10px rgba(255,255,255,.25)}
.neo-btn.is-loading{pointer-events:none;color:#fff;border-color:transparent}
.neo-btn.is-loading::before{opacity:1}
.neo-btn.is-success{
  color:#fff;pointer-events:none;border-color:transparent;
  box-shadow:0 8px 22px rgba(20,108,67,.4);
}
.neo-btn.is-success::before{opacity:1;background:linear-gradient(135deg,#157347,#0f5f39)}
.neo-spin{
  display:inline-block;width:16px;height:16px;vertical-align:-3px;margin-right:8px;
  border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;
  animation:neoSpin .7s linear infinite;
}
@keyframes neoSpin{to{transform:rotate(360deg)}}

/* ============ 9. TROCA DE FACE + RIPPLE ============ */
.neo-switch{
  display:flex;align-items:center;justify-content:center;gap:10px;
  margin-top:24px;font-size:.85rem;color:var(--text-muted);
}
.neo-round{
  position:relative;width:40px;height:40px;
  border:1px solid var(--neo-edge);border-radius:50%;cursor:pointer;overflow:hidden;
  background:var(--neo-bg);color:var(--primary);font-size:1.15rem;font-weight:700;line-height:1;
  box-shadow:5px 5px 10px var(--neo-dark), -5px -5px 10px var(--neo-light);
  transition:box-shadow .2s var(--ease), transform .2s var(--ease);
}
.neo-round:hover{transform:translateY(-2px)}
.neo-round:active{box-shadow:inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light)}
.neo-round:focus-visible{outline:2px solid var(--primary);outline-offset:3px}
.neo-round::after{
  content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:50%;
  background:radial-gradient(circle,rgba(29,78,216,.45),transparent 70%);
  transform:translate(-50%,-50%) scale(0);opacity:0;
}
.neo-round.is-rippling::after{animation:neoRipple .55s var(--ease)}
@keyframes neoRipple{
  0%{transform:translate(-50%,-50%) scale(0);opacity:.9}
  100%{transform:translate(-50%,-50%) scale(10);opacity:0}
}

/* ============ 8. BOLHAS DE FUNDO ============ */
.neo-blobs{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.neo-blobs span{
  position:absolute;border-radius:50%;filter:blur(60px);opacity:.5;
  animation:neoBlob 18s var(--ease) infinite alternate;
}
.neo-blobs span:nth-child(1){width:340px;height:340px;left:-90px;top:-60px;background:#fff}
.neo-blobs span:nth-child(2){width:300px;height:300px;right:-80px;bottom:-40px;background:#cfd8e6;animation-delay:-6s}
.neo-blobs span:nth-child(3){width:220px;height:220px;right:12%;top:8%;background:#dbe3ee;animation-delay:-11s}
@keyframes neoBlob{
  from{transform:translate3d(0,0,0) scale(1)}
  to{transform:translate3d(28px,-34px,0) scale(1.12)}
}

/* ============ CORREÇÃO DO AUTOPREENCHIMENTO DO CHROME ============ */
/* Sem isto o Chrome pinta o campo de amarelo/azul e mata o efeito esculpido. */
.neo-field input:-webkit-autofill,
.neo-field input:-webkit-autofill:hover,
.neo-field input:-webkit-autofill:focus{
  -webkit-text-fill-color:var(--text);
  -webkit-box-shadow:0 0 0 1000px var(--neo-bg) inset,
                     inset 4px 4px 8px var(--neo-dark),
                     inset -4px -4px 8px var(--neo-light);
  transition:background-color 9999s ease-out;
}
/* O autopreenchimento não dispara :not(:placeholder-shown) em todo navegador — daí a regra extra */
.neo-field input:-webkit-autofill + label{
  transform:translateY(-11px) scale(.72);color:var(--primary);font-weight:600;
}

/* ============ ACESSIBILIDADE: MOVIMENTO REDUZIDO ============ */
@media (prefers-reduced-motion:reduce){
  .neo-flipper,.neo-control::after,.neo-field label,
  .neo-btn,.neo-btn::before,.neo-round,.neo-error{
    transition-duration:.01ms !important;
  }
  .neo-blobs span,.neo-spin,.neo-round.is-rippling::after{
    animation-duration:.01ms !important;animation-iteration-count:1 !important;
  }
}
```

---

## 4. `LoginNeo.jsx` — componente React / Next.js

```jsx
'use client';   // remova esta linha se usar Pages Router ou React puro (Vite/CRA)

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './login-neo.css';

/* ---------- regras de validação, em português ---------- */
const REGRAS = {
  nome:  v => !v.trim() ? 'Informe seu nome completo.'
            : v.trim().length < 3 ? 'O nome deve ter ao menos 3 caracteres.' : '',
  email: v => !v.trim() ? 'Informe seu e-mail.'
            : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? 'E-mail inválido. Ex.: nome@empresa.com.br' : '',
  senha: v => !v ? 'Informe sua senha.'
            : v.length < 8 ? 'A senha deve ter ao menos 8 caracteres.' : '',
  confirma: (v, tudo) => !v ? 'Confirme sua senha.'
            : v !== tudo.senha ? 'As senhas não conferem.' : '',
};

function IconeOlho({ aberto }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      {aberto ? <path d="M4 4l16 16" /> : <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

function Campo({ id, nome, rotulo, tipo = 'text', autoComplete, valor, erro, onChange, onBlur, inputRef }) {
  const [revelada, setRevelada] = useState(false);
  const ehSenha = tipo === 'password';
  const tipoReal = ehSenha && revelada ? 'text' : tipo;

  return (
    <div className={`neo-field${erro ? ' is-invalid' : ''}`}>
      <div className="neo-control">
        <input
          id={id} name={nome} type={tipoReal} placeholder=" "
          autoComplete={autoComplete} value={valor}
          onChange={onChange} onBlur={onBlur} ref={inputRef}
          aria-invalid={erro ? 'true' : 'false'} aria-describedby={`err-${id}`}
        />
        <label htmlFor={id}>{rotulo}</label>
        {ehSenha && (
          <button type="button" className="neo-eye"
                  onClick={() => setRevelada(r => !r)}
                  aria-pressed={revelada}
                  aria-label={revelada ? 'Ocultar senha' : 'Mostrar senha'}>
            <IconeOlho aberto={revelada} />
          </button>
        )}
      </div>
      <span className="neo-error" id={`err-${id}`} role="alert">{erro}</span>
    </div>
  );
}

function BotaoNeo({ estado, rotulo }) {
  const classe = 'neo-btn'
    + (estado === 'enviando' ? ' is-loading' : '')
    + (estado === 'sucesso' ? ' is-success' : '');
  return (
    <button type="submit" className={classe} disabled={estado !== 'ocioso'}>
      <span>
        {estado === 'enviando' && <i className="neo-spin" />}
        {estado === 'enviando' ? 'Enviando…' : estado === 'sucesso' ? '✓ Sucesso' : rotulo}
      </span>
    </button>
  );
}

/* ---------- hook de formulário ---------- */
function useFormulario(iniciais, aoEnviar, aoMudarAltura) {
  const [valores, setValores] = useState(iniciais);
  const [erros, setErros] = useState({});
  const [tocados, setTocados] = useState({});
  const [estado, setEstado] = useState('ocioso');
  const [erroGeral, setErroGeral] = useState('');
  const refs = useRef({});

  const registrar = nome => el => { refs.current[nome] = el; };
  const validar = (nome, valor, todos) => (REGRAS[nome] ? REGRAS[nome](valor, todos) : '');

  const mudar = nome => e => {
    const valor = e.target.value;
    const novos = { ...valores, [nome]: valor };
    setValores(novos);
    setTocados(t => ({ ...t, [nome]: true }));
    setErros(er => (er[nome] ? { ...er, [nome]: validar(nome, valor, novos) } : er));
  };

  const sair = nome => () => {
    if (!valores[nome] && !tocados[nome]) return;
    setErros(er => ({ ...er, [nome]: validar(nome, valores[nome], valores) }));
  };

  const enviar = async e => {
    e.preventDefault();
    setErroGeral('');
    const novos = {};
    Object.keys(iniciais).forEach(k => { novos[k] = validar(k, valores[k], valores); });
    setErros(novos);
    const primeiroRuim = Object.keys(novos).find(k => novos[k]);
    if (primeiroRuim) { refs.current[primeiroRuim]?.focus(); return; }
    try {
      setEstado('enviando');
      await aoEnviar(valores);
      setEstado('sucesso');
      setTimeout(() => setEstado('ocioso'), 1800);
    } catch (err) {
      setEstado('ocioso');
      setErroGeral(err?.message || 'Não foi possível concluir. Tente novamente.');
    }
  };

  useEffect(() => { aoMudarAltura?.(); }, [erros, erroGeral, aoMudarAltura]);

  return { valores, erros, estado, erroGeral, mudar, sair, enviar, registrar };
}

function FormLogin({ ativo, onEntrar, aoMudarAltura }) {
  const [lembrar, setLembrar] = useState(false);
  const f = useFormulario({ email: '', senha: '' }, v => onEntrar({ ...v, lembrar }), aoMudarAltura);
  return (
    <form onSubmit={f.enviar} noValidate>
      <Campo id="loginEmail" nome="email" rotulo="E-mail" tipo="email" autoComplete="email"
             valor={f.valores.email} erro={f.erros.email} inputRef={f.registrar('email')}
             onChange={f.mudar('email')} onBlur={f.sair('email')} />
      <Campo id="loginSenha" nome="senha" rotulo="Senha" tipo="password" autoComplete="current-password"
             valor={f.valores.senha} erro={f.erros.senha} inputRef={f.registrar('senha')}
             onChange={f.mudar('senha')} onBlur={f.sair('senha')} />
      <div className="neo-row">
        <label className="neo-check">
          <input type="checkbox" checked={lembrar} onChange={e => setLembrar(e.target.checked)} />
          Lembrar de mim
        </label>
        <a className="neo-link" href="/recuperar-senha">Esqueceu a senha?</a>
      </div>
      {f.erroGeral && <p className="neo-error neo-error--geral" role="alert">{f.erroGeral}</p>}
      <BotaoNeo estado={f.estado} rotulo="Entrar" />
    </form>
  );
}

function FormCadastro({ ativo, onCriarConta, aoMudarAltura }) {
  const f = useFormulario({ nome: '', email: '', senha: '', confirma: '' },
    v => onCriarConta({ nome: v.nome, email: v.email, senha: v.senha }), aoMudarAltura);
  return (
    <form onSubmit={f.enviar} noValidate>
      <Campo id="regNome" nome="nome" rotulo="Nome completo" autoComplete="name"
             valor={f.valores.nome} erro={f.erros.nome} inputRef={f.registrar('nome')}
             onChange={f.mudar('nome')} onBlur={f.sair('nome')} />
      <Campo id="regEmail" nome="email" rotulo="E-mail" tipo="email" autoComplete="email"
             valor={f.valores.email} erro={f.erros.email} inputRef={f.registrar('email')}
             onChange={f.mudar('email')} onBlur={f.sair('email')} />
      <Campo id="regSenha" nome="senha" rotulo="Senha" tipo="password" autoComplete="new-password"
             valor={f.valores.senha} erro={f.erros.senha} inputRef={f.registrar('senha')}
             onChange={f.mudar('senha')} onBlur={f.sair('senha')} />
      <Campo id="regConfirma" nome="confirma" rotulo="Confirmar senha" tipo="password" autoComplete="new-password"
             valor={f.valores.confirma} erro={f.erros.confirma} inputRef={f.registrar('confirma')}
             onChange={f.mudar('confirma')} onBlur={f.sair('confirma')} />
      {f.erroGeral && <p className="neo-error neo-error--geral" role="alert">{f.erroGeral}</p>}
      <BotaoNeo estado={f.estado} rotulo="Criar conta" />
    </form>
  );
}

export default function LoginNeo({ onEntrar, onCriarConta }) {
  const [face, setFace] = useState('login');
  const flipperRef = useRef(null);
  const loginRef = useRef(null);
  const signupRef = useRef(null);
  const faces = { login: loginRef, signup: signupRef };

  const ajustarAltura = useCallback(() => {
    const alvo = faces[face].current;
    if (alvo && flipperRef.current) flipperRef.current.style.height = `${alvo.offsetHeight}px`;
  }, [face]);

  useLayoutEffect(ajustarAltura);

  /* `inert` desliga foco e leitura de tela na face virada — nenhum Tab cai no verso */
  useLayoutEffect(() => {
    if (loginRef.current)  loginRef.current.inert  = face !== 'login';
    if (signupRef.current) signupRef.current.inert = face !== 'signup';
  }, [face]);

  useEffect(() => {
    window.addEventListener('resize', ajustarAltura);
    document.fonts?.ready.then(ajustarAltura);
    return () => window.removeEventListener('resize', ajustarAltura);
  }, [ajustarAltura]);

  const trocarFace = (destino, evento) => {
    const botao = evento.currentTarget;
    botao.classList.remove('is-rippling');
    void botao.offsetWidth;
    botao.classList.add('is-rippling');
    setFace(destino);
  };

  return (
    <>
      <div className="neo-blobs" aria-hidden="true"><span /><span /><span /></div>
      <div className="neo-scene" data-face={face}>
        <div className="neo-flipper" ref={flipperRef}>
          <section className="neo-face neo-face--login" ref={loginRef}>
            <div className="neo-badge" aria-hidden="true">🔐</div>
            <h1 className="neo-title">Bem-vindo</h1>
            <p className="neo-sub">Entre para continuar</p>
            <FormLogin ativo={face === 'login'} onEntrar={onEntrar} aoMudarAltura={ajustarAltura} />
            <div className="neo-switch">
              <span>Não tem conta?</span>
              <button type="button" className="neo-round" onClick={e => trocarFace('signup', e)}
                      aria-label="Ir para criar conta">+</button>
            </div>
          </section>

          <section className="neo-face neo-face--signup" ref={signupRef}>
            <div className="neo-badge" aria-hidden="true">✨</div>
            <h1 className="neo-title">Criar conta</h1>
            <p className="neo-sub">Comece sua jornada conosco</p>
            <FormCadastro ativo={face === 'signup'} onCriarConta={onCriarConta} aoMudarAltura={ajustarAltura} />
            <div className="neo-switch">
              <span>Já tem conta?</span>
              <button type="button" className="neo-round" onClick={e => trocarFace('login', e)}
                      aria-label="Voltar para entrar">←</button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
```

---

## 5. Ligando ao seu backend

O componente não sabe nada sobre autenticação — ele só recebe duas funções. Isso é proposital: você troca o backend sem tocar no visual.

### Supabase

```jsx
'use client';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import LoginNeo from '@/components/LoginNeo';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PaginaLogin() {
  const router = useRouter();

  async function onEntrar({ email, senha }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduzir(error.message));
    router.push('/painel');
  }

  async function onCriarConta({ nome, email, senha }) {
    const { error } = await supabase.auth.signUp({
      email, password: senha, options: { data: { nome } },
    });
    if (error) throw new Error(traduzir(error.message));
  }

  return <LoginNeo onEntrar={onEntrar} onCriarConta={onCriarConta} />;
}

/* o Supabase devolve mensagens em inglês — traduza as que o usuário pode ver */
function traduzir(msg) {
  const mapa = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha é muito curta.',
    'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos.',
  };
  return mapa[msg] || 'Não foi possível concluir. Tente novamente.';
}
```

### API própria (rota do Next.js)

```jsx
async function onEntrar({ email, senha, lembrar }) {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha, lembrar }),
  });
  if (!r.ok) {
    const { mensagem } = await r.json().catch(() => ({}));
    throw new Error(mensagem || 'E-mail ou senha incorretos.');
  }
  router.push('/painel');
}
```

### NextAuth (provedor Credentials)

```jsx
import { signIn } from 'next-auth/react';

async function onEntrar({ email, senha }) {
  const r = await signIn('credentials', { email, senha, redirect: false });
  if (r?.error) throw new Error('E-mail ou senha incorretos.');
  router.push('/painel');
}
```

> **Cuidado com a mensagem de erro.** Use sempre "E-mail ou senha incorretos" — nunca "usuário não existe". Distinguir os dois casos permite enumerar contas válidas do seu sistema.

---

## 6. Migrando a sua tela de login atual

Ordem que minimiza retrabalho:

1. **Copie `login-neo.css`** para o projeto e importe os tokens no CSS global (ou no `layout.jsx`).
2. **Renomeie o seu componente atual** para `LoginAntigo.jsx` — não apague. Você vai comparar comportamento.
3. **Adicione `LoginNeo.jsx`** e ligue às MESMAS funções de autenticação que o antigo já usa. Nenhuma mudança de backend nesta etapa.
4. **Troque a rota** para renderizar o novo. Teste entrar, errar a senha, criar conta, recuperar senha.
5. **Só depois** apague o antigo.

Se hoje você usa Tailwind e prefere não trazer CSS solto, os efeitos 1, 2, 4, 5 e 9 dependem de `box-shadow` múltipla, `preserve-3d` e pseudo-elementos — coisas que ficam ilegíveis em classes utilitárias. A recomendação é manter estes num arquivo `.css` e usar Tailwind só para o layout ao redor.

### Se a sua tela tem campos a mais

Adicione um `<Campo />` e a regra correspondente em `REGRAS`. Exemplo para CNPJ:

```js
cnpj: v => !v.trim() ? 'Informe o CNPJ.'
        : !/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(v) ? 'CNPJ inválido.' : '',
```

---

## 7. Armadilhas conhecidas

| Sintoma | Causa | Solução |
|---|---|---|
| O cartão **corta** o conteúdo depois do flip | As duas faces têm alturas diferentes e `position:absolute` tira ambas do fluxo | `ajustarAltura()` mede a face ativa e aplica no giratório — já está no código |
| Conteúdo do verso aparece **espelhado** | Falta `backface-visibility:hidden` ou `transform-style:preserve-3d` no pai | Ambos já estão no CSS. Não coloque `overflow:hidden` no `.neo-scene`: mata o 3D |
| Campo fica **amarelo** ao autopreencher | O Chrome sobrescreve `background` no `:-webkit-autofill` | Bloco de correção do autopreenchimento, na seção 3 |
| Label **não sobe** ao autopreencher | `:not(:placeholder-shown)` não dispara no autofill em alguns navegadores | Regra `input:-webkit-autofill + label`, já incluída |
| Label não sobe nunca | Faltou `placeholder=" "` (com espaço) no input | O truque inteiro depende disso |
| Sombras "sujas" no tema escuro | Neumorfismo depende da cor de fundo; em fundo escuro as duas sombras invertem | Redefina `--neo-bg`, `--neo-light` e `--neo-dark` dentro de `@media (prefers-color-scheme: dark)` |
| Animação pesada em máquina fraca | `filter: blur(60px)` em três elementos custa GPU | Reduza para uma bolha, ou remova `.neo-blobs` |

---

## 8. Checklist de aceite

**Acessibilidade**

- [ ] Todo campo tem `<label htmlFor>` — não use placeholder como rótulo
- [ ] Erros com `role="alert"` e `aria-describedby` ligando ao campo
- [ ] `aria-invalid` acompanha o estado real
- [ ] Foco visível em **todos** os interativos (`:focus-visible`)
- [ ] Navegação completa só pelo teclado, incluindo o botão de trocar de face
- [ ] `prefers-reduced-motion` respeitado
- [ ] `tabIndex={-1}` nos elementos da face oculta, para o Tab não cair no verso invisível

**Segurança**

- [ ] Mensagem genérica de falha ("E-mail ou senha incorretos"), nunca revelando se a conta existe
- [ ] Limite de tentativas por IP e por conta (rate limit) no backend
- [ ] `autoComplete="current-password"` no login e `"new-password"` no cadastro
- [ ] HTTPS obrigatório; cookie de sessão `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] Política de senha do backend igual ou mais forte que a do front — a validação do cliente é conveniência, não defesa
- [ ] "Lembrar de mim" prolonga a sessão, mas nunca guarda a senha

**Visual**

- [ ] Testado em 360px de largura (o cartão tem `max-width:400px` e encolhe)
- [ ] Testado com autopreenchimento do Chrome ativo
- [ ] Testado com zoom de 200% no navegador
- [ ] Flip suave nos dois sentidos, sem corte de conteúdo

---

## 9. Se você decidir abandonar o neumorfismo depois

É uma possibilidade real: o estilo teve seu auge por volta de 2020 e envelhece rápido. O bom é que a estrutura aqui não depende dele. Trocar `--neo-bg`, `--neo-light`, `--neo-dark` e as três declarações de `box-shadow` por bordas sólidas converte a tela inteira para um visual plano em poucos minutos. Os efeitos 2, 3, 4, 5, 6, 7 e 9 continuam funcionando iguais — só o relevo desaparece.
