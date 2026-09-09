#!/usr/bin/env bash
# Publica o Fio na VPS.
#
#   bash infra/publicar.sh                 # site (o caso de todo dia)
#   bash infra/publicar.sh --servidor      # site + código do servidor
#   bash infra/publicar.sh --catalogo      # site + catálogo (demora: ~75 MB)
#   bash infra/publicar.sh --tudo          # os três
#
# Três coisas mudam em ritmos diferentes, e por isso são três passos:
#
#   o SITE       muda toda hora. É uma pasta; trocar não derruba ninguém.
#   o SERVIDOR   muda pouco. Está DENTRO da imagem, então exige reconstruir.
#   o CATÁLOGO   muda quando a ingestão roda. São 75 MB, e ele é FUNDIDO no
#                banco de produção — nunca copiado por cima, porque lá dentro
#                tem conta de gente. Ver servidor/fundir.mjs.
#
# Usa tar sobre ssh em vez de rsync: rsync não existe no Git Bash do Windows,
# e o que se manda aqui é sempre a pasta inteira mesmo.

set -euo pipefail

MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/picord-deploy}"
DOMINIO="${DOMINIO:-fio.142-93-57-2.sslip.io}"
CASA=/opt/fio

cd "$(dirname "$0")/.."
remoto() { ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$MAQUINA" "$@"; }
enviar() { tar czf - "$@"; }

TUDO=${1:-}
[[ "$TUDO" == "--tudo" ]] && SERVIDOR=1 && CATALOGO=1
[[ "${1:-}" == "--servidor" ]] && SERVIDOR=1
[[ "${1:-}" == "--catalogo" ]] && CATALOGO=1

echo "==> Conferindo tipos e testes"
npm --prefix web exec tsc -- -b
node --test servidor/testes.mjs > /dev/null

# ─────────────────────────────────────────────────────────────
# TRAVA: o site em produção é a única cópia da interface nova
#
# O que está no ar tem tela de perguntas de segurança, busca dentro dos livros
# e resenhas. O `web/src` deste repositório não tem — aquele fonte nunca foi
# commitado, o deploy levava só o `dist`, e não há sourcemap para desfazer.
#
# Publicar o site daqui, hoje, apaga a interface nova e põe a velha no lugar.
# A trava procura no fonte um sinal de que ele já alcançou o que está no ar;
# enquanto não achar, recusa. Para mexer só no servidor:
# `bash infra/publicar-so-servidor.sh`.
# ─────────────────────────────────────────────────────────────
if ! grep -rqs "minhas-perguntas" web/src && [[ "${FORCAR_SITE:-}" != "1" ]]; then
  echo "RECUSADO: web/src ainda é a interface velha, sem perguntas de" >&2
  echo "  segurança, busca no texto nem resenhas. Publicar apagaria a" >&2
  echo "  interface que está no ar, que é a única cópia que existe dela." >&2
  echo "" >&2
  echo "  Para mexer só no servidor:  bash infra/publicar-so-servidor.sh" >&2
  echo "  Se você REALMENTE quer publicar este fonte:  FORCAR_SITE=1 $0 $*" >&2
  exit 1
fi

echo "==> Construindo o site"
npm --prefix web run build

echo "==> Enviando o site"
remoto "mkdir -p $CASA/site $CASA/entrada"
enviar -C web/dist . | remoto "rm -rf $CASA/site/* && tar xzf - -C $CASA/site"

if [[ -n "${SERVIDOR:-}" ]]; then
  echo "==> Enviando o servidor e reconstruindo"
  enviar servidor | remoto "tar xzf - -C $CASA"
  enviar -C infra Dockerfile docker-compose.yml backup.sh Caddyfile.fio | remoto "tar xzf - -C $CASA/infra"
  remoto "cd $CASA/infra && docker compose up -d --build"
fi

if [[ -n "${CATALOGO:-}" ]]; then
  echo "==> Enviando o catálogo (75 MB, comprimido no caminho)"
  node servidor/copia.mjs dados/enviar.db
  gzip -c dados/enviar.db | remoto "gunzip -c > $CASA/entrada/catalogo.db"
  rm -f dados/enviar.db

  echo "==> Fundindo (as contas ficam)"
  remoto "cd $CASA/infra && docker compose run --rm --user root -v $CASA/entrada:/entrada:ro fio \
    node servidor/fundir.mjs /entrada/catalogo.db 2>&1 | grep -viE 'experimental|trace-warn'"
  remoto "cd $CASA/infra && docker compose run --rm --user root fio chown -R 1717:1717 /dados >/dev/null"
  remoto "cd $CASA/infra && docker compose restart fio >/dev/null && rm -f $CASA/entrada/catalogo.db"
fi

echo "==> Conferindo"
sleep 3
curl -fsS "https://$DOMINIO/api/saude" && echo
ARQUIVO=$(grep -o 'ativos/index-[^"]*\.js' web/dist/index.html | head -1)
curl -fsS -o /dev/null -w "$ARQUIVO respondeu HTTP %{http_code}\n" "https://$DOMINIO/$ARQUIVO"
echo "Pronto: https://$DOMINIO"
