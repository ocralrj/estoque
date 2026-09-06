# NEO — Sistema de Design Portátil

**Um arquivo. Cole em qualquer site, ou entregue a qualquer assistente de IA.**
Estilo neumórfico com escopo · WCAG 2.1 AA nos temas claro e escuro · sem dependência externa

---

## Como usar este arquivo

Ele serve para três coisas, sem precisar de adaptação:

1. **Como prompt para uma IA.** Copie a seção 1 (*O prompt*) e cole no assistente junto com o seu código. Ela contém as regras; as seções 4 e 5 contêm o CSS que a IA deve aplicar.
2. **Como especificação para você ou seu time.** Leia a seção 2 e siga.
3. **Como biblioteca.** Salve a seção 4 + 5 como `neo.css`, importe, use as classes da seção 6.

---

## 1. O prompt

> Copie daqui até o fim do bloco e cole no seu assistente de IA, junto com os arquivos do site.

```
Aplique o sistema de design NEO a este projeto. Siga estas regras sem exceção.

REGRA DE ESCOPO — a mais importante
O relevo neumórfico é para MOLDURAS E CONTROLES, nunca para conteúdo denso.
  Recebe relevo: cartões, painéis, barra de navegação, botões, campos de
  formulário, abas, seletores, modais, avatares.
  NÃO recebe relevo, fica em superfície plana (--neo-flat): tabelas, listas
  longas, blocos de texto corrido, resultados de busca, grades de itens,
  qualquer região com mais de 5 elementos repetidos.
Motivo medido: aplicar relevo em tabela deixa os 3 estados de situação
(aprovado/pendente/reprovado) com estilo computado IDÊNTICO — a cor semântica
some — e aumenta a altura da tabela em 17% para as mesmas linhas.

REGRA DE ESTADO
Nenhum estado pode ser sinalizado só por cor ou só por sombra. Cada estado
combina dois canais: desabilitado = cor esmaecida + borda tracejada + relevo
invertido; ativo na navegação = relevo invertido + sublinhado; erro em campo =
borda de 2px + cor + mensagem em texto. Isso atende WCAG 1.4.1.

REGRA DE CONTRASTE
Use apenas os tokens definidos. Não invente cores. Todos os pares de token já
foram medidos: texto acima de 4.5:1, contorno de componente acima de 3:1, nos
dois temas. Se precisar de uma cor nova, calcule o contraste antes e registre
o valor num comentário.

REGRA DE RELEVO
Existem exatamente 3 níveis de elevação (--relevo-1, 2, 3) e 2 de afundamento
(--afundado, --afundado-leve). Não crie um quarto. Elevação maior = mais perto
do usuário: painel interno usa relevo-1, cartão usa relevo-3.

REGRA DE COR SEMÂNTICA
Estado semântico usa .neo-sit: pastilha em relevo, COR NA FONTE (nunca no
fundo — o fundo tem de ser igual ao da superfície para o relevo existir).
A pastilha herda a cor da superfície onde está: dentro de .neo-flat usa
--neo-flat e --relevo-plano; fora, --neo-bg e --relevo-1. Já está no CSS.
Por isso a zebra de tabela é OPT-IN (.neo-tabela--zebra): com listras a
pastilha cairia sobre duas cores diferentes. Em tabela larga que precise de
zebra, use .neo-badge (fundo tingido) no lugar de .neo-sit.
Mas cor de fonte sozinha NÃO basta: as quatro cores semânticas passam de
7.4:1 sobre o fundo e ainda assim têm luminância quase idêntica entre si
(1.00 a 1.08:1). Em deuteranopia, "Pendente" e "Reprovado" viram a mesma cor.
Por isso todo estado carrega um GLIFO (✓ ◐ ✕ ◔) além da cor. Não remova o
glifo por questão estética: ele é o segundo canal exigido pela WCAG 1.4.1.

REGRA DE BOTÃO
Nunca use pseudo-elemento sobreposto (::before com z-index) para o gradiente
do botão: ele cobre nós de texto puro e o rótulo some. Use background-image
no próprio elemento.

REGRA DE MOVIMENTO
Toda transição respeita prefers-reduced-motion. Nenhuma animação essencial
para entender a interface.

O QUE FAZER
1. Adicione o arquivo neo.css ao projeto e importe-o antes do seu CSS.
2. Substitua as cores do site pelos tokens (variáveis CSS) — não mantenha
   hexadecimais soltos.
3. Converta os componentes existentes para as classes .neo-*.
4. Marque cada região densa com <div class="neo-flat"> ao redor — este é o
   padrão. .neo-tabela--relevo (linhas esculpidas) é exceção, só até ~15 linhas.
5. Rode a checagem da seção 8 e me mostre o resultado.

O QUE NÃO FAZER
- Não aplicar relevo em <table>, <li> de lista longa ou parágrafo.
- Não remover a borda --neo-edge dos controles: ela é o que garante os 3:1.
- Não usar login social nem coletar dados além do necessário.
- Não usar localStorage para estado que precisa sobreviver ao navegador.
```

---

## 2. A decisão de escopo, e por que ela existe

Neumorfismo é um estilo de **moldura**. Ele nasceu em telas de login e cartões isolados, e é ali que funciona. Aplicado a um site inteiro sem critério, ele quebra de um jeito específico e mensurável.

Renderizei a mesma tabela de 6 linhas nas duas abordagens e medi:

| | Neumorfismo em tudo | Escopo misto |
|---|---|---|
| Estilo computado dos 3 estados de situação | **idêntico** — `rgb(230,234,240)` de fundo e `rgb(22,32,47)` de texto nos três | três fundos distintos, cada um pareado com seu texto |
| Botão desabilitado vs ativo | diferença **só na cor do texto** | cor + borda tracejada + relevo invertido |
| Altura para as mesmas 6 linhas | 380px | 324px (**+17%** no neumórfico) |

O primeiro item é o mais grave: quando toda superfície precisa ter a mesma cor do fundo — que é a definição do neumorfismo — não sobra canal para cor semântica. "Aprovado" e "Reprovado" ficam visualmente iguais. Num sistema de controle de qualidade isso não é questão de gosto.

A solução não é abandonar o estilo. É delimitá-lo:

```
┌─ .neo-card ────────────── relevo, esculpido ─┐
│  Título, ações, botões                       │
│  ┌─ .neo-flat ─── plano, sem relevo ──────┐  │
│  │  tabela / lista / texto corrido        │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

A moldura carrega a identidade visual. O conteúdo carrega a informação.

---

## 3. O que foi verificado

Nada aqui é suposição. O CSS foi renderizado no Chromium nos dois temas e auditado por cálculo.

**Contraste — 28 pares medidos, 100% em conformidade AA:**

| Par | Claro | Escuro | Mínimo |
|---|---|---|---|
| Texto sobre cartão | 13.57:1 | 11.95:1 | 4.5 |
| Texto secundário sobre cartão | 6.23:1 | 6.70:1 | 4.5 |
| Texto sobre zona plana | 15.14:1 | 13.43:1 | 4.5 |
| Link / acento | 5.55:1 | 6.63:1 | 4.5 |
| Rótulo de botão em repouso | 8.58:1 | 9.71:1 | 4.5 |
| Texto sobre acento sólido | 6.70:1 | 8.03:1 | 4.5 |
| Contorno de componente | 3.13:1 | 5.44:1 | 3.0 |
| Badge sucesso | 7.48:1 | 8.12:1 | 4.5 |
| Badge aviso | 7.62:1 | 8.63:1 | 4.5 |
| Badge erro | 6.90:1 | 7.68:1 | 4.5 |
| Badge info | 7.72:1 | 8.31:1 | 4.5 |

**Defeito encontrado e corrigido na renderização:** o botão primário aparecia **sem texto**. O gradiente estava num `::before` com `z-index`, e um `<button class="neo-btn">Salvar</button>` sem `<span>` interno tem só um nó de texto — que não recebe `z-index` e ficava debaixo do gradiente. Trocado por `background-image` no próprio elemento. É a origem da regra de botão do prompt.

---

## 3b. Cor semântica sobre relevo

Sobre superfície neumórfica não existe fundo colorido: o fundo **precisa** ser igual ao da superfície, senão o relevo desaparece. A cor semântica vai então na fonte.

Medi as quatro cores contra o fundo esculpido:

| Estado | Cor da fonte | Claro | Escuro |
|---|---|---|---|
| Aprovado | `--ok-fg` | 7.45:1 | 9.02:1 |
| Pendente | `--aviso-fg` | 7.44:1 | 9.29:1 |
| Reprovado | `--erro-fg` | 7.55:1 | 7.41:1 |
| Em análise | `--info-fg` | 8.03:1 | 8.10:1 |

Todas com folga sobre os 4.5:1. **Mas há um segundo problema, e ele não aparece nessa tabela:** as quatro cores têm luminância praticamente igual entre si.

| Par | Contraste entre as duas |
|---|---|
| Aprovado × Pendente | 1.00:1 |
| Aprovado × Reprovado | 1.01:1 |
| Pendente × Reprovado | 1.02:1 |
| Aprovado × Em análise | 1.08:1 |

Contraste 1.00:1 entre duas cores significa que, retirado o matiz, elas são **o mesmo cinza**. Simulei deuteranopia (a forma mais comum de daltonismo, cerca de 8% dos homens) sobre a renderização: sem glifo, "Pendente" e "Reprovado" ficam indistinguíveis. Com o glifo, a leitura é imediata mesmo sem enxergar cor alguma.

Por isso `.neo-sit` traz sempre um símbolo:

| Estado | Glifo | Classe |
|---|---|---|
| Aprovado | ✓ | `.neo-sit--ok` |
| Pendente | ◐ | `.neo-sit--aviso` |
| Reprovado | ✕ | `.neo-sit--erro` |
| Em análise | ◔ | `.neo-sit--info` |

O glifo não é decoração. É o segundo canal que a WCAG 1.4.1 exige — a norma diz que cor não pode ser o único meio de transmitir informação. Removê-lo devolve o problema.

A mesma lógica se aplica em toda parte onde essas cores mudam: `.neo-alerta--relevo` e `.neo-badge` também carregam o glifo.

### A pastilha se adapta à superfície

Relevo neumórfico só existe quando o elemento tem **a mesma cor do que está atrás dele**. Como a `.neo-sit` vive tanto sobre o cartão quanto dentro da zona plana — que são cores diferentes — o CSS troca o par automaticamente:

| Onde está | Fundo | Sombra |
|---|---|---|
| Sobre o cartão | `--neo-bg` | `--relevo-1` |
| Dentro de `.neo-flat` | `--neo-flat` | `--relevo-plano` |

Consequência prática: **a zebra da tabela passou a ser opt-in** (`.neo-tabela--zebra`). Com linhas listradas a pastilha cairia ora sobre `--neo-flat`, ora sobre `--neo-flat-alt`, e uma das duas ficaria com a cor errada. Em tabela larga onde a zebra ajuda a varrer, troque `.neo-sit` por `.neo-badge`, que tem fundo tingido próprio e não depende da superfície.

O texto semântico continua conforme em qualquer um dos fundos: 8.30 a 8.96:1 sobre `--neo-flat` no tema claro, 8.32 a 10.44:1 no escuro.

---

## 4. Tokens

```css
/* =====================================================================
   NEO — sistema de design neumórfico com escopo
   Tema claro por padrão; escuro por preferência do SO ou [data-tema="escuro"]
   ===================================================================== */

:root{
  /* superfície esculpida */
  --neo-bg:#e6eaf0;
  --neo-light:#ffffff;
  --neo-dark:#b4bdcb;
  --neo-edge:#7b8493;

  /* superfície plana — conteúdo denso DENTRO do cartão */
  --neo-flat:#f4f6fa;
  --neo-flat-alt:#eaeef4;
  --neo-line:#ccd3de;
  --flat-light:#ffffff;   /* relevo dentro da zona plana */
  --flat-dark:#c9d1de;

  /* texto */
  --text:#16202f;
  --text-muted:#4a5568;
  --text-disabled:#6b7280;

  /* ação */
  --primary:#1d4ed8;
  --primary-soft:#2563eb;
  --primary-dark:#1e3a8a;
  --on-accent:#ffffff;

  /* estados semânticos: par superfície + texto */
  --ok-bg:#d7f0e2;      --ok-fg:#0d5433;   --ok-solid:#146c43;
  --aviso-bg:#fdeacb;   --aviso-fg:#6b3f04; --aviso-solid:#8a5a06;
  --erro-bg:#f8d9d6;    --erro-fg:#8c1d16; --erro-solid:#b3261e;
  --info-bg:#dbe6fb;    --info-fg:#17408f; --info-solid:#1d4ed8;

  /* forma e tempo */
  --r-lg:26px; --r-md:14px; --r-sm:9px;
  --dur:.28s; --dur-lento:.42s;
  --ease:cubic-bezier(.22,.61,.36,1);

  /* relevo — 3 níveis, nunca invente um quarto */
  --relevo-1:5px 5px 10px var(--neo-dark), -5px -5px 10px var(--neo-light);
  --relevo-2:9px 9px 18px var(--neo-dark), -9px -9px 18px var(--neo-light);
  --relevo-3:14px 14px 28px var(--neo-dark), -14px -14px 28px var(--neo-light);
  --afundado:inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light);
  --afundado-leve:inset 2px 2px 5px var(--neo-dark), inset -2px -2px 5px var(--neo-light);
  --relevo-plano:3px 3px 6px var(--flat-dark), -3px -3px 6px var(--flat-light);
}

@media (prefers-color-scheme:dark){
  :root:not([data-tema="claro"]){
    --neo-bg:#272c34;
    --neo-light:#353b45;
    --neo-dark:#1a1e24;
    --neo-edge:#98a2b1;

    --neo-flat:#1f232a;
    --neo-flat-alt:#232830;
    --neo-line:#3d4450;
    --flat-light:#2b313a;
    --flat-dark:#14171c;

    --text:#e9edf4;
    --text-muted:#aab4c3;
    --text-disabled:#8d97a6;

    --primary:#8cb3f8;
    --primary-soft:#a6c6fa;
    --primary-dark:#c2d8fc;
    --on-accent:#0d1b3a;

    --ok-bg:#123a28;      --ok-fg:#8fe0b4;   --ok-solid:#6fd6a1;
    --aviso-bg:#3d2f0d;   --aviso-fg:#f2ce7e; --aviso-solid:#e8bd5c;
    --erro-bg:#40201d;    --erro-fg:#f5a9a2; --erro-solid:#ef8e85;
    --info-bg:#16294d;    --info-fg:#a8c6fa; --info-solid:#8cb3f8;
  }
}
[data-tema="escuro"]{
  --neo-bg:#272c34;  --neo-light:#353b45; --neo-dark:#1a1e24; --neo-edge:#98a2b1;
  --neo-flat:#1f232a; --neo-flat-alt:#232830; --neo-line:#3d4450;
  --flat-light:#2b313a; --flat-dark:#14171c;
  --text:#e9edf4; --text-muted:#aab4c3; --text-disabled:#8d97a6;
  --primary:#8cb3f8; --primary-soft:#a6c6fa; --primary-dark:#c2d8fc; --on-accent:#0d1b3a;
  --ok-bg:#123a28; --ok-fg:#8fe0b4; --ok-solid:#6fd6a1;
  --aviso-bg:#3d2f0d; --aviso-fg:#f2ce7e; --aviso-solid:#e8bd5c;
  --erro-bg:#40201d; --erro-fg:#f5a9a2; --erro-solid:#ef8e85;
  --info-bg:#16294d; --info-fg:#a8c6fa; --info-solid:#8cb3f8;
}
```

---

## 5. Componentes

```css
/* ===================== BASE ===================== */
*{box-sizing:border-box}
body{
  margin:0;background:var(--neo-bg);color:var(--text);
  font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;
  font-size:15px;line-height:1.55;
}
:where(a){color:var(--primary)}
:where(button,input,select,textarea){font:inherit}
:focus-visible{outline:3px solid var(--primary);outline-offset:3px;border-radius:4px}

/* ===================== 1. SUPERFÍCIES ===================== */
.neo-card{background:var(--neo-bg);border-radius:var(--r-lg);padding:24px;box-shadow:var(--relevo-3)}
.neo-panel{background:var(--neo-bg);border-radius:var(--r-md);padding:18px;box-shadow:var(--relevo-1)}
.neo-inset{background:var(--neo-bg);border-radius:var(--r-md);padding:16px;box-shadow:var(--afundado)}

/* zona plana: TODO conteúdo denso vive aqui dentro */
.neo-flat{
  background:var(--neo-flat);border-radius:var(--r-md);
  box-shadow:var(--afundado-leve);overflow:hidden;
}

/* ===================== 2. BOTÕES ===================== */
/* Sem pseudo-elemento sobreposto: um <button class="neo-btn">Texto</button> cru
   sempre mostra o texto. Overlay com z-index cobre nós de texto puro. */
.neo-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  min-height:44px;padding:0 20px;
  border:1px solid var(--neo-edge);border-radius:var(--r-md);
  background-color:var(--neo-bg);background-image:none;
  color:var(--primary-dark);font-weight:600;letter-spacing:.02em;cursor:pointer;
  box-shadow:var(--relevo-1);
  transition:color var(--dur) var(--ease),background-color var(--dur) var(--ease),
             box-shadow var(--dur) var(--ease),border-color var(--dur) var(--ease);
}
.neo-btn:hover:not(:disabled){
  color:var(--on-accent);border-color:transparent;
  background-image:linear-gradient(135deg,var(--primary-soft),var(--primary) 55%,var(--primary-dark));
  box-shadow:0 8px 22px rgba(29,78,216,.4);
}
.neo-btn:active:not(:disabled){box-shadow:var(--afundado)}
.neo-btn:disabled{
  cursor:not-allowed;color:var(--text-disabled);background-image:none;
  border-style:dashed;box-shadow:var(--afundado-leve);
}
.neo-btn--primario{
  color:var(--on-accent);border-color:transparent;
  background-image:linear-gradient(135deg,var(--primary-soft),var(--primary) 55%,var(--primary-dark));
}
.neo-btn--primario:hover:not(:disabled){box-shadow:0 10px 26px rgba(29,78,216,.5)}
.neo-btn--perigo{
  color:var(--on-accent);border-color:transparent;
  background-image:linear-gradient(135deg,var(--erro-solid),var(--erro-fg));
}
.neo-btn--perigo:hover:not(:disabled){
  background-image:linear-gradient(135deg,var(--erro-solid),var(--erro-fg));
  box-shadow:0 8px 22px rgba(179,38,30,.42);
}
.neo-btn--fantasma{box-shadow:none;background-color:transparent;border-color:transparent;color:var(--primary)}
.neo-btn--fantasma:hover:not(:disabled){
  box-shadow:var(--relevo-1);background-color:var(--neo-bg);background-image:none;
  color:var(--primary);border-color:var(--neo-edge);
}
.neo-icon-btn{
  width:44px;height:44px;padding:0;display:inline-grid;place-items:center;
  border:1px solid var(--neo-edge);border-radius:50%;background:var(--neo-bg);color:var(--text-muted);
  cursor:pointer;box-shadow:var(--relevo-1);transition:color var(--dur) var(--ease),box-shadow var(--dur) var(--ease);
}
.neo-icon-btn:hover{color:var(--primary)}
.neo-icon-btn:active{box-shadow:var(--afundado)}

/* ===================== 3. CAMPOS ===================== */
.neo-field{margin-bottom:20px}
.neo-control{position:relative}
.neo-field :is(input,textarea,select){
  width:100%;min-height:52px;padding:20px 16px 6px;
  color:var(--text);background:var(--neo-bg);
  border:1px solid var(--neo-edge);border-radius:var(--r-md);
  box-shadow:var(--afundado);outline:none;
  transition:border-color var(--dur) var(--ease);
}
.neo-field textarea{min-height:104px;padding-top:24px;resize:vertical}
.neo-field :is(input,textarea)::placeholder{color:transparent}
.neo-field label{
  position:absolute;left:16px;top:16px;color:var(--text-muted);
  pointer-events:none;transform-origin:left top;
  transition:transform var(--dur) var(--ease),color var(--dur) var(--ease);
}
.neo-field :is(input,textarea):focus + label,
.neo-field :is(input,textarea):not(:placeholder-shown) + label,
.neo-field select + label{transform:translateY(-11px) scale(.74);color:var(--primary);font-weight:600}
.neo-field :is(input,textarea,select):focus{border-color:var(--primary-soft)}
.neo-control::after{
  content:"";position:absolute;left:14px;right:14px;bottom:5px;height:2px;
  background:var(--primary);border-radius:2px;
  transform:scaleX(0);transform-origin:left;transition:transform var(--dur) var(--ease);
}
.neo-control:focus-within::after{transform:scaleX(1)}
.neo-msg{display:block;margin:6px 0 0 4px;font-size:.8rem;font-weight:600;color:var(--erro-fg);
  opacity:0;transform:translateY(-4px);transition:opacity var(--dur) var(--ease),transform var(--dur) var(--ease)}
.neo-field.is-invalid :is(input,textarea,select){border-color:var(--erro-solid);border-width:2px}
.neo-field.is-invalid label,
.neo-field.is-invalid :is(input,textarea):not(:placeholder-shown) + label{color:var(--erro-fg)}
.neo-field.is-invalid .neo-control::after{background:var(--erro-solid);transform:scaleX(1)}
.neo-field.is-invalid .neo-msg{opacity:1;transform:none}

/* autopreenchimento do Chrome */
.neo-field input:-webkit-autofill,
.neo-field input:-webkit-autofill:hover,
.neo-field input:-webkit-autofill:focus{
  -webkit-text-fill-color:var(--text);
  -webkit-box-shadow:0 0 0 1000px var(--neo-bg) inset, var(--afundado);
  transition:background-color 9999s ease-out;
}
.neo-field input:-webkit-autofill + label{transform:translateY(-11px) scale(.74);color:var(--primary);font-weight:600}

/* ===================== 4. SELEÇÃO ===================== */
.neo-check{display:inline-flex;align-items:center;gap:9px;cursor:pointer;color:var(--text)}
.neo-check input{width:19px;height:19px;accent-color:var(--primary);cursor:pointer}
.neo-switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer}
.neo-switch input{position:absolute;opacity:0;pointer-events:none}
.neo-switch i{
  width:48px;height:27px;border-radius:14px;background:var(--neo-bg);
  border:1px solid var(--neo-edge);box-shadow:var(--afundado-leve);
  position:relative;transition:border-color var(--dur) var(--ease);
}
.neo-switch i::after{
  content:"";position:absolute;left:3px;top:2px;width:20px;height:20px;border-radius:50%;
  background:var(--neo-bg);border:1px solid var(--neo-edge);box-shadow:var(--relevo-1);
  transition:transform var(--dur) var(--ease),background var(--dur) var(--ease);
}
.neo-switch input:checked + i{border-color:var(--primary)}
.neo-switch input:checked + i::after{transform:translateX(21px);background:var(--primary);border-color:var(--primary)}
.neo-switch input:focus-visible + i{outline:3px solid var(--primary);outline-offset:3px}

/* ===================== 5. NAVEGAÇÃO ===================== */
.neo-nav{
  display:flex;align-items:center;gap:6px;padding:10px 14px;
  background:var(--neo-bg);border-radius:var(--r-md);box-shadow:var(--relevo-2);
}
.neo-nav a{
  padding:9px 15px;border-radius:var(--r-sm);color:var(--text-muted);
  text-decoration:none;font-weight:600;transition:box-shadow var(--dur) var(--ease),color var(--dur) var(--ease);
}
.neo-nav a:hover{color:var(--text);box-shadow:var(--relevo-1)}
.neo-nav a[aria-current="page"]{
  color:var(--primary);box-shadow:var(--afundado);
  /* estado ativo NÃO depende só de cor: ganha relevo invertido + sublinhado */
  text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:2px;
}
.neo-tabs{display:flex;gap:8px;padding:6px;background:var(--neo-bg);border-radius:var(--r-md);box-shadow:var(--afundado-leve)}
.neo-tabs button{
  flex:1;min-height:40px;border:0;border-radius:var(--r-sm);background:transparent;
  color:var(--text-muted);font-weight:600;cursor:pointer;transition:all var(--dur) var(--ease);
}
.neo-tabs button[aria-selected="true"]{background:var(--neo-bg);color:var(--primary);box-shadow:var(--relevo-1)}

/* ===================== 6. FEEDBACK ===================== */
.neo-alerta{
  display:flex;gap:12px;align-items:flex-start;padding:14px 16px;
  border-radius:var(--r-md);border-left:4px solid;font-size:.92rem;
}
.neo-alerta--ok{background:var(--ok-bg);color:var(--ok-fg);border-color:var(--ok-solid)}
.neo-alerta--aviso{background:var(--aviso-bg);color:var(--aviso-fg);border-color:var(--aviso-solid)}
.neo-alerta--erro{background:var(--erro-bg);color:var(--erro-fg);border-color:var(--erro-solid)}
.neo-alerta--info{background:var(--info-bg);color:var(--info-fg);border-color:var(--info-solid)}

.neo-badge{
  display:inline-block;padding:3px 10px;border-radius:20px;
  font-size:.76rem;font-weight:700;letter-spacing:.02em;
}
.neo-badge--ok{background:var(--ok-bg);color:var(--ok-fg)}
.neo-badge--aviso{background:var(--aviso-bg);color:var(--aviso-fg)}
.neo-badge--erro{background:var(--erro-bg);color:var(--erro-fg)}
.neo-badge--info{background:var(--info-bg);color:var(--info-fg)}

.neo-progresso{height:12px;border-radius:8px;background:var(--neo-bg);box-shadow:var(--afundado-leve);overflow:hidden}
.neo-progresso>i{display:block;height:100%;border-radius:8px;
  background:linear-gradient(90deg,var(--primary-soft),var(--primary));transition:width var(--dur-lento) var(--ease)}

.neo-skeleton{border-radius:var(--r-sm);background:var(--neo-bg);box-shadow:var(--afundado-leve);
  animation:neoPulsa 1.5s var(--ease) infinite alternate}
@keyframes neoPulsa{to{opacity:.55}}


/* ===================== 6b. SITUAÇÃO EM RELEVO ======================
   Estado semântico sobre superfície esculpida: a COR vai na fonte, não no
   fundo (o fundo tem de ser igual ao da superfície para o relevo existir).
   As 4 cores passam de 7.4:1 sobre o fundo, mas têm luminância quase
   idêntica entre si (1.00 a 1.08:1) — em deuteranopia "Pendente" e
   "Reprovado" viram a mesma cor. Por isso o GLIFO não é enfeite: é o
   segundo canal exigido pela WCAG 1.4.1. Não remova.
   ================================================================== */
.neo-sit{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 13px;border-radius:20px;
  font-size:.78rem;font-weight:700;letter-spacing:.01em;
  background:var(--neo-bg);box-shadow:var(--relevo-1);
}
.neo-sit::before{font-size:.82rem;line-height:1;font-weight:900}
.neo-sit--ok{color:var(--ok-fg)}        .neo-sit--ok::before{content:"\2713"}
.neo-sit--aviso{color:var(--aviso-fg)}  .neo-sit--aviso::before{content:"\25D0"}
.neo-sit--erro{color:var(--erro-fg)}    .neo-sit--erro::before{content:"\2715"}
.neo-sit--info{color:var(--info-fg)}    .neo-sit--info::before{content:"\25D4"}
/* variante afundada, para quando a linha inteira já está em relevo */
.neo-sit--afundado{box-shadow:var(--afundado-leve)}
/* dentro da zona plana o relevo tem de usar a COR DA ZONA, senão a pastilha
   aparece como um retângulo de cor errada em vez de parecer esculpida */
.neo-flat .neo-sit,
.neo-prosa .neo-sit{background:var(--neo-flat);box-shadow:var(--relevo-plano)}

/* alerta em relevo: mesma lógica — cor na fonte, glifo obrigatório,
   barra lateral colorida como terceiro reforço */
.neo-alerta--relevo{
  background:var(--neo-bg);box-shadow:var(--relevo-1);
  border-left:4px solid;
}
.neo-alerta--relevo::before{font-size:1.05rem;font-weight:900;line-height:1.3}
.neo-alerta--relevo.neo-alerta--ok{color:var(--ok-fg);border-color:var(--ok-solid)}
.neo-alerta--relevo.neo-alerta--ok::before{content:"\2713"}
.neo-alerta--relevo.neo-alerta--aviso{color:var(--aviso-fg);border-color:var(--aviso-solid)}
.neo-alerta--relevo.neo-alerta--aviso::before{content:"\25D0"}
.neo-alerta--relevo.neo-alerta--erro{color:var(--erro-fg);border-color:var(--erro-solid)}
.neo-alerta--relevo.neo-alerta--erro::before{content:"\2715"}
.neo-alerta--relevo.neo-alerta--info{color:var(--info-fg);border-color:var(--info-solid)}
.neo-alerta--relevo.neo-alerta--info::before{content:"\25D4"}

/* badge plano também ganha glifo — mesma razão de luminância */
.neo-badge::before{margin-right:5px;font-weight:900}
.neo-badge--ok::before{content:"\2713"}
.neo-badge--aviso::before{content:"\25D0"}
.neo-badge--erro::before{content:"\2715"}
.neo-badge--info::before{content:"\25D4"}

/* tabela em relevo — linhas esculpidas.
   Custa +17% de altura e mais repintura: use até ~15 linhas.
   Acima disso, .neo-tabela dentro de .neo-flat. */
.neo-tabela--relevo{border-collapse:separate;border-spacing:0 9px;background:transparent}
.neo-tabela--relevo th{background:transparent;border:0;padding:0 14px 4px}
.neo-tabela--relevo td{
  background:var(--neo-bg);border:0;padding:11px 14px;
  box-shadow:var(--afundado-leve);
}
.neo-tabela--relevo td:first-child{border-radius:10px 0 0 10px}
.neo-tabela--relevo td:last-child{border-radius:0 10px 10px 0}
.neo-tabela--relevo tbody tr:nth-child(even) td{background:var(--neo-bg)}
.neo-tabela--relevo tbody tr:hover td{box-shadow:var(--afundado)}

/* ===================== 7. DADOS DENSOS — SEMPRE PLANO ===================== */
.neo-tabela{width:100%;border-collapse:collapse;background:var(--neo-flat);font-size:.92rem}
.neo-tabela th{
  text-align:left;padding:11px 14px;font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;
  color:var(--text-muted);background:var(--neo-flat-alt);border-bottom:1px solid var(--neo-line);
}
.neo-tabela td{padding:11px 14px;border-bottom:1px solid var(--neo-line)}
.neo-tabela tbody tr:last-child td{border-bottom:0}
/* zebra é OPT-IN: com listras a pastilha em relevo cai sobre duas cores
   diferentes. Em tabela larga, ligue a zebra e use .neo-badge (plano). */
.neo-tabela--zebra tbody tr:nth-child(even){background:var(--neo-flat-alt)}
.neo-tabela tbody tr:hover{background:var(--info-bg)}

.neo-lista{list-style:none;margin:0;padding:0;background:var(--neo-flat)}
.neo-lista li{padding:12px 14px;border-bottom:1px solid var(--neo-line)}
.neo-lista li:last-child{border-bottom:0}

/* ===================== 8. SOBREPOSIÇÃO ===================== */
.neo-modal{border:0;padding:0;background:transparent;max-width:min(520px,92vw)}
.neo-modal::backdrop{background:rgba(12,18,28,.55);backdrop-filter:blur(3px)}
.neo-modal>div{background:var(--neo-bg);border-radius:var(--r-lg);padding:26px;box-shadow:var(--relevo-3)}

/* ===================== 9. TIPOGRAFIA E TEXTO LONGO ===================== */
/* Texto corrido NÃO fica sobre superfície texturizada: usa zona plana e largura de leitura */
.neo-prosa{max-width:68ch;background:var(--neo-flat);border-radius:var(--r-md);padding:26px 30px;box-shadow:var(--afundado-leve)}
.neo-prosa :is(h1,h2,h3){line-height:1.25;letter-spacing:-.015em}
.neo-prosa p{margin:0 0 1em}

/* ===================== ACESSIBILIDADE ===================== */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms !important;animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
  }
}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* Alto contraste do SO: o relevo some, a borda assume */
@media (forced-colors:active){
  .neo-card,.neo-panel,.neo-btn,.neo-icon-btn,.neo-field :is(input,textarea,select){
    box-shadow:none;border:1px solid CanvasText;
  }
}
```

---

## 6. Contrato de HTML

O CSS espera estas estruturas. Fora delas, não há garantia.

### Superfícies

```html
<section class="neo-card">…</section>     <!-- moldura principal, relevo-3 -->
<div class="neo-panel">…</div>            <!-- bloco interno, relevo-1 -->
<div class="neo-inset">…</div>            <!-- área afundada -->
<div class="neo-flat">…</div>             <!-- OBRIGATÓRIO em volta de conteúdo denso -->
```

### Botões

```html
<button class="neo-btn neo-btn--primario">Salvar</button>
<button class="neo-btn">Cancelar</button>
<button class="neo-btn neo-btn--fantasma">Ver mais</button>
<button class="neo-btn neo-btn--perigo">Excluir</button>
<button class="neo-btn" disabled>Indisponível</button>
<button class="neo-icon-btn" aria-label="Configurações">⚙</button>
```

### Campo com rótulo flutuante

O `placeholder=" "` (com um espaço) é obrigatório — é ele que sustenta o efeito. O `<label>` vem **depois** do input, porque a regra usa o combinador irmão `+`.

```html
<div class="neo-field">                      <!-- + class="is-invalid" quando houver erro -->
  <div class="neo-control">
    <input id="lote" placeholder=" " aria-describedby="err-lote">
    <label for="lote">Lote</label>
  </div>
  <span class="neo-msg" id="err-lote" role="alert">Lote deve ter 6 caracteres.</span>
</div>
```

### Seleção

```html
<label class="neo-check"><input type="checkbox"> Ativo</label>
<label class="neo-switch"><input type="checkbox"><i></i><span>Notificar</span></label>
```

### Navegação e abas

```html
<nav class="neo-nav" aria-label="Principal">
  <a href="/painel" aria-current="page">Painel</a>
  <a href="/produtos">Produtos</a>
</nav>

<div class="neo-tabs" role="tablist">
  <button role="tab" aria-selected="true">Resumo</button>
  <button role="tab" aria-selected="false">Ensaios</button>
</div>
```

`aria-current="page"` e `aria-selected` **não são decoração** — o CSS lê esses atributos para pintar o estado ativo. Sem eles, nada acontece.

### Feedback

```html
<div class="neo-alerta neo-alerta--ok"><strong>Aprovado.</strong> Lote liberado.</div>
<span class="neo-badge neo-badge--erro">Reprovado</span>
<div class="neo-progresso"><i style="width:68%"></i></div>
```

Variantes disponíveis em alerta e badge: `--ok`, `--aviso`, `--erro`, `--info`.

### Situação sobre relevo

```html
<span class="neo-sit neo-sit--ok">Aprovado</span>
<span class="neo-sit neo-sit--aviso">Pendente</span>
<span class="neo-sit neo-sit--erro">Reprovado</span>
<span class="neo-sit neo-sit--info">Em análise</span>

<div class="neo-alerta neo-alerta--relevo neo-alerta--erro">
  <span><strong>Reprovado.</strong> pH fora da faixa.</span>
</div>
```

O glifo entra por `::before` — não escreva o símbolo no HTML, senão ele duplica.

A mesma marcação funciona sobre o cartão e dentro de `.neo-flat`: o CSS ajusta fundo e sombra ao contexto. Não sobrescreva o `background` da `.neo-sit`.

### Tabela em relevo

Linhas esculpidas, para tabelas curtas. Fica **direto no cartão**, sem `.neo-flat` em volta — o relevo precisa da cor de fundo do cartão.

```html
<table class="neo-tabela neo-tabela--relevo">…</table>
```

Custa +17% de altura e mais repintura. Regra prática: **até ~15 linhas** use relevo; acima disso, `.neo-tabela` dentro de `.neo-flat` — que é o padrão do sistema.

### Zebra (opt-in)

```html
<table class="neo-tabela neo-tabela--zebra">…</table>
```

Ligue só em tabela larga, e nela use `.neo-badge` em vez de `.neo-sit` — pastilha em relevo sobre linhas de duas cores fica com uma das duas errada.

### Dados densos

```html
<div class="neo-flat">
  <table class="neo-tabela">…</table>
</div>

<div class="neo-flat">
  <ul class="neo-lista"><li>…</li></ul>
</div>

<article class="neo-prosa">…</article>   <!-- texto longo: já é plano e limitado a 68ch -->
```

### Tema

Claro por padrão. Escuro automático pela preferência do sistema. Para alternar manualmente:

```js
document.documentElement.dataset.tema = 'escuro';  // ou 'claro'
```

---

## 7. Adaptando ao seu stack

### HTML puro / WordPress / PHP

Coloque `neo.css` antes do CSS do tema e adicione as classes ao markup. Em WordPress, enfileire com prioridade alta:

```php
add_action('wp_enqueue_scripts', function () {
  wp_enqueue_style('neo', get_stylesheet_directory_uri() . '/neo.css', [], '1.0');
}, 5);
```

### React / Next.js

Importe uma vez no layout raiz. As classes funcionam como quaisquer outras:

```jsx
import './neo.css';

export function Botao({ variante = '', children, ...props }) {
  return <button className={`neo-btn ${variante && `neo-btn--${variante}`}`} {...props}>{children}</button>;
}
```

### Tailwind

Mantenha os componentes em CSS e use Tailwind só para layout. Os efeitos deste sistema dependem de `box-shadow` de duas camadas, pseudo-elementos e `:not(:placeholder-shown)` — em classes utilitárias isso vira uma linha ilegível de 300 caracteres. Exponha os tokens ao Tailwind e pare por aí:

```js
// tailwind.config.js
theme: { extend: { colors: {
  neo:     'var(--neo-bg)',
  texto:   'var(--text)',
  acento:  'var(--primary)',
}}}
```

### Vue / Svelte / Angular

Importe o CSS globalmente. Se usar estilos com escopo de componente, marque como global (`:global()` no Svelte, `::ng-deep` ou `encapsulation: None` no Angular), senão o seletor não alcança.

---

## 8. Portões de qualidade

Rode antes de considerar a aplicação concluída.

**Automatizável** — cole no console do navegador:

```js
(() => {
  const p = [];
  /* conta LINHAS em tabela e ITENS em lista — table.children são thead/tbody */
  const densidade = el => el.tagName === 'TABLE' ? el.rows.length : el.children.length;

  // 1. conteúdo denso fora de zona plana
  document.querySelectorAll('table, ul, ol').forEach(el => {
    if (el.closest('.neo-nav, .neo-tabs')) return;          // navegação não é conteúdo denso
    if (densidade(el) > 5 && !el.closest('.neo-flat, .neo-prosa'))
      p.push(['Conteúdo denso sem .neo-flat', el]);
  });
  // 2. relevo aplicado dentro de zona plana (o erro inverso)
  document.querySelectorAll('.neo-flat :is(td, th, li)').forEach(el => {
    if (getComputedStyle(el).boxShadow !== 'none')
      p.push(['Relevo dentro de zona plana', el]);
  });
  // 3. campo sem rótulo associado
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
    if (!(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')))
      p.push(['Campo sem rótulo', el]);
  });
  // 4. rótulo flutuante sem o placeholder de espaço
  document.querySelectorAll('.neo-field input, .neo-field textarea').forEach(el => {
    if (el.getAttribute('placeholder') !== ' ') p.push(['Falta placeholder=" "', el]);
  });
  // 5. botão sem nome acessível
  document.querySelectorAll('button').forEach(el => {
    if (!el.textContent.trim() && !el.getAttribute('aria-label')) p.push(['Botão sem nome', el]);
  });
  // 6. cor hexadecimal solta em style inline
  document.querySelectorAll('[style]').forEach(el => {
    if (/#[0-9a-f]{3,6}\b/i.test(el.getAttribute('style'))) p.push(['Cor fora dos tokens', el]);
  });

  console.log(p.length ? p : '✓ nenhum problema encontrado');
  return p.length;
})();
```

**Manual**

- [ ] Navegar o site inteiro **só com o teclado**, do primeiro ao último elemento
- [ ] Foco visível em todos os interativos, inclusive dentro de zona plana
- [ ] Alternar para o tema escuro e repetir a leitura de cada tela
- [ ] Ligar "reduzir movimento" no sistema e confirmar que nada quebra
- [ ] Zoom de 200% no navegador sem rolagem horizontal
- [ ] Testar autopreenchimento do Chrome nos formulários
- [ ] Abrir em 360px de largura
- [ ] Modo de alto contraste do Windows: o relevo some, as bordas assumem

---

## 9. Limites honestos deste sistema

Coisas que você deve saber antes de comprometer o site inteiro:

**O estilo tem data.** Neumorfismo teve seu auge por volta de 2020 e é reconhecível como daquele período. Se o site precisa parecer atemporal, considere usar o relevo só na área de autenticação e em cartões de destaque.

**Custo de GPU.** Cada superfície com relevo carrega duas sombras. Em página com 60+ elementos elevados, a repintura em scroll pesa em máquina fraca e em celular antigo. Se notar travamento, o primeiro corte é reduzir `--relevo-3` a uma sombra só.

**Imagens não combinam.** Fotos com fundo branco recortado ficam estranhas sobre superfície cinza texturizada. Use `border-radius` e um `box-shadow` afundado ao redor da imagem, ou coloque-as em zona plana.

**Não testei autopreenchimento real.** A correção de `-webkit-autofill` está no CSS pela receita padrão, mas ambiente automatizado não dispara autofill de verdade. É o único item deste documento sem verificação empírica — teste no seu navegador.

**Reverter é barato.** Se depois quiser um visual plano, troque `--neo-light` e `--neo-dark` por cores próximas do fundo e as declarações de `--relevo-*` por `0 1px 3px rgba(0,0,0,.1)`. Toda a estrutura, acessibilidade e semântica continuam valendo. É por isso que o sistema é feito de tokens e não de valores soltos.
