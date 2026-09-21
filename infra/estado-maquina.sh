#!/usr/bin/env bash
# O retrato da máquina para o painel (aba Controle, servidor/controle.mjs).
#
#   bash /opt/fio/infra/estado-maquina.sh
#
# Roda NA VPS, como root: a cada 30 minutos e na subida da máquina (cron).
#
# Até 21/09/2026 isto era um pedaço de infra/backup.sh, e rodava UMA vez por
# dia, às 03:20. O painel mostrava "o sistema pede um reinício" depois de a
# máquina ter sido reiniciada, e mostraria até a madrugada seguinte: o retrato
# era de antes do reinício, e ninguém o refazia. Um aviso que continua aceso
# depois de resolvido ensina a ignorar o painel — que é pior que não ter aviso.
#
# O site não enxerga a VPS: não tem (nem deve ter) acesso ao Docker nem aos
# logs do sistema. Por isso o root deixa em /opt/fio/estado — que o site monta
# SÓ LEITURA em /estado — um retrato pequeno: só números e datas, nada de
# segredo, e por isso 644 (o site roda sem root e precisa ler).

set -euo pipefail
ESTADO=/opt/fio/estado
mkdir -p "$ESTADO"
chmod 755 "$ESTADO"
umask 022

SSH_BARRADAS=$(journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null | grep -cE 'Invalid user|Failed|authentication failure|Connection closed by authenticating' || true)
BANIDOS=$(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/ {gsub(/[ 	]/,"",$2); print $2}' || true)
ATUALIZACOES=$(apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep -c '^Inst.*security' || true)
REINICIAR=false; [ -f /var/run/reboot-required ] && REINICIAR=true
SWAP_MB=$(free -m | awk '/^Swap:/ {print $2}')

printf '{"quando":"%s","ssh_barradas":%s,"banidos":%s,"atualizacoes":%s,"reiniciar":%s,"swap_mb":%s}\n' \
  "$(date -u +%FT%TZ)" "${SSH_BARRADAS:-0}" "${BANIDOS:-0}" "${ATUALIZACOES:-0}" "$REINICIAR" "${SWAP_MB:-0}" > "$ESTADO/maquina.json.novo"
mv "$ESTADO/maquina.json.novo" "$ESTADO/maquina.json"
