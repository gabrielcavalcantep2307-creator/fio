#!/usr/bin/env bash
# Sobe para a VPS tudo que a esteira já traduziu, e publica.
#
#   bash infra/subir-traducoes.sh
#
# Pode rodar a qualquer momento, inclusive com a esteira ainda andando: ele
# leva o que está pronto e ignora o resto. Rodar duas vezes não duplica nada —
# `instalar-traducao.mjs` apaga a tradução anterior da mesma obra antes de
# gravar.
#
# ─────────────────────────────────────────────────────────────
# OS QUATRO PASSOS, E POR QUE NENHUM PODE FALTAR
#
#   1. INSTALAR põe o texto no banco.
#   2. REINDEXAR ensina a busca. Sem isto o livro existe e não é encontrado
#      por ninguém que procure uma frase dele.
#   3. REPUBLICAR reescreve `site/dados/catalogo.json`, que é um arquivo
#      ESTÁTICO. O site inteiro lê dali: prateleira, capa, e o botão de ler.
#   4. CONFERIR pergunta ao site, de fora, se o livro abriu.
#
# O passo 3 é o que faltou e custou caro. O banco tinha A Revolução dos Bichos
# desde 09/09 e o site seguia mostrando "não podemos servir", porque o
# catálogo estático era de 07/09. Quem olhava o banco via o livro; quem olhava
# o site, não. Escrever no banco não publica nada.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/picord-deploy}"
CASA=/opt/fio

cd "$(dirname "$0")/.."
remoto() { ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$MAQUINA" "$@"; }

PRONTOS=$(ls dados/traducoes/obra*.json 2>/dev/null | wc -l)
if [[ "$PRONTOS" -eq 0 ]]; then
  echo "nada traduzido ainda em dados/traducoes/"
  exit 0
fi

echo "==> $PRONTOS traduções prontas; enviando"
remoto "mkdir -p $CASA/entrada/trad"
scp -i "$CHAVE" dados/traducoes/obra*.json "$MAQUINA:$CASA/entrada/trad/" > /dev/null

# Os scripts vão junto. O container só recebe `servidor/` no deploy normal,
# então a ingestão precisa ser levada a cada rodada — e levar sempre é melhor
# que levar uma vez, porque assim o que roda lá é o que está no git aqui.
echo "==> levando os scripts de ingestão"
scp -i "$CHAVE" ingestao/instalar-lote.mjs ingestao/instalar-traducao.mjs   ingestao/normalizar.mjs ingestao/publicar.mjs "$MAQUINA:$CASA/entrada/" > /dev/null
remoto "
  docker exec infra-fio-1 mkdir -p /app/ingestao
  for f in instalar-lote.mjs instalar-traducao.mjs normalizar.mjs publicar.mjs; do
    docker cp $CASA/entrada/\$f infra-fio-1:/app/ingestao/ > /dev/null
  done
  docker exec --user root infra-fio-1 chown -R 1717:1717 /app/ingestao"

echo "==> instalando no catálogo"
remoto "
  docker exec infra-fio-1 mkdir -p /app/dados/traducoes
  for f in $CASA/entrada/trad/*.json; do docker cp \$f infra-fio-1:/app/dados/traducoes/ > /dev/null; done
  docker exec --user root infra-fio-1 chown -R 1717:1717 /app/dados
  docker exec infra-fio-1 node /app/ingestao/instalar-lote.mjs --banco /dados/catalogo.db
" 2>&1 | grep -viE 'experimental|trace-warn' || true

echo "==> reindexando a busca"
remoto "docker exec infra-fio-1 node /app/servidor/reindexar.mjs" 2>&1 | tail -1

echo "==> republicando o catálogo do site"
remoto "
  docker exec --user root infra-fio-1 sh -c 'mkdir -p /tmp/dados && chown -R 1717:1717 /tmp/dados'
  docker exec infra-fio-1 node /app/ingestao/publicar.mjs --saida /tmp/dados
" 2>&1 | grep -viE 'experimental|trace-warn' || true

remoto "
  set -e
  docker cp infra-fio-1:/tmp/dados/catalogo.json $CASA/site/dados/catalogo.json
  rm -rf $CASA/site/dados/fichas.novo
  docker cp infra-fio-1:/tmp/dados/fichas $CASA/site/dados/fichas.novo
  rm -rf $CASA/site/dados/fichas
  mv $CASA/site/dados/fichas.novo $CASA/site/dados/fichas
  chown -R 197608:197121 $CASA/site/dados
  rm -rf $CASA/entrada/trad
"

echo "==> conferindo de fora"
GERADO=$(curl -s https://fiolib.duckdns.org/dados/catalogo.json | head -c 40)
echo "    $GERADO"
for id in $(ls dados/traducoes/obra*.json | sed 's/[^0-9]//g' | head -5); do
  CODIGO=$(curl -s -o /dev/null -w '%{http_code}' "https://fiolib.duckdns.org/api/livro/$id")
  echo "    obra $id -> HTTP $CODIGO"
done
