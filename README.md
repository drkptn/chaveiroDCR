# Chaveiro DCR — landing page

Site do **Chaveiro DCR**: chaves, fechaduras e soluções de segurança.
Direção de arte **Liquid Chrome Industrial Futurism**: cromo, latão e luz ciano sobre uma "prancha técnica".

> Stack: **Next.js 16 (export estático) · React 19 · TypeScript · CSS Modules · GSAP + ScrollTrigger + SplitText · Three.js / React Three Fiber / Drei · GLSL**
> Sem preloader: a página abre direto; o 3D entra por cima de um poster quando fica pronto.

---

## 1. Antes de publicar: preencha os dados reais

Tudo que é informação comercial fica em **`src/config/`**. Nada foi inventado:
campo vazio = não aparece (ou aparece como "a definir").

| Arquivo | O que editar |
|---|---|
| `src/config/site.ts` | **WhatsApp**, telefone, região/endereço, horários, Instagram, URL do site |
| `src/config/services.ts` | Serviços: `ativo`, `consultar` (mostra "sob consulta") ou `oculto`. Categoria inteira: `enabled: false` |
| `src/config/content.ts` | Textos do hero, processo, diferenciais, peças do cilindro, **foto e nome do profissional**, **fotos da galeria** |
| `src/config/keys.ts` | Catálogo técnico "O universo das chaves" (referência, não lista de serviços) |

### WhatsApp
Em `site.ts`, `contact.whatsapp: "5511999998888"` (DDI + DDD + número, só dígitos).
Sem número configurado, o botão abre o WhatsApp com a mensagem pronta para o cliente escolher o contato.

### Foto do profissional
1. Coloque a foto em `public/fotos/profissional/` (ex.: `pai.webp`, retrato 4:5).
2. Em `content.ts`: `about.photo = "/fotos/profissional/pai.webp"` e, se quiser, `about.name`.

### Galeria (fotos reais)
1. Coloque as fotos em `public/fotos/galeria/`.
2. Liste em `galleryPhotos` (`content.ts`) com `src`, `alt` e `caption`.
Enquanto a lista estiver vazia, a galeria mostra **ilustrações 3D identificadas como tal** — nunca fotos falsas.

---

## 2. Rodar e publicar

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # gera o site estático em /out
```

Publicar em subpasta (ex.: GitHub Pages em `/chaveiroDCR`):

```bash
NEXT_PUBLIC_BASE_PATH=/chaveiroDCR npm run build
```

A pasta `out/` pode ir para qualquer hospedagem estática (Vercel, Netlify, Cloudflare Pages, GitHub Pages…).

---

## 3. Estúdio 3D (renders)

Os objetos 3D são **procedurais** (gerados em código — chaves com cortes reais, cilindro com pinos e molas).
Para os cards de serviço, o site usa "fotos de estúdio" geradas desses modelos (giro 360° em sprite WebP), o que deixa o
celular leve e idêntico ao desktop.

```bash
npm run studio                  # servidor do estúdio (porta 3100, só existe com STUDIO=1)
npm run renders                 # fotografa tudo e gera /public/renders/*.webp, og.jpg e apple-icon.png
npm run renders -- --only=hero  # só um item (copias, automotivas, fechaduras, abertura, seguranca, emblema, hero, og, gal-*)
```

O script usa Playwright (Chromium) + sharp.

---

## 4. Mapa do projeto

```
src/
  app/                 layout (SEO/OG), página, sitemap, robots, manifest, 404
    estudio/           estúdio de renders (page.studio.tsx — fora do build normal)
  config/              ← dados editáveis
  components/
    sections/          Hero · Services · KeyUniverse · Knowledge · Process · Differentials · Gallery · About · Contact
    layout/            Navbar (+ KeyProgress, menu "quadro de chaves") · Footer
    ui/                PressButton · LaserText · Turntable · Screw · SectionMark · Icons
    cursor/            Lamp (cursor-lanterna + luz global)
    effects/           LiquidChrome (metal líquido em GLSL)
    brand/             Logo / símbolo DCR
  three/
    models/            chaves, cilindro europeu, engrenagens, fechaduras, emblema (procedurais)
    scenes/            HeroScene · ExplodedScene · KeyRingScene (+ estados leves compartilhados)
    StudioEnv.tsx      "estúdio fotográfico" de Lightformers que desenha os reflexos no cromo
  lib/                 gsap, hooks, whatsapp, keyhole (máscara do portal), light (lanterna), SEO
tools/capture-renders.mjs
```

## 5. Linguagem visual (para manter a identidade)

- **Prancha técnica**: cada seção é um "Detalhe" com balão de cota (A, B, C…) e "Folha 0X / 09".
- **Chanfro 45° + parafusos Torx** no lugar de cantos arredondados.
- **Cursor = lanterna**: ilumina superfícies metálicas (`--lx/--ly`) e as luzes do estúdio 3D.
- **Gravação a laser** nos títulos (`LaserText`), motion blur horizontal na entrada do hero.
- **A chave do site**: a barra da navbar é uma chave virgem que ganha um corte a cada seção visitada.
- Paleta: cromo `#DCE3E9`, prata `#F3F6F8`, titânio `#A7B1BC`, aço `#727D89`, grafite `#252B33`, preto `#090C11`,
  azul-meia-noite `#101D30`; luz `#00D9FF` / `#79E9FF`; latão (material dos pinos) `#C4A062` → `#5E4B43`.

## Acessibilidade e desempenho

- `prefers-reduced-motion`: sem trilhos presos, sem portal, sem cenas animadas; conteúdo estático completo.
- Navegação por teclado (gavetas, seletor de chaves, dial de contato em `radiogroup`, menu com foco preso, galeria com setas/Esc).
- three.js só é baixado quando uma cena 3D é montada; cenas pausam fora da tela; fallback sem WebGL.
- JSON-LD `Locksmith` só com campos preenchidos.
