#!/usr/bin/env bash
# Os comandos de emergência da Fiolib, do seu computador para a VPS.
#
#   bash infra/fio.sh estado              o que está rodando, e a saúde do site
#   bash infra/fio.sh site ligar          sobe o site (e a esteira junto)
#   bash infra/fio.sh site desligar       derruba o site DE VERDADE (processo parado)
#   bash infra/fio.sh site reiniciar      desliga e liga o site
#   bash infra/fio.sh esteira ligar       sobe a esteira de tradução
#   bash infra/fio.sh esteira desligar    para a esteira (o livro em curso retoma depois)
#   bash infra/fio.sh esteira reiniciar
#   bash infra/fio.sh log site            as últimas linhas do site
#   bash infra/fio.sh log esteira         as últimas linhas da esteira
#   bash infra/fio.sh manutencao sair     tira o "voltamos já" ligado pelo painel
#   bash infra/fio.sh backup              faz um backup do banco agora
#   bash infra/fio.sh copia               traz uma cópia do site para este PC
#
# No dia a dia, use o PAINEL (aba Controle): ele liga e desliga a esteira e
# "desliga" o site para os leitores sem parar nada. Estes comandos são para
# quando o painel não abre. Nada aqui fica rodando no seu computador: cada
# comando entra na VPS, faz a coisa e sai.
set -euo pipefail
MAQUINA="${MAQUINA:-root@2.25.210.20}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
COMPOSE="docker compose -f /opt/fio/infra/docker-compose.yml"

vps() {
  local t c
  for t in 1 2 3 4; do
    ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$MAQUINA" "$@" && return 0
    c=$?; [[ $c -eq 255 ]] || return $c
    echo "(a conexão caiu; tentando de novo)" >&2; sleep $((t * 3))
  done
  return 255
}
servico() { case "$1" in site) echo fio ;; esteira) echo esteira ;; *) echo "use: site ou esteira" >&2; exit 1 ;; esac; }

case "${1:-estado}" in
  estado)
    vps "docker ps -a --filter name=infra- --format '{{.Names}}: {{.Status}}'; echo; echo -n 'saúde do site: '; curl -s --max-time 5 http://127.0.0.1:8787/api/saude || echo 'NÃO RESPONDE'; echo; echo -n 'de fora: '; curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 https://fiolib.com.br/"
    ;;
  site|esteira)
    s=$(servico "$1")
    case "${2:-}" in
      ligar) vps "$COMPOSE up -d $s" ;;
      desligar) vps "$COMPOSE stop $s" ;;
      reiniciar) vps "$COMPOSE restart $s" ;;
      *) echo "use: $1 ligar | desligar | reiniciar" >&2; exit 1 ;;
    esac
    vps "docker ps -a --filter name=infra- --format '{{.Names}}: {{.Status}}'"
    ;;
  log)
    s=$(servico "${2:-site}")
    vps "$COMPOSE logs --tail 60 $s"
    ;;
  manutencao)
    [[ "${2:-}" == sair ]] || { echo "use: manutencao sair" >&2; exit 1; }
    vps "$COMPOSE exec -T fio node -e \"const{DatabaseSync}=require('node:sqlite');new DatabaseSync('/dados/catalogo.db').prepare(\\\"UPDATE ajuste SET valor='nao' WHERE chave='manutencao'\\\").run();console.log('site religado para os leitores')\""
    ;;
  backup)
    vps "bash /opt/fio/infra/backup.sh"
    ;;
  copia)
    node "$(dirname "$0")/copiar-do-ar.mjs"
    ;;
  *)
    sed -n '2,15p' "$0"; exit 1 ;;
esac
