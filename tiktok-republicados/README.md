# Faxina de Republicados

Remove **todos os seus republicados (reposts) do TikTok**, um por um, clicando nos mesmos
botões que você clicaria. Roda dentro da sua própria aba do tiktok.com: não pede senha,
não usa servidor e não manda dados pra ninguém.

> Projeto independente do site do Chaveiro DCR. Fica fora do build do Next e do deploy
> da Vercel (`.vercelignore`).

## Jeitos de usar (no computador, logado no tiktok.com)

| Jeito | Como |
|---|---|
| **Favorito** (mais fácil) | Crie um favorito com o conteúdo de `dist/bookmarklet.txt` como URL (ou arraste o botão da página de instruções). Abra o TikTok e clique nele. |
| **Console** | Copie `dist/faxina-republicados.js`, abra o TikTok, `F12` → Console, digite `allow pasting`, cole e Enter. |
| **Extensão do Chrome** | Descompacte `dist/faxina-republicados-extensao.zip` → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação. |

O painel aparece no canto da página: escolha a velocidade, teste com **Parar depois de 3**
e clique em **Começar**.

## Como funciona

1. Vai pro seu perfil e abre a aba Republicados.
2. Abre o primeiro vídeo e confere se está republicado (botão de republicar ou selo
   "Você republicou"). Sem certeza, pula — nunca republica nada.
3. Desfaz o republicado (botão direto ou menu Compartilhar → "Remover republicação"),
   confirma se o TikTok perguntar e verifica se saiu mesmo.
4. Passa pro próximo pela seta e repete, em rodadas, até a aba Republicados sumir.

Proteções: pausa sozinho em captcha, respiro de 60 s após 2 falhas seguidas, pausa após 5,
no máximo 3 tentativas por vídeo, limite opcional de remoções, botão Parar.

## Se parar de funcionar

O TikTok muda o site de vez em quando. No painel: **Diagnóstico** → **Copiar log**, e mande o
log pra quem for ajustar. Os seletores ficam no objeto `SEL` e os textos (vários idiomas)
nas regex `RE_*` no começo de `src/remover.js`.

## Desenvolvimento

```
src/remover.js        fonte única (favorito, console e extensão usam o mesmo arquivo)
extensao/             extensão MV3 (remover.js é copiado no build)
site/template.html    página de instruções
build.mjs             gera dist/ e extensao/remover.js
test/                 TikTok de mentirinha + testes de ponta a ponta (Playwright)
```

```bash
node build.mjs            # gera tudo
node test/run.mjs         # 4 cenários: menu, botão direto, limite, favorito
node test/extension.mjs   # carrega a extensão de verdade no Chromium
```

Os testes rodam contra um mock que imita a estrutura do TikTok web; eles garantem a lógica
(remove tudo, respeita limite, nunca republica por engano), mas não substituem o teste
no site real.
