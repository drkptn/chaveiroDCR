# Progresso do Vinlancord

Registro do que foi feito em cada etapa, como foi verificado, o que ficou de fora e o que vem depois.

## Status por etapa

| # | Etapa | Status | Como foi verificado |
|---|---|---|---|
| 1 | Arquitetura e estrutura | ✅ | Monorepo npm workspaces; tipos verificados em todos os pacotes (`tsc` sem erros) |
| 2 | Identidade visual e interface | ✅ | Logo/ícone próprios (SVG → PNG/ICO), splash, tela de carregamento, login; capturas reais no navegador e no Electron |
| 3 | Autenticação e banco | ✅ | 8 testes de integração (cadastro, login, duplicidade, sessões/revogação, recuperação e verificação por e-mail, troca de usuário/senha, configurações) |
| 4 | Perfis e amizades | ✅ | 6 testes de integração (pedidos em tempo real, bloqueio, privacidade, DMs, grupos, visibilidade de perfil) + E2E |
| 5 | Servidores, canais e permissões | ✅ | 8 testes (modelos, convites, canal privado, sobrescritas, hierarquia de cargos, ban, castigo, explorar) + 9 testes unitários do cálculo de permissões |
| 6 | Chat em tempo real | ✅ | 8 testes (CRUD, respostas, reações, fixadas, paginação, menções, busca, modo lento, anexos e segurança de arquivos, avatar animado, emojis personalizados, denúncias) + E2E |
| 7 | Chamadas de voz | ✅ | 4 testes de sinalização (entrar/sair, permissões, moderação, retomada após queda, chamada privada) + E2E com **bytes de áudio reais** nos dois sentidos |
| 8 | Chamadas de vídeo | ✅ | E2E: câmera de um usuário chega ao outro (`videoWidth > 0`, bytes de vídeo crescendo) |
| 9 | Tela e áudio | ✅ | E2E: transmissão de tela, “Assistir transmissão”, vídeo ≥ 640 px no espectador; áudio do sistema implementado para Windows (validação manual pendente — ver abaixo) |
| 10 | Notificações e personalização | ✅ | Sons, notificações do sistema, toasts, badge, níveis por servidor/canal e atalhos; **Estúdio de Aparência** (9 estéticas, cores, fontes, formas, fundo animado, transições, CSS) com testes de unidade e E2E de sincronização entre dispositivos |
| 11 | Segurança, otimização e testes | ✅ | 60 testes automatizados; E2E repetido 5× sem falhas após correções de concorrência |
| 12 | Empacotamento | ✅ | Instalador NSIS gerado no Linux (Wine) e **no GitHub Actions em `windows-latest`** (artefato *Vinlancord-Windows*, 122 MB); app Electron testado (E2E desktop) |

### Testes automatizados

```
packages/shared  ·  9 testes  (permissões, snowflake, menções)
apps/server      · 34 testes  (integração com PostgreSQL real, gateway WebSocket e mediasoup)
apps/web         · 21 testes  (Markdown e XSS, atalhos, estéticas, paletas, CSS seguro, emojis, formatação)
e2e              ·  3 testes  (dois usuários com mídia real; personalização sincronizada; app desktop Electron)
```

No **GitHub Actions** (máquinas limpas, independentes deste ambiente) o workflow `Vinlancord` passou: tipos, testes unitários e de integração, build, E2E com dois usuários e geração do instalador num Windows real.

O E2E de dois usuários cobre, em sequência: cadastro → pedido de amizade em tempo real → DM com Markdown e indicador de digitação → criação de servidor → convite → entrada do segundo usuário → menção, reação e imagem → canal de voz com áudio real nos dois sentidos → câmera → compartilhamento de tela → **queda de rede e reconexão sem perder a chamada** → chamada privada com toque e atendimento → persistência após recarregar.

### Bugs encontrados pelos testes e corrigidos

- Corrida no consumo de mídia: produtor anunciado enquanto os transportes ainda eram criados era ignorado (sem áudio de um lado). Agora há fila de pendentes e trava contra consumo duplicado.
- Mensagem recebida pelo gateway durante o carregamento do histórico era sobrescrita pela resposta da API.
- Indicador de digitação descartado logo após enviar uma mensagem.
- Re-renderização infinita causada por seletores que criavam arrays novos a cada chamada (Zustand 5).
- Menções exibidas como “usuário desconhecido” (faltava o provedor de resolução do Markdown).

## Interface (reformulação visual)

A interface ganhou identidade própria, inspirada em estéticas sombrias de anime (gótico, militar, imperial) **sem usar nomes, símbolos ou artes de nenhuma obra** — todos os sigilos, ornamentos e efeitos são desenhados do zero.

- **Motor de aparência** (`apps/web/src/lib/themes.ts`): cada estética define cores, fontes, formas, atmosfera, transições e estilo de mensagens; aplica via variáveis CSS e atributos no `<html>`, sem recarregar.
- **Fundo vivo** (`lib/particles.ts`, `components/Ambience.tsx`): canvas 2D com FPS limitado, pausa com a janela oculta e reduz para 15 FPS sem foco.
- **Governador de desempenho** (`lib/perf.ts`): mede o FPS real; se o PC não der conta, liga o modo leve (sem desfoque de vidro, menos partículas). Pode ser forçado no Estúdio.
- **Sincronização**: a aparência fica em `settings.appearance` (validada pelo servidor) e chega aos outros dispositivos pelo gateway; a imagem de fundo fica só no dispositivo.
- **Segurança do CSS personalizado**: `@import`, `url()` externos, `image-set()` e escapes são removidos — um tema importado não consegue carregar nada da internet.

## Limitações conhecidas (honestas)

- **Instalação em um Windows real ainda não foi feita por mim.** O instalador é gerado com sucesso no `windows-latest` do GitHub Actions e foi inspecionado (executável PE32+ x64, metadados, `app.asar` com 349 arquivos), mas ninguém o executou num PC ainda. **Primeiro teste recomendado: instalar no seu PC** (baixe o artefato *Vinlancord-Windows* da última execução do workflow).
- **Áudio do sistema (Windows)**: usa o *loopback* do Chromium, que captura todo o som do PC. Pedimos `restrictOwnAudio` para excluir o áudio do próprio app, mas o suporte depende da versão do Chromium — use fones ao transmitir com áudio para evitar eco nos espectadores. Captura de áudio de um único aplicativo não está implementada.
- **Imagem Docker** não foi construída aqui (o container não tem daemon Docker); o bundle que ela executa (`apps/server/dist/index.js`) foi testado em modo produção.
- **Assinatura de código**: sem certificado, o SmartScreen avisa na primeira execução.
- **Escala horizontal**: uma instância (com vários workers de mídia) é o modo suportado. Várias instâncias exigem roteamento fixo por canal de voz.
- **Denúncias globais** (de usuários/servidores) ficam no banco (tabela `Report`); só as de mensagens têm tela para os moderadores do servidor. Não há painel administrativo global.
- **Prévias de links** (OpenGraph) não foram implementadas de propósito (evitam SSRF e vazamento de IP); convites e GIFs do GIPHY têm prévia.
- **Supressão de ruído avançada (RNNoise)** não incluída; usa a supressão nativa do Chromium.
- macOS e Linux: empacotamento configurado, não testado.

## Próximos passos sugeridos

1. Instalar o `.exe` no Windows e fazer uma chamada real com amigos fora da sua rede (valida TURN e firewall).
2. Configurar SMTP e `REGISTRATION_CODE`; ativar a atualização automática com um feed HTTPS.
3. Painel administrativo global (denúncias, usuários, servidores).
4. Supressão de ruído com RNNoise (AudioWorklet) e captura de áudio por aplicativo no Windows.
5. Pastas de servidores, threads, mensagens de voz e cliente mobile.

## Nova marca: Além-Mar (antigo Vinlancord)

- Nome e logo novos: o horizonte visto pela brecha de uma muralha rompida, com a luz atravessando
  e o mar escuro embaixo (arte original em `apps/web/src/assets/logo.svg`, igual ao ícone do app).
- Ícones regenerados para Windows (`npm run icons -w @vinlancord/desktop`) e Android (`node icons.mjs`
  em `apps/mobile`, com ícone adaptativo sem bordas); tela de abertura nova.
- Estética padrão "Além-Mar" (azul-marinho, fonte imperial) com o efeito de fundo novo **Maré**
  (ondas em camadas + luzes subindo do mar), disponível também no Estúdio de Aparência.
- Instalador: `Alem-Mar-Setup-<versão>.exe` e `Alem-Mar.apk`. Os nomes antigos (`Vinlancord-Setup.exe`,
  `Vinlancord.apk`) continuam publicados em cada release para os links já enviados funcionarem.
- Compatibilidade mantida de propósito: pasta de dados (`%APPDATA%\Vinlancord`), appId, protocolo
  `vinlancord://` dos convites e nomes internos dos pacotes. Quem atualiza continua na mesma pasta de
  instalação; o atalho "Iniciar com o Windows" é regravado para o executável novo.
