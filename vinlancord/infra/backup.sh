#!/bin/sh
# Backup diário do PostgreSQL com retenção (dias) configurável.
set -e
KEEP=${BACKUP_KEEP_DAYS:-14}
while true; do
  FILE="/backups/vinlancord-$(date +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump -h postgres -U vinlancord vinlancord | gzip > "$FILE.tmp"; then
    mv "$FILE.tmp" "$FILE"
    echo "backup ok: $FILE"
  else
    rm -f "$FILE.tmp"
    echo "backup FALHOU" >&2
  fi
  find /backups -name 'vinlancord-*.sql.gz' -mtime +"$KEEP" -delete
  sleep 86400
done
