#!/usr/bin/env bash
# Publica os JSONs de idiomas (web/public/dados/idiomas/*.json) na VPS.
#
#   bash infra/publicar-idiomas.sh              # todos os idiomas
#   bash infra/publicar-idiomas.sh ingles.json  # só o(s) que você disser
#
# Necessário porque publicar-paginas.sh envia só *.html/*.js/*.css e
# não toca /dados — os JSONs dos cursos precisam deste script próprio.

set -euo pipefail

MAQUINA="${MAQUINA:-root@2.25.210.20}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
SITE_REMOTO=/opt/fio/site/dados/idiomas

cd "$(dirname "$0")/../web/public/dados/idiomas"

remoto() {
  local t c
  for t in 1 2 3 4 5; do
    ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$MAQUINA" "$@" && return 0
    c=$?; [[ $c -eq 255 ]] || return $c
    echo "    (a conexão caiu; tentando de novo)" >&2; sleep $((t * 4))
  done
  return 255
}

if [[ $# -gt 0 ]]; then ARQUIVOS=("$@"); else
  mapfile -t ARQUIVOS < <(ls *.json 2>/dev/null)
fi
for a in "${ARQUIVOS[@]}"; do [[ -f "$a" ]] || { echo "não existe: $a"; exit 1; }; done

echo "==> enviando ${#ARQUIVOS[@]} arquivo(s) para $SITE_REMOTO"
tar czf - "${ARQUIVOS[@]}" | remoto "mkdir -p $SITE_REMOTO && tar xzf - -C $SITE_REMOTO"

echo "==> verificando"
for a in "${ARQUIVOS[@]}"; do
  remoto "test -f $SITE_REMOTO/$a && echo '    ok: $a'"
done
echo "==> pronto"
