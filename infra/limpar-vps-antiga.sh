#!/usr/bin/env bash
# Tirar a Fiolib da VPS antiga e devolver a casa ao Wallt.
#
#   bash infra/limpar-vps-antiga.sh            # mostra o que vai fazer
#   bash infra/limpar-vps-antiga.sh --aplicar  # faz
#
# Ordem das coisas, e por quê:
#   1. o Caddy volta a ser do Wallt (era dele até 19/09; a Fiolib tomou a
#      frente quando dividiam a máquina). Os certificados do Wallt nunca
#      saíram do volume picord_caddy_data, então ele volta com HTTPS na hora;
#   2. só então a Fiolib sai: containers, imagens, volumes e /opt/fio;
#   3. a trava: nada acontece enquanto o domínio não estiver sendo servido
#      pela máquina NOVA. Apagar antes disso seria apagar o site no ar.
set -euo pipefail

VELHA="${VELHA:-root@142.93.57.2}"
NOVA_IP="${NOVA_IP:-2.25.210.20}"
DOMINIO="${DOMINIO:-fiolib.com.br}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
SSH=(ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
velha() { "${SSH[@]}" "$VELHA" "$@"; }
titulo() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

titulo "Trava: quem está servindo ${DOMINIO} agora?"
IP=$(curl -s -o /dev/null -w '%{remote_ip}' "https://${DOMINIO}/api/saude" || true)
SAUDE=$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMINIO}/api/saude" || true)
echo "    responde de ${IP:-?} (http ${SAUDE:-?})"
if [ "$IP" != "$NOVA_IP" ] || [ "$SAUDE" != "200" ]; then
  echo "    PARADO: o domínio ainda não está na máquina nova. Troque o DNS e espere propagar."
  exit 1
fi

titulo "O que existe hoje na máquina velha"
velha 'docker ps -a --format "{{.Names}} {{.Status}}"; echo; du -sh /opt/fio 2>/dev/null; docker volume ls --format "{{.Name}}"'

if [ "${1:-}" != "--aplicar" ]; then
  echo
  echo "Isto foi só a vistoria. Para fazer de verdade:"
  echo "  bash infra/limpar-vps-antiga.sh --aplicar"
  exit 0
fi

titulo "Guardando uma última cópia do banco no seu computador (segurança)"
mkdir -p "$(dirname "$0")/../backups-do-ar"
velha 'ls -t /opt/fio/backups/catalogo-*.db.gz 2>/dev/null | head -1' | while read -r arq; do
  [ -n "$arq" ] && scp -i "$CHAVE" "$VELHA:$arq" "$(dirname "$0")/../backups-do-ar/" && echo "    trouxe $(basename "$arq")"
done

titulo "Devolvendo o Caddy ao Wallt"
velha bash -s <<'REMOTO'
set -euo pipefail
cd /opt/picord
cp docker-compose.yml docker-compose.yml.antes-devolver
# o serviço caddy do Wallt volta a subir por padrão
sed -i "/profiles: \['caddy-proprio'\]/d" docker-compose.yml
# e deixa de depender das pastas da Fiolib, que vão sumir
sed -i '\#/opt/fio/caddy:/etc/caddy/fiolib:ro#d; \#/opt/fio/logs:/var/log/fiolib#d' docker-compose.yml
cp Caddyfile Caddyfile.antes-devolver
grep -v 'import /etc/caddy/fiolib/\*\.caddy' Caddyfile > Caddyfile.novo && cat Caddyfile.novo > Caddyfile && rm -f Caddyfile.novo
docker compose config -q && echo "    compose do Wallt ok"
# a Fiolib sai da frente e o Caddy do Wallt assume as portas 80/443
docker compose -f /opt/fio/infra/docker-compose.yml stop || true
docker compose up -d caddy
sleep 4
for u in https://waltt.duckdns.org/ https://picordi.duckdns.org/; do
  printf '    %s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done
REMOTO

titulo "Apagando a Fiolib da máquina velha"
velha bash -s <<'REMOTO'
set -euo pipefail
cd /opt/fio/infra 2>/dev/null && docker compose down -v --rmi local || true
rm -rf /opt/fio
docker image prune -f >/dev/null || true
echo "    /opt/fio: $(test -d /opt/fio && echo 'ainda existe' || echo 'apagada')"
docker ps --format '    {{.Names}} {{.Status}}'
df -h / | tail -1
REMOTO

titulo "Pronto"
echo "A máquina velha agora é só do Wallt. A chave de deploy da Fiolib continua"
echo "autorizada lá — tire em /root/.ssh/authorized_keys se não quiser mais."
