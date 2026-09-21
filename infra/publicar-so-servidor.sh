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

MAQUINA="${MAQUINA:-root@2.25.210.20}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/fiolib-deploy}"
CASA=/opt/fio

cd "$(dirname "$0")/.."
# O sshd da VPS derruba conexões novas quando os robôs que tentam invadir lotam
# a fila (MaxStartups) — em 19/09 o deploy caiu no meio assim. Código 255 é
# "a conexão caiu", não "o comando falhou": aí tenta de novo. Os comandos
# daqui são todos repetíveis (apagar e extrair de novo dá no mesmo).
remoto() {
  local t c
  for t in 1 2 3 4 5; do
    ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$MAQUINA" "$@" && return 0
    c=$?; [[ $c -eq 255 ]] || return $c
    echo "    (a conexão caiu; tentando de novo)" >&2; sleep $((t * 4))
  done
  return 255
}
# Para mandar um pacote pela entrada: a entrada é um ARQUIVO, e não um cano,
# para a nova tentativa mandar tudo de novo desde o começo.
PACOTE=$(mktemp)
trap 'rm -f "$PACOTE"' EXIT
enviar() { local c=$1; remoto "$c" < "$PACOTE"; }

echo "==> Testes (nenhum deploy sai daqui com teste vermelho)"
node --test servidor/testes.mjs > /dev/null
# E o contrato: toda rota responde como respondia, inclusive as recusas
# (servidor/contrato-rotas.mjs). Mudou de propósito? Grave de novo com --gravar.
node servidor/contrato-rotas.mjs 2>/dev/null | tail -1

echo "==> Guardando o que está lá, antes de trocar"
remoto "rm -rf $CASA/servidor.antes && cp -r $CASA/servidor $CASA/servidor.antes"

echo "==> Enviando servidor/, ingestao/ e infra/"
# Pasta nova, e não extração por cima: `tar xzf` só acrescenta, e arquivo que
# saiu do repositório ficava lá para sempre — em 16/09 a VPS ainda carregava o
# `email.mjs` apagado em 41cb983. A cópia de segurança já está em servidor.antes.
tar czf "$PACOTE" servidor && enviar "rm -rf $CASA/servidor && tar xzf - -C $CASA"
# A ingestão entra na imagem desde 18/09/2026: é o que o serviço `esteira`
# roda. Mesma regra: pasta nova, nada de arquivo velho sobrando.
tar czf "$PACOTE" ingestao && enviar "rm -rf $CASA/ingestao && tar xzf - -C $CASA"
# Só servidor/ e ingestao/ entram no contexto do build — sem isto o Docker
# empacotava site/ e backups/ (gigabytes) a cada reconstrução.
remoto "printf '%s\n' '*' '!servidor/' '!ingestao/' > $CASA/.dockerignore"
tar czf "$PACOTE" -C infra Dockerfile docker-compose.yml backup.sh estado-maquina.sh Caddyfile Caddyfile.fiolib \
  && enviar "rm -f $CASA/infra/Caddyfile.fio && tar xzf - -C $CASA/infra"

# A versão que vai ao ar, para a aba Controle do painel dizer qual é.
VERSAO=$(git rev-parse --short HEAD 2>/dev/null || echo '?')$(git diff --quiet 2>/dev/null || echo '+')
remoto "mkdir -p $CASA/estado && chmod 755 $CASA/estado && printf '{\"commit\":\"%s\",\"quando\":\"%s\"}\n' '$VERSAO' \"$(date -u +%FT%TZ)\" > $CASA/estado/versao.json && chmod 644 $CASA/estado/versao.json"

echo "==> Reconstruindo a imagem"
# A esteira (usuário 1717 no container) reescreve catalogo.json e fichas/.
remoto "chown -R 1717:1717 $CASA/site/dados"
remoto "cd $CASA/infra && docker compose up -d --build"

echo "==> Conferindo"
sleep 5
SAUDE=$(remoto "curl -s --max-time 10 http://127.0.0.1:8787/api/saude" || true)
echo "    $SAUDE"
ESTEIRA=$(remoto "docker inspect -f '{{.State.Status}} (reiniciou {{.RestartCount}}x)' infra-esteira-1; docker logs --tail 3 infra-esteira-1 2>&1" || true)
echo "    esteira: $ESTEIRA"

# A porta da casa é o motivo desta rodada. Se ela não fechou, o deploy não
# valeu, e é melhor gritar aqui do que descobrir por um cadastro estranho.
# Desde 15/09 a porta também se abre pelo painel (Configurações → cadastro
# aberto), então "aberta" pode ser decisão do dono. O aviso diz de onde vem.
case "$SAUDE" in
  *'"convite":"obrigatorio"'*)
    echo "    OK: a porta está fechada, entra quem tem convite." ;;
  *'"convite":"opcional"'*)
    echo "    A porta está ABERTA (cadastro sem convite). Se foi o interruptor do"
    echo "    painel, está certo. Se não foi, confira FIO_CONVITE no $CASA/infra/.env."
    echo "    Para voltar ao servidor anterior: $CASA/servidor.antes" ;;
  *)
    echo "    ATENÇÃO: o servidor não respondeu a saúde. Para voltar: $CASA/servidor.antes" ;;
esac
