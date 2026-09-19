# Fiolib sem depender do Wallt — o plano

Pedido do dono em 19/09/2026: os dois projetos separados, a Fiolib como a
principal, e o Wallt podendo morrer sem levar nada junto. Este era o plano.

**EXECUTADO em 19/09/2026, fim da tarde** (o dono avisou que a VPS e os dois
projetos são só dele e que o Wallt não vai mais ser usado): o Caddy é da
Fiolib, o Wallt é convidado, os certificados vieram copiados, e a VPS foi
reiniciada em seguida (kernel 6.8.0-139). A troca levou uns 3 segundos fora
do ar. O passo 5 (tirar o `caddy` do compose do Wallt) virou um perfil:
`profiles: [caddy-proprio]`. Ver docs/VPS.md.

## Onde está hoje

| O quê | De quem é | A Fiolib depende? |
|---|---|---|
| Containers, rede, volumes, `.env`, backups, chave de deploy | cada um tem o seu | não |
| Configuração do Caddy da Fiolib | Fiolib (`/opt/fio/caddy/fiolib.caddy`, desde 19/09) | não |
| **O Caddy em si** (o programa que atende 80/443 e renova os certificados) | **Wallt** (`/opt/picord`, container `picord-caddy-1`) | **sim** |
| Login com Google | cada um tem o seu projeto no Google Cloud | não |
| A máquina (memória, disco, root) | dividida | sim, e continua |

A única dependência de verdade é o Caddy: se alguém apagar `/opt/picord` ou
der `docker compose down` no Wallt, o fiolib.com.br cai junto.

## O plano: inverter quem é dono do Caddy

O Caddy passa a ser da Fiolib, e o Wallt vira convidado — o mesmo arranjo de
hoje, virado ao contrário.

1. **Um Caddy na pasta da Fiolib.** Um serviço `caddy` novo no
   `/opt/fio/infra/docker-compose.yml`, com `network_mode: host`, lendo
   `/opt/fio/caddy/Caddyfile`, que tem os blocos da Fiolib e termina com
   `import /etc/caddy/convidados/*.caddy`.
2. **O Wallt como convidado.** O Caddyfile do Wallt (os blocos dele, com
   `{$DOMINIO}` trocado pelo domínio escrito) vira
   `/opt/fio/caddy/convidados/wallt.caddy`. A pasta `/opt/picord/site` é montada
   só leitura no Caddy novo, em `/srv/site`, como hoje.
3. **Os certificados.** Copiar o volume `picord_caddy_data` para o volume do
   Caddy novo antes de trocar: sem isso ele pede certificado novo para todos os
   domínios de uma vez, e o Let's Encrypt tem limite por semana.
4. **A troca**, numa madrugada, combinada com o Nathan (1 a 2 minutos fora do
   ar para os dois):
   `docker compose -f /opt/picord/docker-compose.yml stop caddy` e em seguida
   `docker compose -f /opt/fio/infra/docker-compose.yml up -d caddy`.
   Conferir os dois sites; se algo falhar, parar o novo e subir o antigo de
   volta (nada foi apagado).
5. **Depois de uma semana estável**, tirar o serviço `caddy` do compose do
   Wallt.

Quando o Wallt morrer: apagar `/opt/fio/caddy/convidados/wallt.caddy`,
recarregar o Caddy, e depois `/opt/picord` inteiro. A Fiolib não percebe.

## Quanto trabalho e o que pode quebrar

- Umas duas horas, a maior parte conferindo.
- O risco é a janela da troca e os certificados (item 3). O LiveKit do Wallt
  usa o Caddy para `/rtc`; a chamada de vídeo em andamento cai e reconecta.
- O deploy automático do Wallt (GitHub Actions) só copia arquivos para
  `/opt/picord/site`; continua funcionando sem mudança.
