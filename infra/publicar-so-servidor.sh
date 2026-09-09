#!/usr/bin/env bash
# Publica SÓ o servidor. Não encosta no site.
#
#   bash infra/publicar-so-servidor.sh
#
# ─────────────────────────────────────────────────────────────
# POR QUE ESTE ARQUIVO EXISTE, E POR QUE `publicar.sh --servidor` NÃO SERVE
#
# `publicar.sh --servidor` manda o servidor E reconstrói o site a partir de
# `web/`. Isso hoje é destrutivo: o site que está no ar tem a tela de
# perguntas de segurança, a busca dentro dos livros e as resenhas, e o
# `web/src` deste repositório NÃO tem nada disso — o fonte daquela versão
# nunca foi commitado, o deploy só levava o `dist`, e não há sourcemap.
#
# Ou seja: o site em produção é a ÚNICA cópia da interface nova, e ele existe
# só como bundle minificado. Rodar `publicar.sh` sobrescreve essa pasta com um
# build do fonte velho, e a interface nova acaba ali.
#
# Enquanto o `web/src` não for reescrito para alcançar o que está no ar, o
# caminho seguro para mexer no servidor é este arquivo.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/picord-deploy}"
CASA=/opt/fio

cd "$(dirname "$0")/.."
remoto() { ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$MAQUINA" "$@"; }

echo "==> Testes (nenhum deploy sai daqui com teste vermelho)"
node --test servidor/testes.mjs > /dev/null

echo "==> Guardando o que está lá, antes de trocar"
remoto "rm -rf $CASA/servidor.antes && cp -r $CASA/servidor $CASA/servidor.antes"

echo "==> Enviando servidor/ e infra/"
tar czf - servidor | remoto "tar xzf - -C $CASA"
tar czf - -C infra Dockerfile docker-compose.yml backup.sh Caddyfile.fio \
  | remoto "tar xzf - -C $CASA/infra"

echo "==> Reconstruindo a imagem"
remoto "cd $CASA/infra && docker compose up -d --build"

echo "==> Conferindo"
sleep 5
SAUDE=$(remoto "curl -s --max-time 10 http://127.0.0.1:8787/api/saude" || true)
echo "    $SAUDE"

# A porta da casa é o motivo desta rodada. Se ela não fechou, o deploy não
# valeu, e é melhor gritar aqui do que descobrir por um cadastro estranho.
case "$SAUDE" in
  *'"convite":"obrigatorio"'*)
    echo "    OK: a porta está fechada, entra quem tem convite." ;;
  *)
    echo "    ATENÇÃO: a porta NÃO está fechada. Confira FIO_CONVITE no"
    echo "    $CASA/infra/.env e no docker-compose.yml, e rode de novo."
    echo "    Para voltar ao que estava: $CASA/servidor.antes" ;;
esac
