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
| 10 | Notificações e personalização | ✅ | Sons, notificações do sistema, toasts, badge, níveis por servidor/canal, temas e atalhos; testes de unidade de atalhos e temas |
| 11 | Segurança, otimização e testes | ✅ | 60 testes automatizados; E2E repetido 5× sem falhas após correções de concorrência |
| 12 | Empacotamento | ✅ | Instalador NSIS gerado (`Vinlancord-Setup-1.0.0.exe`, 122 MB, PE32+ x64 com metadados e ícone); app Electron testado (E2E desktop) |

### Testes automatizados

```
packages/shared  ·  9 testes  (permissões, snowflake, menções)
apps/server      · 34 testes  (integração com PostgreSQL real, gateway WebSocket e mediasoup)
apps/web         · 15 testes  (Markdown e XSS, atalhos, temas, emojis, formatação)
e2e              ·  2 testes  (dois usuários com mídia real; app desktop Electron)
```

O E2E de dois usuários cobre, em sequência: cadastro → pedido de amizade em tempo real → DM com Markdown e indicador de digitação → criação de servidor → convite → entrada do segundo usuário → menção, reação e imagem → canal de voz com áudio real nos dois sentidos → câmera → compartilhamento de tela → **queda de rede e reconexão sem perder a chamada** → chamada privada com toque e atendimento → persistência após recarregar.

### Bugs encontrados pelos testes e corrigidos

- Corrida no consumo de mídia: produtor anunciado enquanto os transportes ainda eram criados era ignorado (sem áudio de um lado). Agora há fila de pendentes e trava contra consumo duplicado.
- Mensagem recebida pelo gateway durante o carregamento do histórico era sobrescrita pela resposta da API.
- Indicador de digitação descartado logo após enviar uma mensagem.
- Re-renderização infinita causada por seletores que criavam arrays novos a cada chamada (Zustand 5).
- Menções exibidas como “usuário desconhecido” (faltava o provedor de resolução do Markdown).

## Limitações conhecidas (honestas)

- **Instalador não executado em um Windows real neste ambiente.** Ele foi gerado com electron-builder + Wine e inspecionado (executável PE32+ x64, metadados, `app.asar` com 349 arquivos), mas o Wine do container não conseguiu rodar o instalador. O workflow do GitHub Actions gera e valida num `windows-latest`. **Primeiro teste recomendado: instalar no seu PC.**
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
