#!/bin/bash
# O detector, de ponta a ponta. Roda NA VPS (cron ou à mão):
#
#   bash /opt/fio/infra/detector.sh
#
# Só LÊ o banco do site. Escreve em /dados/achados.db e /dados/achados/.
# Apagar os dois desfaz tudo o que ele fez.
set -euo pipefail
VOL=/var/lib/docker/volumes/infra_dados/_data/achados
echo "1/3 exportando palavras (só leitura)"
docker exec infra-fio-1 node --no-warnings /app/ingestao/detector.mjs exportar
echo "2/3 corretor pt-BR (hunspell, no host)"
hunspell -d pt_BR -l < $VOL/palavras.txt | sort -u > $VOL/erradas.txt
wc -l < $VOL/erradas.txt
echo "   grafias antigas: a forma de hoje existe no dicionário?"
docker exec infra-fio-1 node --no-warnings /app/ingestao/detector.mjs candidatos
hunspell -d pt_BR -l < $VOL/candidatos.txt | sort -u > $VOL/candidatos-erradas.txt
echo "3/3 analisando"
docker exec infra-fio-1 node --no-warnings /app/ingestao/detector.mjs analisar
docker exec infra-fio-1 node --no-warnings /app/ingestao/detector.mjs resumo
