#!/usr/bin/env bash
# Backup do banco. Roda NA VPS.
#
#   bash /opt/fio/infra/backup.sh
#
# `VACUUM INTO` produz uma cópia íntegra mesmo com o servidor escrevendo —
# copiar o arquivo com `cp` durante uma escrita produz um banco quebrado que
# só se descobre no dia em que ele for necessário.

set -euo pipefail
PASTA="${1:-/opt/fio/backups}"
mkdir -p "$PASTA"
QUANDO=$(date +%Y%m%d-%H%M)

docker compose -f /opt/fio/docker-compose.yml exec -T fio \
  node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync('/dados/catalogo.db').exec(\"VACUUM INTO '/dados/backup.db'\")"
docker compose -f /opt/fio/docker-compose.yml cp fio:/dados/backup.db "$PASTA/catalogo-$QUANDO.db"
docker compose -f /opt/fio/docker-compose.yml exec -T fio rm -f /dados/backup.db
gzip -f "$PASTA/catalogo-$QUANDO.db"

# Guarda 14 dias. Backup que ninguém apaga enche o disco e derruba o serviço
# que ele existia para proteger.
find "$PASTA" -name 'catalogo-*.db.gz' -mtime +14 -delete
echo "$PASTA/catalogo-$QUANDO.db.gz"
