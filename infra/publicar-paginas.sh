#!/usr/bin/env bash
# Publica as páginas soltas do site (web/public/*.html, *.js, *.css) na VPS.
#
#   bash infra/publicar-paginas.sh              # todas as páginas soltas
#   bash infra/publicar-paginas.sh admin.js     # só as que você disser
#
# NÃO mexe no app (index.html e /ativos, o bundle remendado — ver
# infra/remendar-bundle.mjs) nem em /dados, /capas e /quadrinhos. Antes de
# trocar, guarda o que estava lá em /opt/fio/backups/paginas-<data>, e no fim
# pergunta a cada página, de fora, se ela abre.
#
# Existe porque este passo era feito à mão, arquivo por arquivo, com scp — e
# em 19/09 o fio-api.js novo só funcionou porque alguém lembrou de pôr a tag
# dele no index.html também. Este script confere isso.

set -euo pipefail

MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
SITE_REMOTO=/opt/fio/site
ENDERECO="${ENDERECO:-https://fiolib.com.br}"

cd "$(dirname "$0")/../web/public"
# Nova tentativa quando o sshd derruba a conexão (código 255): os robôs de
# invasão lotam a fila dele (MaxStartups). Ver publicar-so-servidor.sh.
remoto() {
  local t c
  for t in 1 2 3 4 5; do
    ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$MAQUINA" "$@" && return 0
    c=$?; [[ $c -eq 255 ]] || return $c
    echo "    (a conexão caiu; tentando de novo)" >&2; sleep $((t * 4))
  done
  return 255
}
PACOTE=$(mktemp)
trap 'rm -f "$PACOTE"' EXIT

if [[ $# -gt 0 ]]; then ARQUIVOS=("$@"); else
  # as páginas soltas: tudo que é html/js/css aqui, menos o que é do app
  mapfile -t ARQUIVOS < <(ls *.html *.js *.css 2>/dev/null | grep -v '^index\.html$')
fi
for a in "${ARQUIVOS[@]}"; do [[ -f "$a" ]] || { echo "não existe: $a"; exit 1; }; done

QUANDO=$(date +%Y%m%d-%H%M%S)
echo "==> guardando o que está no ar em /opt/fio/backups/paginas-$QUANDO"
remoto "mkdir -p /opt/fio/backups/paginas-$QUANDO && cd $SITE_REMOTO && for f in ${ARQUIVOS[*]}; do [ -f \"\$f\" ] && cp \"\$f\" /opt/fio/backups/paginas-$QUANDO/; done; true"

echo "==> enviando ${#ARQUIVOS[@]} arquivo(s)"
tar czf "$PACOTE" "${ARQUIVOS[@]}" && remoto "tar xzf - -C $SITE_REMOTO" < "$PACOTE"

# O app carrega /fio-dono.js e /fio-api.js antes de tudo; sem eles, os
# scripts de fora do bundle (fio-leitor, fio-app-extras) quebram.
echo "==> conferindo o index do app"
remoto "grep -q '/fio-dono.js' $SITE_REMOTO/index.html && grep -q '/fio-api.js' $SITE_REMOTO/index.html" \
  || { echo "    ATENÇÃO: index.html sem /fio-dono.js ou /fio-api.js (ver infra/remendar-bundle.mjs)"; exit 1; }

echo "==> conferindo de fora"
falhou=0
for a in "${ARQUIVOS[@]}"; do
  codigo=$(curl -s -o /dev/null -w '%{http_code}' "$ENDERECO/$a")
  [[ "$codigo" == 200 ]] || { echo "    $a -> HTTP $codigo"; falhou=1; }
done
[[ $falhou == 0 ]] && echo "    todas respondem 200" || { echo "    para voltar: cp /opt/fio/backups/paginas-$QUANDO/* $SITE_REMOTO/"; exit 1; }
