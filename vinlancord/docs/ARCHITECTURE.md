# Arquitetura do Vinlancord

```
                ┌─────────────────────── Cliente (Electron ou navegador) ───────────────────────┐
                │ React + Zustand  ── REST (fetch) ──┐                                           │
                │ Gateway WS (eventos + RPC) ─────────┼──┐                                       │
                │ VoiceEngine (mediasoup-client) ─────┼──┼── WebRTC (UDP/TCP, DTLS-SRTP) ──┐     │
                └─────────────────────────────────────┼──┼──────────────────────────────────┼─────┘
                                                      │  │                                  │
            HTTPS (Caddy, Let's Encrypt) ─────────────┘  │ WSS                              │ (ou via TURN/coturn)
                                                         ▼                                  ▼
┌──────────────────────────────── Servidor Node.js (Fastify) ────────────────────────────────────────┐
│ Rotas REST (/api/v1)  │  Gateway (/gateway)  │  Serviço de voz  ──►  Workers mediasoup (C++, SFU)  │
│ Permissões (cache por servidor) · Barramento de eventos · Presença · Arquivos (/files)            │
└───────────────┬───────────────────────────────┬──────────────────────────────┬────────────────────┘
                ▼                               ▼                              ▼
         PostgreSQL (Prisma)            Redis (pub/sub, presença,      Armazenamento (disco local
         dados persistentes             rate limit, cache)             ou S3/R2/MinIO)
```

## Pacote compartilhado (`packages/shared`)

Fonte única de verdade para os dois lados:

- **Permissões** em bitflags `BigInt` com o algoritmo de cálculo (cargo @everyone → cargos → sobrescritas de @everyone, cargos e membro no canal; administrador e dono ignoram sobrescritas; castigo deixa só leitura; sem `VIEW_CHANNEL` não há nada). O servidor **sempre** valida; o cliente usa só para esconder botões.
- **IDs snowflake** de 19 dígitos (época 2018): ordenáveis como texto, usados na paginação (`id < before`) e para derivar datas.
- **Protocolo do gateway** tipado: eventos (`MESSAGE_CREATE`, `VOICE_STATE_UPDATE`…) e métodos RPC (`voice.join`, `voice.produce`…).

## Servidor (`apps/server`)

- **Fastify 5** com helmet, CORS restrito (`app://vinlancord` + domínio), rate limit global (Redis) e limites finos por ação (login, cadastro, mensagens, uploads, pedidos de amizade, buscas).
- **Prisma 7 + PostgreSQL**: 25 tabelas (usuários, sessões, relacionamentos, servidores, membros, cargos, canais, sobrescritas, mensagens, anexos, reações, leituras, convites, banimentos, emojis, figurinhas, eventos, auditoria, denúncias, atividades…). Busca textual com índices trigram (`pg_trgm`).
- **Autenticação**: senhas com **Argon2id**, tokens de sessão opacos de 256 bits (no banco só o SHA-256), sessão deslizante de 30 dias, revogação imediata (o socket da sessão é derrubado), e-mail de verificação/recuperação com tokens de uso único e expiração, respostas iguais para e-mails inexistentes (sem enumeração) e comparação de tempo constante.
- **Barramento de eventos**: cada evento é resolvido para a lista exata de destinatários *já filtrada por permissão* (ex.: só quem vê o canal recebe a mensagem) e publicado no Redis; qualquer instância entrega aos seus sockets.
- **Gateway WebSocket**: `HELLO → IDENTIFY → READY` (estado inicial completo), heartbeat com detecção de conexão zumbi, RPC com correlação de IDs, token bucket por conexão e limite de payload.
- **Arquivos**: tipo detectado pelos *magic bytes* (nunca pelo nome), EXIF/GPS removido de fotos, SVG/HTML viram download, `nosniff` + CSP `sandbox`, URLs assinadas com HMAC e validade para anexos, suporte a `Range` (vídeo com avanço), imagens de perfil/servidor convertidas para WebP (animadas preservadas + versão estática).
- **Presença**: agregada por conexão (status preferido, ausente automático, atividades), espelhada no Redis com TTL.

## Voz, vídeo e tela

Arquitetura **SFU** (Selective Forwarding Unit) com **mediasoup**: cada participante envia sua mídia uma única vez e o servidor encaminha para os demais. Em malha P2P, cada PC teria de codificar o vídeo N−1 vezes — inviável em PCs intermediários e com muitos participantes.

- Um `WebRtcServer` por worker concentra a mídia em **uma porta UDP+TCP por worker** (40000+), simplificando firewall e Docker. TCP permite atravessar redes restritivas; o **TURN (coturn)** com credenciais temporárias HMAC cobre o resto (opção “forçar retransmissão” no cliente).
- **Microfone**: `getUserMedia` com supressão de ruído, cancelamento de eco e ganho automático do Chromium → grafo WebAudio (ganho de entrada → analisador → portão VAD/PTT com rampas e tempo de retenção) → Opus com DTX e FEC.
- **Quem está falando**: `AudioLevelObserver` no servidor (outros) + VAD local (você), sem atraso de rede.
- **Câmera**: simulcast em 3 camadas (¼, ½ e resolução cheia). Cada espectador recebe a camada adequada ao tamanho do quadro na tela (`ResizeObserver` → `setPreferredLayers`) e à sua banda (BWE do mediasoup). Vídeos são pausados quando a tela da chamada não está visível.
- **Tela**: H.264 (aceleração por hardware na GPU — ideal para PCs intermediários), VP9 ou VP8 com camadas temporais `L1T3`; `contentHint` e `degradationPreference` conforme “nitidez” ou “fluidez”; telas têm prioridade de banda sobre câmeras e o áudio vem antes de tudo. Assistir é opcional em servidores (economiza banda) e automático em DMs.
- **Áudio do sistema** (Windows): `setDisplayMediaRequestHandler` com `loopback`, enviado como produtor separado em Opus estéreo.
- **Reprodução**: cada participante passa por um `GainNode` (0–200 %) → ganho mestre → `AudioContext.setSinkId` (dispositivo de saída escolhido).
- **Resiliência**: transporte `disconnected/failed` → ICE restart (até 3 tentativas) → reentrada completa; queda do WebSocket mantém a mídia por 20 s e a sessão de voz é retomada (`voice.resume`) sem cair da chamada; worker que morre é recriado e os clientes reentram sozinhos.
- **Chamadas privadas**: entrar numa DM cria a chamada, toca para os outros por 45 s, registra uma mensagem de chamada (duração/perdida) e encerra quando todos saem.

## Cliente (`apps/web`)

- **Zustand** com o estado sincronizado pelo gateway (o `READY` ressincroniza tudo após reconexão). Seletores estáveis (`useShallow`/constantes) evitam re-renderizações desnecessárias.
- **Lista de mensagens virtualizada** (`react-virtuoso`): só o que está na tela existe no DOM; paginação de 50 em 50 para cima; no máximo ~300 mensagens por canal em memória.
- **Envio otimista** com `nonce`: a mensagem aparece na hora, é confirmada pelo evento do servidor e, se falhar, oferece reenviar.
- **Markdown próprio** que gera elementos React (nunca `innerHTML`); links só `http(s)` e com aviso antes de abrir.
- Divisão de código: configurações, perfis, modais, emojis (584 KB, carregado só ao abrir o seletor) e o motor de voz ficam em pacotes separados.

## Desktop (`apps/desktop`)

Electron com `contextIsolation`, `sandbox`, sem Node no renderer, CSP por cabeçalho, protocolo próprio `app://vinlancord`, navegação externa bloqueada e permissões de mídia concedidas só à origem do app. O preload expõe uma API mínima (janela, cofre seguro, seletor de tela, badge, atalhos globais, processos para detectar jogos, ociosidade, configurações e atualizações).

## Escalabilidade

Pensado para comunidades de amigos e servidores médios em **uma instância** (vários workers de mídia aproveitam todos os núcleos). O barramento, presença e rate limit já usam Redis; para várias instâncias atrás de um balanceador, é preciso roteamento fixo por canal de voz (as salas de mídia vivem na instância que as criou) — veja [PROGRESS.md](PROGRESS.md).
