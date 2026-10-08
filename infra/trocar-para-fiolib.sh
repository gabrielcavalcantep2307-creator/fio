#!/bin/sh
# Etapa 2 da troca para fiolib.com.br: os endereços antigos e o www passam a
# levar ao oficial (308 mantém o método: o POST do pulso da esteira segue funcionando).
set -e
F=/opt/picord/Caddyfile
grep -q '^fiolib.com.br, www.fiolib.com.br, fiolib.duckdns.org, fio.142-93-57-2.sslip.io {' "$F" || { echo "ja feito ou Caddyfile diferente"; exit 0; }
cp "$F" "$F.antes-redir-$(date +%Y%m%d%H%M)"
awk '/^fiolib.com.br, www.fiolib.com.br, fiolib.duckdns.org, fio.142-93-57-2.sslip.io \{/ {
  print "# Endereços antigos e o www levam ao endereço oficial (308 mantém POST)."
  print "www.fiolib.com.br, fiolib.duckdns.org, fio.142-93-57-2.sslip.io {"
  print "\tredir https://fiolib.com.br{uri} 308"
  print "}"
  print ""
  print "fiolib.com.br {"
  next }
  { print }' "$F" > "$F.novo"
cat "$F.novo" > "$F" && rm "$F.novo"
docker cp "$F" picord-caddy-1:/config/Caddyfile.atual
docker exec picord-caddy-1 caddy validate --config /config/Caddyfile.atual --adapter caddyfile
docker exec picord-caddy-1 caddy reload --config /config/Caddyfile.atual --adapter caddyfile
echo "redirecionamento ligado"
