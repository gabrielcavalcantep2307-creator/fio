#!/usr/bin/env bash
# Publica a configuração do Caddy (que é da Fiolib desde 19/09/2026).
#
#   bash infra/publicar-caddy.sh
#
# Sobe os três arquivos para /opt/fio/caddy:
#   infra/Caddyfile              → Caddyfile
#   infra/Caddyfile.fiolib       → fiolib.caddy
#   infra/convidado-wallt.caddy  → convidados/wallt.caddy
#
# Valida ANTES de recarregar, num container descartável com as mesmas pastas:
# um erro de digitação aqui derrubaria todos os sites. Se não passar, volta o
# que estava e nada muda.
set -euo pipefail
cd "$(dirname "$0")"
MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
SSH=(ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$MAQUINA")

# O sshd da VPS derruba conexões simultâneas (MaxStartups): tenta de novo.
remoto() {
  local n
  for n in 1 2 3 4 5; do
    "${SSH[@]}" "$@" && return 0
    local s=$?; [ $s -ne 255 ] && return $s
    sleep $((n * 3))
  done
  return 255
}

PACOTE="$(mktemp)"
trap 'rm -f "$PACOTE"' EXIT
mkdir -p "${PACOTE}.d/convidados"
cp Caddyfile "${PACOTE}.d/Caddyfile"
cp Caddyfile.fiolib "${PACOTE}.d/fiolib.caddy"
cp convidado-wallt.caddy "${PACOTE}.d/convidados/wallt.caddy"
tar czf "$PACOTE" -C "${PACOTE}.d" .
rm -rf "${PACOTE}.d"

remoto 'rm -rf /opt/fio/caddy.novo && mkdir -p /opt/fio/caddy.novo /opt/fio/logs && tar xzf - -C /opt/fio/caddy.novo' < "$PACOTE"
remoto bash -s <<'REMOTO'
set -euo pipefail
validar() {
  docker run --rm --network none \
    -v "$1":/etc/caddy:ro -v /opt/fio/logs:/var/log/fiolib \
    -v /opt/picord/site:/srv/wallt:ro \
    caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}
if ! validar /opt/fio/caddy.novo >/tmp/caddy-validar.log 2>&1; then
  tail -5 /tmp/caddy-validar.log
  rm -rf /opt/fio/caddy.novo
  echo "Configuração do Caddy RECUSADA; nada mudou."; exit 1
fi
# Troca o conteúdo sem trocar a pasta (o container monta a pasta, não os
# arquivos: trocar a pasta inteira deixaria ele olhando a antiga).
rm -rf /opt/fio/caddy.antes && cp -a /opt/fio/caddy /opt/fio/caddy.antes
mkdir -p /opt/fio/caddy/convidados
cp /opt/fio/caddy.novo/Caddyfile /opt/fio/caddy.novo/fiolib.caddy /opt/fio/caddy/
rm -f /opt/fio/caddy/convidados/*.caddy
cp /opt/fio/caddy.novo/convidados/*.caddy /opt/fio/caddy/convidados/ 2>/dev/null || true
rm -rf /opt/fio/caddy.novo
if docker ps --format '{{.Names}}' | grep -qx infra-caddy-1; then
  docker exec infra-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
else
  echo "(o Caddy da Fiolib não está rodando; configuração guardada para quando subir)"
fi
for u in https://fiolib.com.br/ https://waltt.duckdns.org/; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done
REMOTO
