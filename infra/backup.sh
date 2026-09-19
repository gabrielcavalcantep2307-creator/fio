#!/usr/bin/env bash
# Backup do banco. Roda NA VPS.
#
#   bash /opt/fio/infra/backup.sh
#
# `VACUUM INTO` produz uma cópia íntegra mesmo com o servidor escrevendo —
# copiar o arquivo com `cp` durante uma escrita produz um banco quebrado que
# só se descobre no dia em que ele for necessário.

# CUIDADO, e o motivo de este arquivo ter mudado: o compose mora em
# `/opt/fio/infra/docker-compose.yml`, e as tres linhas abaixo apontavam para
# `/opt/fio/docker-compose.yml`, que nao existe. O script falhava na primeira
# delas e `set -e` matava o resto — a pasta de backups estava VAZIA desde
# 04/09/2026, com 2,2 GB de catalogo sem copia nenhuma.

set -euo pipefail
# O backup tem as contas (resumos de senha, e-mails): só o root lê. Até
# 19/09/2026 saía 644, legível por qualquer usuário da máquina.
umask 077
PASTA="${1:-/opt/fio/backups}"
mkdir -p "$PASTA"
chmod 700 "$PASTA"
QUANDO=$(date +%Y%m%d-%H%M)

docker compose -f /opt/fio/infra/docker-compose.yml exec -T fio \
  node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync('/dados/catalogo.db').exec(\"VACUUM INTO '/dados/backup.db'\")"
docker compose -f /opt/fio/infra/docker-compose.yml cp fio:/dados/backup.db "$PASTA/catalogo-$QUANDO.db"
docker compose -f /opt/fio/infra/docker-compose.yml exec -T fio rm -f /dados/backup.db
gzip -f "$PASTA/catalogo-$QUANDO.db"

# Guarda 14 dias. Backup que ninguém apaga enche o disco e derruba o serviço
# que ele existia para proteger.
find "$PASTA" -name 'catalogo-*.db.gz' -mtime +14 -delete
echo "$PASTA/catalogo-$QUANDO.db.gz"

# ── o retrato para o painel (aba Controle, servidor/controle.mjs) ──
#
# O site não enxerga a VPS: ele não tem (nem deve ter) acesso ao Docker nem aos
# logs do sistema. Uma vez por dia, aqui, o root deixa em /opt/fio/estado — que
# o site monta SÓ LEITURA em /estado — dois retratos pequenos: quando foi o
# backup, e como está a máquina. Só números e datas, nada de segredo; por isso
# 644 (o site roda sem root e precisa ler).
ESTADO=/opt/fio/estado
mkdir -p "$ESTADO"
chmod 755 "$ESTADO"
umask 022
ARQ="$PASTA/catalogo-$QUANDO.db.gz"
printf '{"quando":"%s","arquivo":"%s","bytes":%s}\n' "$(date -u +%FT%TZ)" "$(basename "$ARQ")" "$(stat -c%s "$ARQ")" > "$ESTADO/backup.json.novo"
mv "$ESTADO/backup.json.novo" "$ESTADO/backup.json"

SSH_BARRADAS=$(journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null | grep -cE 'Invalid user|Failed|authentication failure|Connection closed by authenticating' || true)
BANIDOS=$(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/ {gsub(/[ 	]/,"",$2); print $2}' || true)
ATUALIZACOES=$(apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep -c '^Inst.*security' || true)
REINICIAR=false; [ -f /var/run/reboot-required ] && REINICIAR=true
printf '{"quando":"%s","ssh_barradas":%s,"banidos":%s,"atualizacoes":%s,"reiniciar":%s}\n' \
  "$(date -u +%FT%TZ)" "${SSH_BARRADAS:-0}" "${BANIDOS:-0}" "${ATUALIZACOES:-0}" "$REINICIAR" > "$ESTADO/maquina.json.novo"
mv "$ESTADO/maquina.json.novo" "$ESTADO/maquina.json"
