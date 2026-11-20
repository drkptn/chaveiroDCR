# Colocando o Além-Mar no ar

Guia para hospedar o servidor numa VPS Linux (Ubuntu 22.04/24.04, 2 vCPU e 2–4 GB de RAM atendem bem um grupo de amigos).

## 1. Domínio e máquina

1. Contrate uma VPS com **IP público** (Hetzner, DigitalOcean, Oracle Cloud, Contabo, AWS Lightsail…).
2. Crie um registro DNS **A** do seu domínio (ex.: `vinlancord.seudominio.com`) para o IP.
3. Instale o Docker: `curl -fsSL https://get.docker.com | sh`.

## 2. Firewall

| Porta | Protocolo | Para quê |
|---|---|---|
| 80, 443 | TCP (+443 UDP) | HTTPS (Caddy emite o certificado automaticamente) |
| 40000–40003 | UDP e TCP | Mídia WebRTC (um par por worker do mediasoup) |
| 3478 | UDP e TCP | TURN/STUN (coturn) |
| 49160–49200 | UDP | Retransmissão do TURN |

Exemplo com `ufw`:

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443
ufw allow 40000:40003/udp && ufw allow 40000:40003/tcp
ufw allow 3478 && ufw allow 49160:49200/udp
ufw enable
```

> Em provedores com firewall próprio (AWS, Oracle, GCP) libere as mesmas portas no painel.

## 3. Configuração

```bash
git clone <seu-repositório> && cd chaveiroDCR/vinlancord
cp .env.example .env
openssl rand -hex 32   # rode 3 vezes: SECRET_KEY, POSTGRES_PASSWORD e TURN_SECRET
nano .env              # DOMAIN, PUBLIC_IP e os três segredos
```

Opções importantes do `.env`:

- **`REGISTRATION_CODE`** — com um valor, só quem souber o código cria conta (ideal para servidor só da galera).
- **`REQUIRE_EMAIL_VERIFICATION=true`** — exige confirmar o e-mail antes de entrar (precisa de SMTP).
- **SMTP** — qualquer provedor (Gmail com senha de app, Brevo, Resend, Amazon SES, Mailgun…). Sem SMTP, os links aparecem nos logs: `docker compose logs server | grep mail-outbox`.
- **`GIPHY_API_KEY`** — chave gratuita em <https://developers.giphy.com> para a busca de GIFs. A chave fica só no servidor.
- **`STORAGE_DRIVER=s3`** — guarda anexos num bucket S3 compatível (AWS S3, Cloudflare R2, Backblaze B2, MinIO). O bucket pode (e deve) ser **privado**: o servidor valida a assinatura e redireciona para uma URL temporária.
- **`MEDIASOUP_WORKERS`** — 1 por núcleo (até 4).

## 4. Subir

```bash
cd infra
docker compose --env-file ../.env up -d --build
docker compose logs -f server      # acompanhe; procure "Além-Mar no ar"
curl https://SEU-DOMINIO/api/v1/health
```

As migrações do banco rodam automaticamente a cada início do servidor. Acesse `https://SEU-DOMINIO` no navegador para testar, ou gere o instalador apontando para esse endereço ([DESKTOP.md](DESKTOP.md)).

## 5. Atualizar

```bash
git pull
cd vinlancord/infra && docker compose --env-file ../.env up -d --build server
```

## 6. Backup e restauração

O serviço `backup` faz um `pg_dump` diário compactado em `infra/backups/` (retenção em `BACKUP_KEEP_DAYS`). Copie essa pasta para outro lugar periodicamente (rclone, rsync…). Os anexos ficam no volume `uploads` (ou no seu bucket S3).

Restaurar:

```bash
cd vinlancord/infra
docker compose stop server
gunzip -c backups/vinlancord-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T postgres psql -U vinlancord -d vinlancord
docker compose start server
```

Backup dos anexos locais: `docker run --rm -v vinlancord_uploads:/d -v $PWD:/b alpine tar czf /b/uploads.tgz -C /d .`

## 7. Monitoramento e logs

- `GET /api/v1/health` — banco, Redis e voz (workers, salas, participantes). Já usado pelo healthcheck do Docker.
- `GET /api/v1/metrics` — métricas Prometheus (conexões, salas, participantes, mensagens, erros, CPU/memória). Defina `METRICS_TOKEN` e use `Authorization: Bearer <token>`.
- Logs estruturados (JSON) com rotação: `docker compose logs -f server`.

## 8. Rodar em casa (sem VPS)

Funciona, com dois cuidados: encaminhe no roteador as mesmas portas para o PC servidor e use um DNS dinâmico (DuckDNS, No-IP) como `DOMAIN`, com `PUBLIC_IP` = seu IP público. Se o provedor usar CGNAT (IP compartilhado), prefira uma VPS.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Chat funciona, mas a chamada fica “Conectando…” | Portas 40000–40003 bloqueadas ou `PUBLIC_IP` errado |
| Alguns amigos não conectam a voz (rede de empresa/faculdade) | TURN fora do ar ou portas 3478/49160–49200 bloqueadas; no app, ative *Voz e vídeo → Forçar retransmissão (TURN)* |
| E-mails não chegam | SMTP não configurado (veja os logs) ou caindo no spam (configure SPF/DKIM do domínio) |
| Certificado HTTPS não sai | DNS ainda não propagou ou porta 80 fechada |
| “Calma aí! Muitas requisições” | Limites anti-abuso; aguarde alguns segundos |
