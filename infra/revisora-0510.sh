#!/bin/bash
# 05/10/2026 — a revisora passa a retraduzir FRASE A FRASE, com a trava contra
# frase inventada, e volta a trabalhar nos livros que ainda têm trecho grande
# na língua de origem. Roda do PC:
#
#   bash infra/revisora-0510.sh
#
# Só troca dois arquivos do servidor e reconstrói SÓ a revisora: o site e a
# esteira não são tocados.
# Desfazer o código: servidor/*.antes-0510.mjs.bak na VPS.
# Desfazer o texto: painel -> Esteira -> revisora -> "desfazer tudo" (byte a byte).
set -euo pipefail
cd "$(dirname "$0")/.."
K=~/.ssh/fiolib-deploy
V=root@2.25.210.20

echo '1/4 testes'
node --test servidor/testes.mjs > /dev/null && echo '    ok'

echo '2/4 enviando'
scp -q -i $K servidor/revisao.mjs servidor/revisor-trabalhador.mjs servidor/testes.mjs infra/revisora-0510/refila.mjs $V:/tmp/

ssh -i $K $V 'set -e
cd /opt/fio/servidor
[ -f revisao.antes-0510.mjs.bak ] || cp revisao.mjs revisao.antes-0510.mjs.bak
[ -f revisor-trabalhador.antes-0510.mjs.bak ] || cp revisor-trabalhador.mjs revisor-trabalhador.antes-0510.mjs.bak
cp /tmp/revisao.mjs /tmp/revisor-trabalhador.mjs /tmp/testes.mjs .

echo "3/4 fila e modo"
docker cp /tmp/refila.mjs infra-fio-1:/tmp/refila.mjs
docker exec infra-fio-1 node --no-warnings /tmp/refila.mjs

echo "4/4 reconstruindo só a revisora"
cd /opt/fio/infra
docker compose build revisora 2>&1 | tail -2
docker compose up -d --no-deps revisora 2>&1 | tail -1
sleep 8
docker logs --tail 5 infra-revisora-1 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings'

echo
echo 'pronto. Acompanhe no painel, aba Esteira, logo abaixo da esteira.'
