# Vinlancord

**Sua turma, sua voz, seu lugar.** Plataforma de comunicação para PC com chat em tempo real, chamadas de voz e vídeo, compartilhamento de tela com áudio, servidores, cargos e perfis — feita para você e seus amigos hospedarem e usarem de verdade.

> Monorepo TypeScript: **servidor** (Fastify + PostgreSQL/Prisma + Redis + SFU mediasoup), **cliente** (React + Vite + Tailwind), **app desktop** (Electron + instalador NSIS para Windows) e **testes** (Vitest + Playwright com dois usuários e mídia real).

---

## O que tem

| Área | Recursos |
|---|---|
| **Contas** | Cadastro, login por e-mail ou usuário, verificação de e-mail, recuperação e troca de senha, troca de usuário/e-mail, sessões e dispositivos conectados (com revogação), status online/ausente/ocupado/invisível, ausente automático, exclusão de conta, código de cadastro opcional (servidor só de amigos) |
| **Perfis** | Foto e banner (inclusive GIF animado, com versão estática), nome de exibição, usuário, ID, bio em Markdown, pronomes, links, cor, status personalizado com expiração, jogo atual, atividade recente, servidores/amigos em comum, privacidade (quem vê detalhes, quem manda DM e pedido de amizade) |
| **Amigos** | Adicionar por usuário ou ID, aceitar/recusar/cancelar, remover, bloquear, listas online/todos/pendentes/bloqueados, “Ativos agora”, mensagem e chamada direto da lista/perfil |
| **Servidores** | Públicos ou privados, modelos prontos, ícone, banner, descrição, dono e transferência, convites com validade/limite, explorar servidores públicos, canais de texto/voz/vídeo e categorias, canais privados, emojis e figurinhas personalizados, eventos com confirmação de presença e aviso automático |
| **Cargos e moderação** | Cargos com cor, exibição separada, menção, 32 permissões, hierarquia, sobrescritas por canal (cargo/membro), expulsar, banir (apagando mensagens recentes), castigo temporário, silenciar/ensurdecer/mover/desconectar na voz, modo lento, registro de auditoria, denúncias |
| **Chat** | Tempo real, DMs e grupos, Markdown (negrito, itálico, sublinhado, tachado, spoiler, código, blocos, citações, listas, links), menções @usuário/@cargo/@everyone/#canal, respostas, reações (unicode e personalizadas), edição, exclusão, fixadas, anexos (imagem, vídeo, áudio, arquivos — até 50 MB) com spoiler, arrastar/colar, emojis, GIFs (GIPHY), figurinhas, indicador de digitação, confirmação de envio com reenvio, histórico paginado e virtualizado, busca com filtros, caixa de menções, marcador de “novas mensagens” |
| **Voz e vídeo** | SFU (mediasoup/WebRTC) com STUN/TURN, canais de voz e de vídeo, chamadas privadas com toque/atender/recusar, grade dinâmica e modo destaque, quem está falando, volume individual (0–200 %), silenciar para si, detecção de voz automática ou manual, aperte-para-falar, supressão de ruído, cancelamento de eco, controle de ganho, seleção de microfone/saída/câmera, câmera com simulcast (qualidade adaptativa), indicador de ping/perda, reconexão automática (ICE restart, retomada após queda do WebSocket, reentrada) |
| **Tela** | Tela inteira ou janela/aplicativo (seletor próprio no desktop), áudio do sistema no Windows, 720p → 4K e 30/60 fps, otimizar para nitidez ou fluidez, H.264 por hardware/VP9/VP8, camadas temporais (espectador com pouca banda recebe menos quadros em vez de travar), “Assistir transmissão”, tela cheia, troca de fonte |
| **Notificações** | Sons próprios sintetizados, notificações do sistema, toasts no app, piscar barra de tarefas, badge de menções, por servidor/canal (todas/menções/nada), silenciar servidor/canal/DM, não perturbe |
| **Personalização** | 7 temas (Nebulosa, Grafite, Meia-noite AMOLED, Aurora, Brasa, Claro, Areia) + importar/exportar tema JSON, modo claro/escuro/sistema, cor de destaque, tamanho da fonte, modo compacto, reduzir animações, atalhos configuráveis (inclusive globais) |
| **Desktop** | Janela sem moldura com barra própria, splash animado, bandeja, minimizar ao fechar, iniciar com o Windows, detecção automática de ~80 jogos + jogos personalizados, links `vinlancord://`, token criptografado (DPAPI/Keychain), atualização automática (quando publicada), instalador NSIS com atalho na área de trabalho |

## Estrutura

```
vinlancord/
├── packages/shared/   # tipos, permissões (bitflags), protocolo do gateway, IDs snowflake, limites
├── apps/server/       # API REST + gateway WebSocket + SFU mediasoup + Prisma/PostgreSQL + Redis
├── apps/web/          # cliente React (também roda no navegador, servido pelo próprio servidor)
├── apps/desktop/      # Electron (main/preload), ícones, splash e electron-builder
├── e2e/               # Playwright: dois usuários independentes + app desktop
├── infra/             # Dockerfile, docker-compose (Postgres, Redis, servidor, Caddy/HTTPS, coturn, backup)
└── docs/              # arquitetura, implantação, desktop e progresso
```

## Rodando localmente (desenvolvimento)

Pré-requisitos: **Node.js 22+**, **PostgreSQL 16** e **Redis 7** (ou `docker compose -f infra/docker-compose.dev.yml up -d`).

```bash
cd vinlancord
npm install
cp apps/server/.env.example apps/server/.env      # ajuste DATABASE_URL se precisar
npm run db:migrate                                 # cria as tabelas
npm run dev:server                                 # API + gateway + voz em http://localhost:8787
npm run dev:web                                    # interface em http://localhost:5173
```

Abra duas janelas (uma anônima), crie duas contas e teste chat, chamadas e tela. Sem SMTP configurado, os links de verificação/recuperação aparecem no log do servidor e em `apps/server/data/mail-outbox/`.

App desktop em modo de desenvolvimento:

```bash
npm run build -w @vinlancord/desktop   # compila interface + processo principal
npm run start -w @vinlancord/desktop
```

## Testes

```bash
npm test                                  # shared (unitários) + server (integração) + web
npm run test:e2e                          # Playwright: 2 usuários com áudio/vídeo/tela reais
DESKTOP_E2E=1 xvfb-run -a npm run test:e2e  # inclui o app desktop (Linux precisa de display)
```

O E2E sobe o servidor de verdade, usa dois contextos de navegador independentes (equivalente a dois computadores) e verifica com estatísticas WebRTC que **bytes de áudio e vídeo realmente chegam** do outro lado, inclusive depois de derrubar a rede de um dos usuários.

## Colocando no ar para os amigos

Resumo (detalhes em **[docs/DEPLOY.md](docs/DEPLOY.md)**):

1. VPS Linux com IP público + domínio apontando para ele.
2. `cp .env.example .env` e preencha `DOMAIN`, `PUBLIC_IP`, `SECRET_KEY`, `POSTGRES_PASSWORD`, `TURN_SECRET`.
3. Libere as portas: 80/443 TCP, 40000–40003 UDP+TCP (mídia), 3478 UDP+TCP e 49160–49200 UDP (TURN).
4. `cd infra && docker compose --env-file ../.env up -d --build`.
5. Gere o instalador apontando para o seu domínio (abaixo) e mande para a galera — ou usem pelo navegador em `https://seu-dominio`.

## Instalador para Windows

```bash
# em um Windows (recomendado) — ou no Linux com Wine (wine64 + wine32)
cd vinlancord
set VINLANCORD_SERVER_URL=https://vinlancord.seudominio.com   # PowerShell: $env:VINLANCORD_SERVER_URL="..."
npm run dist:win
# → apps/desktop/release/Vinlancord-Setup-1.0.0.exe
```

Também há um workflow do GitHub Actions (`.github/workflows/vinlancord.yml`) que roda todos os testes e gera o instalador num Windows de verdade (artefato **Vinlancord-Windows**). Detalhes, assinatura de código e atualização automática em **[docs/DESKTOP.md](docs/DESKTOP.md)**.

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — como as peças se encaixam (gateway, permissões, voz SFU, segurança, desempenho)
- [docs/DEPLOY.md](docs/DEPLOY.md) — produção com Docker, HTTPS, TURN, e-mail, GIFs, S3, backup e monitoramento
- [docs/DESKTOP.md](docs/DESKTOP.md) — app desktop, instalador, assinatura e atualizações
- [docs/PROGRESS.md](docs/PROGRESS.md) — status de cada etapa, o que foi testado, limitações e próximos passos
