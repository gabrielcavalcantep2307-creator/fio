#!/bin/bash
# 02/10/2026 — conserto da seção "Chegaram agora" e dos 40 livros da esteira
# de 29/09: título em português, autor ligado à pessoa que já existia, capa
# desenhada, capa de reserva no site, e o raio-x das traduções. Roda do PC:
#
#   bash infra/conserto-0210.sh
#
# Desfazer o banco: a cópia de antes fica em /dados/catalogo.antes-titulos-20261002.db
# Desfazer o site: /opt/fio/site/fio-app-extras.antes-0210.js e fio-visual.antes-0210.css
set -euo pipefail
cd "$(dirname "$0")/.."
K=~/.ssh/fiolib-deploy
V=root@2.25.210.20

echo '1/5 enviando capas e scripts'
ssh -i $K $V 'rm -rf /tmp/conserto-0210'
scp -q -i $K -r infra/conserto-0210 $V:/tmp/conserto-0210
scp -q -i $K web/public/fio-app-extras.js web/public/fio-visual.css ingestao/conferir-traducao.mjs $V:/tmp/conserto-0210/

ssh -i $K $V 'set -e
cd /tmp/conserto-0210
cp -n capas/des-*.svg /opt/fio/site/capas/

echo "2/5 cópia do banco + títulos"
docker cp titulos.json infra-fio-1:/tmp/titulos.json
docker cp aplicar.mjs infra-fio-1:/tmp/aplicar.mjs
docker exec infra-fio-1 node --no-warnings /tmp/aplicar.mjs

echo "3/5 republicando o catálogo"
docker cp publicar.mjs infra-esteira-1:/tmp/publicar.mjs
docker exec infra-esteira-1 node --no-warnings /tmp/publicar.mjs

echo "4/5 capa de reserva no site"
cp -n /opt/fio/site/fio-app-extras.js /opt/fio/site/fio-app-extras.antes-0210.js
cp -n /opt/fio/site/fio-visual.css /opt/fio/site/fio-visual.antes-0210.css
cp fio-app-extras.js fio-visual.css /opt/fio/site/
echo "5/5 (o raio-x já rodou em 02/10: /root/raiox-0210.txt)"'

echo
echo 'pronto. Falta um clique: painel -> Controle -> revisora em "propor".'
