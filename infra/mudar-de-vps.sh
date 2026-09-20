#!/usr/bin/env bash
# Mudar a Fiolib de VPS, sem perder nada e com o mínimo de tempo fora do ar.
#
#   bash infra/mudar-de-vps.sh preparar   # instala e copia tudo para a nova (site continua no ar na velha)
#   bash infra/mudar-de-vps.sh virar      # para a velha, copia o que mudou, sobe a nova
#   bash infra/mudar-de-vps.sh conferir   # bate as duas, de fora
#
# Depois de `virar`, TROCAR O DNS: o registro A de fiolib.com.br passa a
# apontar para a máquina nova (o `www` é apelido e vai junto). Quem ainda
# resolver o endereço antigo vê uma página de "estamos mudando de casa" —
# nunca uma segunda cópia do site gravando por baixo.
#
# O que viaja: /opt/fio inteiro (site, estado, caddy, infra com o .env,
# servidor, ingestao) e os DOIS volumes do Docker — o banco (infra_dados) e os
# certificados do Caddy (infra_caddy_data). Levar os certificados é o que
# permite a virada sem HTTPS quebrado: a máquina nova já responde com o
# certificado válido antes mesmo de o DNS mudar.
#
# A cópia é feita de máquina para máquina (não passa pelo PC): o script cria
# uma chave temporária na VELHA, autoriza na NOVA, usa, e apaga no fim.
set -euo pipefail

VELHA="${VELHA:-root@142.93.57.2}"
NOVA="${NOVA:-root@2.25.210.20}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
DOMINIO="${DOMINIO:-fiolib.com.br}"
SSH=(ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

velha() { "${SSH[@]}" "$VELHA" "$@"; }
nova()  { "${SSH[@]}" "$NOVA" "$@"; }
titulo() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# A ponte de máquina para máquina, criada só enquanto a mudança dura.
abrir_ponte() {
  titulo "Abrindo a ponte entre as duas máquinas"
  velha 'test -f /root/.ssh/mudanca || ssh-keygen -q -t ed25519 -N "" -C mudanca-fiolib -f /root/.ssh/mudanca'
  local pub
  pub=$(velha 'cat /root/.ssh/mudanca.pub')
  nova "mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && grep -qF '$pub' /root/.ssh/authorized_keys || echo '$pub' >> /root/.ssh/authorized_keys"
  velha "ssh -i /root/.ssh/mudanca -o StrictHostKeyChecking=accept-new ${NOVA} 'echo ponte ok'"
}

fechar_ponte() {
  titulo "Fechando a ponte"
  local pub
  pub=$(velha 'cat /root/.ssh/mudanca.pub 2>/dev/null || true')
  [ -n "$pub" ] && nova "grep -vF '$pub' /root/.ssh/authorized_keys > /root/.ssh/a && mv /root/.ssh/a /root/.ssh/authorized_keys" || true
  velha 'rm -f /root/.ssh/mudanca /root/.ssh/mudanca.pub' || true
}

copiar_pasta() {
  velha "rsync -a --delete -e 'ssh -i /root/.ssh/mudanca -o StrictHostKeyChecking=accept-new' --exclude backups --exclude site.ant --exclude servidor.antes /opt/fio/ ${NOVA}:/opt/fio/"
}

# Um volume do Docker viaja como tar pela ponte.
copiar_volume() {
  local v="$1"
  velha "docker run --rm -v ${v}:/de:ro alpine tar cf - -C /de . | ssh -i /root/.ssh/mudanca -o StrictHostKeyChecking=accept-new ${NOVA} 'docker volume create ${v} >/dev/null && docker run --rm -i -v ${v}:/para alpine tar xf - -C /para'"
}

case "${1:-}" in
preparar)
  titulo "Docker na máquina nova"
  nova 'command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)'
  nova 'docker --version && (command -v rsync >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync))'
  nova 'mkdir -p /opt/fio/logs /opt/fio/estado /opt/fio/backups && chmod 755 /opt/fio/estado'
  velha 'command -v rsync >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync)'

  abrir_ponte
  titulo "Copiando /opt/fio (site, estado, caddy, infra, servidor)"
  copiar_pasta
  titulo "Copiando o banco e os certificados"
  copiar_volume infra_dados
  copiar_volume infra_caddy_data
  copiar_volume infra_caddy_config || true

  titulo "Construindo e subindo na máquina nova"
  # O Wallt fica na máquina velha: aqui não há convidado nem site dele.
  nova 'rm -f /opt/fio/caddy/convidados/*.caddy; mkdir -p /opt/picord/site'
  nova 'cd /opt/fio/infra && docker compose up -d --build'
  sleep 8
  titulo "Conferindo por dentro da máquina nova"
  nova "curl -s -o /dev/null -w 'site local: %{http_code}\n' http://127.0.0.1:8787/api/saude"
  nova "docker ps --format '{{.Names}} {{.Status}}'"
  fechar_ponte
  echo
  echo "Pronto para virar. O site VELHO continua no ar; nada mudou para quem entra."
  echo "Confira a nova, de fora, com o certificado dela:"
  echo "  curl --resolve ${DOMINIO}:443:${NOVA#*@} https://${DOMINIO}/api/saude"
  ;;

virar)
  titulo "Parando o site e a esteira na máquina VELHA (a partir daqui ninguém grava lá)"
  velha 'cd /opt/fio/infra && docker compose stop fio esteira'
  abrir_ponte
  titulo "Copiando o que mudou desde a preparação"
  copiar_pasta
  copiar_volume infra_dados
  fechar_ponte

  titulo "Subindo tudo na máquina NOVA"
  nova 'cd /opt/fio/infra && docker compose up -d --build'
  sleep 8
  nova "curl -s -o /dev/null -w 'site local: %{http_code}\n' http://127.0.0.1:8787/api/saude"

  titulo "Na máquina VELHA, uma página honesta para quem ainda cair lá"
  velha "cat > /opt/fio/caddy/fiolib.caddy <<'FIM'
# A Fiolib mudou de máquina. Enquanto o DNS não termina de virar, quem cair
# aqui recebe um aviso curto — e nunca uma segunda cópia do site gravando.
${DOMINIO}, www.${DOMINIO}, fiolib.duckdns.org {
	handle {
		respond \"A Fiolib está mudando de casa. Atualize a página em alguns minutos.\" 503 {
			close
		}
	}
}
FIM"
  velha 'docker exec infra-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true'
  echo
  echo "AGORA: troque o DNS no Registro.br — registro A de ${DOMINIO} para ${NOVA#*@}."
  echo "Depois rode:  bash infra/mudar-de-vps.sh conferir"
  ;;

conferir)
  titulo "De fora, pelo DNS (o que o mundo vê)"
  for u in / /api/saude /livros /sitemap.xml; do
    printf '%s %-14s' "$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMINIO}${u}")" "$u"
    curl -s -o /dev/null -w 'ip=%{remote_ip}\n' "https://${DOMINIO}${u}"
  done
  titulo "Forçando a máquina NOVA (mesmo antes de o DNS virar)"
  curl -s -o /dev/null -w 'saude na nova: %{http_code}\n' --resolve "${DOMINIO}:443:${NOVA#*@}" "https://${DOMINIO}/api/saude"
  titulo "Containers"
  nova "docker ps --format '{{.Names}} {{.Status}}'"
  ;;

*)
  echo "uso: bash infra/mudar-de-vps.sh preparar|virar|conferir"; exit 1;;
esac
