#!/usr/bin/env bash
# Põe a produção em dia, do jeito que ela estiver atrasada.
#
#   bash infra/pendente.sh
#
# Pode rodar a qualquer hora e quantas vezes quiser: cada passo confere antes
# se precisa ser feito. Existe porque em 11/09/2026 o SSH da VPS caiu no meio
# de um deploy e deixou a produção num estado misto — banco migrado, servidor
# velho — e a lista do que faltava virou coisa de decorar.
#
# ─────────────────────────────────────────────────────────────
# O ESTADO MISTO, que é o motivo de este arquivo existir
#
# A migração do nome de usuário rodou no banco de produção. O deploy do
# servidor que sabe usá-la não rodou, porque a porta 22 parou de responder
# entre um e outro.
#
# Com o banco novo e o servidor velho: ENTRAR funciona, porque a coluna de
# e-mail continua lá. CRIAR CONTA não, porque o `INSERT` antigo não preenche
# `usuario`, que agora é obrigatório.
#
# Nada disso é perda de dado. É um degrau, e este script é quem o sobe.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

MAQUINA="${MAQUINA:-root@142.93.57.2}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/picord-deploy}"
SITE="${SITE:-https://fiolib.duckdns.org}"

cd "$(dirname "$0")/.."
remoto() { ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$MAQUINA" "$@"; }

echo "==> a VPS responde?"
if ! remoto "echo ok" > /dev/null 2>&1; then
  echo "    NÃO. A porta 22 segue fechada; nada foi feito."
  echo "    O site em si pode estar de pé — ele atende na 443, que é outra porta:"
  curl -s --max-time 15 "$SITE/api/saude" || true
  echo
  exit 1
fi
echo "    sim"

# ── 1. o servidor ──
#
# `publicar-so-servidor.sh` roda os testes antes e guarda uma cópia do que
# estava lá. Ele NÃO encosta em /opt/fio/site, que é o único lugar onde mora
# a interface nova — cujo fonte não existe em lugar nenhum.
echo
echo "==> servidor"
bash infra/publicar-so-servidor.sh

# ── 2. os livros que a esteira já traduziu ──
#
# Instala, reindexa a busca e REPUBLICA o catálogo estático. O terceiro passo
# é o que faltava em 11/09: o site não lê o banco, lê um arquivo.
echo
echo "==> livros traduzidos"
if ls dados/traducoes/obra*.json > /dev/null 2>&1; then
  bash infra/subir-traducoes.sh
else
  echo "    nenhum esperando"
fi

# ── 3. conferir de fora, que é a única conferência que conta ──
echo
echo "==> conferindo pelo site, de fora"
printf '    saúde .......... %s\n' "$(curl -s --max-time 15 "$SITE/api/saude")"
printf '    nome livre ..... %s\n' "$(curl -s --max-time 15 "$SITE/api/nome-livre?u=umnomelivre123")"
printf '    catálogo ....... %s\n' "$(curl -s --max-time 15 "$SITE/dados/catalogo.json" | head -c 32)"

echo
echo "Se 'nome livre' respondeu com {\"livre\":true}, o servidor novo está no ar"
echo "e criar conta voltou a funcionar."
