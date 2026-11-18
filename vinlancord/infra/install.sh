#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vinlancord — instalação (ou atualização) do servidor com UM comando.
#
# Num servidor Linux novo (Ubuntu 22.04/24.04 ou Debian 12), como root:
#   curl -fsSL https://raw.githubusercontent.com/drkptn/chaveiroDCR/claude/vinlancord-communication-app-vkiccq/vinlancord/infra/install.sh | bash
#
# O que ele faz sozinho:
#   • instala Docker, git e firewall; cria swap se a memória for pouca
#   • baixa o código, gera senhas/chaves aleatórias (ficam só neste servidor)
#   • descobre o IP público e usa um endereço HTTPS automático (<ip>.sslip.io)
#     — ou o seu domínio, se você passar DOMAIN=chat.seudominio.com
#   • sobe banco, Redis, servidor de chat/voz/vídeo, HTTPS (Let's Encrypt), TURN e backups
#   • tudo reinicia sozinho se o servidor reiniciar
#   • (opcional, ligado por padrão) atualização automática diária às 05:00 (horário de Brasília)
#
# Rodar de novo = atualizar para a versão mais nova, sem perder dados.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${VINLANCORD_REPO:-https://github.com/drkptn/chaveiroDCR.git}"
BRANCH="${VINLANCORD_BRANCH:-claude/vinlancord-communication-app-vkiccq}"
DIR="${VINLANCORD_DIR:-/opt/vinlancord}"
AUTO_UPDATE="${VINLANCORD_AUTO_UPDATE:-1}"
# Modo CI: usa o código já baixado, não mexe em pacotes/firewall e testa com TLS local.
CI_MODE="${VINLANCORD_CI:-0}"

say() { printf '\033[1;31m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Rode como root (ex.: sudo bash install.sh)."

# ─── 1. Pacotes, Docker e memória ────────────────────────────────────────────
if [ "$CI_MODE" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  say "Instalando pacotes base…"
  apt-get update -qq
  apt-get install -y -qq git curl ca-certificates openssl ufw >/dev/null
  if ! command -v docker >/dev/null 2>&1; then
    say "Instalando Docker…"
    curl -fsSL https://get.docker.com | sh >/dev/null
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  mem_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo)
  if [ "$(swapon --show --noheadings | wc -l)" = 0 ] && [ "$mem_kb" -lt 3500000 ]; then
    say "Pouca memória ($((mem_kb / 1024)) MB): criando 3 GB de swap…"
    fallocate -l 3G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=3072 status=none
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi
command -v docker >/dev/null 2>&1 || die "Docker não encontrado."

# ─── 2. Código ───────────────────────────────────────────────────────────────
if [ "$CI_MODE" = 1 ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
else
  if [ -d "$DIR/.git" ]; then
    say "Atualizando o código…"
    git -C "$DIR" fetch -q --depth 1 origin "$BRANCH"
    git -C "$DIR" reset -q --hard FETCH_HEAD
  else
    say "Baixando o código…"
    git clone -q --depth 1 -b "$BRANCH" "$REPO_URL" "$DIR"
  fi
  ROOT="$DIR"
fi
APP="$ROOT/vinlancord"
INFRA="$APP/infra"
ENVF="$APP/.env"

# ─── 3. Endereço público e configuração (gerada uma única vez) ───────────────
if [ ! -f "$ENVF" ]; then
  if [ "$CI_MODE" = 1 ]; then
    PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"
    DOMAIN="${DOMAIN:-localhost}"
  else
    PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me)}"
    [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Não consegui descobrir o IP público. Rode com PUBLIC_IP=x.x.x.x"
    DOMAIN="${DOMAIN:-$(echo "$PUBLIC_IP" | tr . -).sslip.io}"
  fi
  rnd() { openssl rand -hex "$1"; }
  cores=$(nproc)
  say "Gerando configuração e segredos (ficam só neste servidor)…"
  umask 077
  cat > "$ENVF" <<EOF
# Gerado por install.sh em $(date -u +%FT%TZ). Guarde este arquivo: ele contém as chaves do servidor.
DOMAIN=$DOMAIN
PUBLIC_IP=$PUBLIC_IP
POSTGRES_PASSWORD=$(rnd 24)
SECRET_KEY=$(rnd 32)
TURN_SECRET=$(rnd 24)
METRICS_TOKEN=$(rnd 16)
REGISTRATION_ENABLED=true
REGISTRATION_CODE=${REGISTRATION_CODE:-}
MEDIASOUP_WORKERS=$(( cores > 4 ? 4 : cores ))
EOF
  umask 022
fi
# shellcheck disable=SC1090
set -a; . "$ENVF"; set +a

# ─── 4. Firewall ─────────────────────────────────────────────────────────────
if [ "$CI_MODE" != 1 ]; then
  say "Liberando portas (web, voz, vídeo e TURN)…"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443 >/dev/null
  ufw allow 3478 >/dev/null
  ufw allow 40000:40003/udp >/dev/null
  ufw allow 40000:40003/tcp >/dev/null
  ufw allow 49160:49200/udp >/dev/null
  ufw --force enable >/dev/null
fi

# ─── 5. Subir tudo ───────────────────────────────────────────────────────────
cd "$INFRA"
mkdir -p backups
say "Construindo e iniciando os serviços (a primeira vez leva alguns minutos)…"
docker compose --env-file "$ENVF" up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

# ─── 6. Esperar ficar no ar ──────────────────────────────────────────────────
say "Aguardando o servidor responder em https://$DOMAIN …"
ok=0
for _ in $(seq 1 120); do
  if curl -fsSk --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/v1/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
[ "$ok" = 1 ] || { docker compose --env-file "$ENVF" ps; docker compose --env-file "$ENVF" logs --tail 80 server caddy; die "O servidor não respondeu a tempo."; }

if [ "$CI_MODE" != 1 ]; then
  # certificado válido (Let's Encrypt) — pode levar alguns segundos a mais
  for _ in $(seq 1 36); do curl -fsS --max-time 5 "https://$DOMAIN/api/v1/health" >/dev/null 2>&1 && break; sleep 5; done
fi

# ─── 7. Atualização automática diária ────────────────────────────────────────
if [ "$CI_MODE" != 1 ] && [ "$AUTO_UPDATE" = 1 ]; then
  cp "$INFRA/install.sh" /usr/local/sbin/vinlancord-install
  cat > /usr/local/sbin/vinlancord-update <<EOF
#!/usr/bin/env bash
# Atualiza só quando há versão nova no repositório.
set -euo pipefail
cd "$DIR"
old=\$(git rev-parse HEAD)
git fetch -q --depth 1 origin "$BRANCH"
[ "\$old" = "\$(git rev-parse FETCH_HEAD)" ] && exit 0
VINLANCORD_BRANCH="$BRANCH" VINLANCORD_DIR="$DIR" VINLANCORD_REPO="$REPO_URL" exec bash /usr/local/sbin/vinlancord-install
EOF
  chmod 755 /usr/local/sbin/vinlancord-install /usr/local/sbin/vinlancord-update
  cat > /etc/systemd/system/vinlancord-update.service <<EOF
[Unit]
Description=Atualiza o servidor Vinlancord
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vinlancord-update
EOF
  cat > /etc/systemd/system/vinlancord-update.timer <<EOF
[Unit]
Description=Atualização diária do Vinlancord (05:00 de Brasília)
[Timer]
OnCalendar=*-*-* 08:00:00 UTC
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now vinlancord-update.timer >/dev/null
fi

printf '\n\033[1;32m✔ Vinlancord no ar!\033[0m\n'
printf '  Endereço do servidor:  \033[1mhttps://%s\033[0m\n' "$DOMAIN"
printf '  Navegador:             https://%s\n' "$DOMAIN"
printf '  Configuração/segredos: %s (guarde uma cópia)\n' "$ENVF"
printf '  Backups do banco:      %s/backups (diários)\n' "$INFRA"
[ "$CI_MODE" = 1 ] || printf '  Atualização automática: diária (systemctl status vinlancord-update.timer)\n'
