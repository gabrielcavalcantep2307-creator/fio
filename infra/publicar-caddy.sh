#!/usr/bin/env bash
# Publica o Caddyfile da Fiolib (infra/Caddyfile.fiolib) sem tocar no do Wallt.
#
#   bash infra/publicar-caddy.sh
#
# Valida ANTES de recarregar: um erro de digitação aqui derrubaria os dois
# sites, porque o Caddy é um só. Se a validação falhar, nada muda na VPS.
set -euo pipefail
cd "$(dirname "$0")"
MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
SSH=(ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$MAQUINA")

"${SSH[@]}" 'mkdir -p /opt/fio/caddy /opt/fio/logs && cat > /opt/fio/caddy/fiolib.caddy.novo' < Caddyfile.fiolib
"${SSH[@]}" bash -s <<'REMOTO'
set -euo pipefail
cd /opt/fio/caddy
cp fiolib.caddy fiolib.caddy.antes 2>/dev/null || true
# Troca o conteúdo e valida o conjunto inteiro (Wallt + Fiolib) de dentro do
# próprio container; se não passar, volta o anterior.
cat fiolib.caddy.novo > fiolib.caddy
if ! docker exec picord-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/caddy-validar.log 2>&1; then
  cat /tmp/caddy-validar.log | tail -5
  [ -f fiolib.caddy.antes ] && cat fiolib.caddy.antes > fiolib.caddy
  echo "Caddyfile da Fiolib RECUSADO; nada mudou."; exit 1
fi
rm -f fiolib.caddy.novo
docker exec picord-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
for u in https://fiolib.com.br/ https://waltt.duckdns.org/; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done
REMOTO
