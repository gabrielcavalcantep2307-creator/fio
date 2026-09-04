# A VPS, e como publicar

O Fio está no ar em **<https://fiolib.duckdns.org>** — e também em
`fio.142-93-57-2.sslip.io`, que continua valendo — na mesma máquina do Wallt
(`142.93.57.2`, 2 GB de RAM, 48 GB de disco).

> **`fiolib.duckdns.org` só responde depois que o DuckDNS apontar para a
> VPS.** Hoje ele resolve para outro IP: ao criar o domínio, o DuckDNS grava o
> IP de quem criou. A correção é um clique — pôr `142.93.57.2` no campo e
> apertar **"atualizar ip"** no painel do DuckDNS. O Caddy já aceita o nome e
> pede o certificado sozinho no primeiro acesso depois disso.

```bash
bash infra/publicar.sh              # o caso de todo dia: só o site
bash infra/publicar.sh --servidor   # quando servidor/ mudou
bash infra/publicar.sh --catalogo   # quando a ingestão rodou
bash infra/publicar.sh --tudo
```

---

## A decisão que explica o resto: um processo só

O site e a API vêm do **mesmo processo** (`servidor/api.mjs`), na mesma origem.

A alternativa — site num lugar, API em outro — obriga a CORS e obriga o cookie
de sessão a atravessar origens, que é exatamente o que `SameSite` existe para
impedir. Juntando os dois:

- o cookie funciona sem exceção nenhuma;
- o CSRF fica trancado pelo próprio navegador;
- some uma classe inteira de bug de configuração (o clássico "funciona no meu
  computador e o login não entra em produção").

O Caddy fica na frente cuidando do TLS. O processo do Fio não sabe que ele
existe.

---

## O desenho

```
        internet
           │  443
           ▼
  ┌──────────────────┐
  │ Caddy (do Wallt) │  um só, para os dois sites. TLS automático.
  └────┬────────┬────┘
       │        │
       │        └──► waltt.duckdns.org      → /srv/site  (Wallt)
       │
       └──► fiolib.duckdns.org              → 127.0.0.1:8787
            fio.142-93-57-2.sslip.io  ┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │ container `fio`    │
                                          │ node servidor/     │
                                          │ usuário 1717       │
                                          └──┬──────────────┬──┘
                                             │              │
                                    /site (ro)          /dados
                                  o site construído   catalogo.db
```

**Dois nomes, e o de trás não é sobra.** `fio.142-93-57-2.sslip.io` devolve
`142.93.57.2` sem cadastrar DNS em lugar nenhum — o próprio nome carrega o IP.
Ele fica de pé como rede de segurança: no dia em que o DuckDNS estiver fora do
ar ou o domínio expirar, o site continua alcançável por um nome que não
depende de ninguém.

**Por que a porta é só `127.0.0.1:8787`.** Publicar em `0.0.0.0` seria deixar
o servidor **sem TLS** exposto ao lado do que tem TLS, e alguém acharia. Quem
fala com essa porta é o Caddy, da mesma máquina.

**Por que o container não roda como root.** Ele não precisa de privilégio
nenhum. No dia em que alguém achar um furo no servidor de arquivos, entra como
um usuário sem poder sobre a máquina.

---

## O que mudou no Wallt, e por quê

Uma linha, e ela foi feita para ser reversível:

```bash
# o bloco do Fio foi acrescentado ao fim do Caddyfile do Wallt
cat /opt/fio/infra/Caddyfile.fio >> /opt/picord/Caddyfile
docker exec picord-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

`caddy reload` troca a configuração **sem reiniciar o container** — ninguém
numa chamada do Wallt sentiu nada. A cópia anterior ficou em
`/opt/picord/Caddyfile.antes-do-fio`; desfazer é trocar de volta e recarregar.

Antes de aplicar, `caddy validate` conferiu a sintaxe. Um Caddyfile inválido
recarregado derruba **os dois sites** — validar não é zelo, é o que separa uma
mudança de um incidente.

> ### A armadilha que custou meia hora: bind mount de ARQUIVO segue o inode
>
> O Caddy monta `./Caddyfile` como **arquivo**, não como pasta. O Docker
> resolve isso pelo inode — e `sed -i`, `mv` e quase todo editor **não editam
> o arquivo: escrevem outro e trocam o nome**. O inode muda, o vínculo com o
> container quebra, e o container continua vendo o conteúdo antigo.
>
> O pior é o silêncio: no host o arquivo está certo, `caddy validate` diz
> "Valid configuration" (porque valida o que o container tem), o `reload`
> responde "adapted config to JSON", e **nada muda**. Duas mudanças minhas
> sumiram assim antes de eu conferir por dentro:
>
> ```bash
> docker exec picord-caddy-1 grep -c fiolib /etc/caddy/Caddyfile   # → 0
> ```
>
> Para editar sem quebrar, escreva **por dentro do arquivo**:
>
> ```bash
> cat novo > /opt/picord/Caddyfile     # trunca o mesmo inode: o vínculo sobrevive
> cat trecho >> /opt/picord/Caddyfile  # idem
> mv novo /opt/picord/Caddyfile        # QUEBRA
> sed -i 's/a/b/' /opt/picord/Caddyfile # QUEBRA
> ```
>
> Depois de quebrado, só recriar o container conserta:
> `docker compose up -d --force-recreate caddy` — dois segundos, e o LiveKit
> não é tocado, então quem está numa chamada não sente.
>
> **Confira sempre por dentro do container**, e não no host.

---

## Três ritmos, três passos

|  | Muda | Como vai | Derruba alguém? |
|---|---|---|---|
| **Site** | toda hora | pasta trocada em `/opt/fio/site` | não |
| **Servidor** | pouco | está **dentro da imagem** → reconstrói | ~2 s |
| **Catálogo** | quando a ingestão roda | 75 MB, **fundido** no banco | ~2 s |

O catálogo nunca é copiado por cima do banco de produção: lá dentro tem conta
de gente. `servidor/fundir.mjs` substitui as 19 tabelas de catálogo em bloco e
**não toca** nas 9 de gente — e imprime a contagem das duas coisas no fim, para
que "as contas sobreviveram" seja um número na tela e não uma esperança.

---

## Rodando na mão, na máquina

```bash
ssh -i ~/.ssh/picord-deploy root@142.93.57.2
cd /opt/fio/infra

docker compose ps                       # de pé?
docker compose logs -f fio              # o que está acontecendo
docker compose restart fio
docker compose up -d --build            # depois de mudar servidor/

# convites e contas
docker compose exec fio node servidor/convite.mjs "para o Ravi"
docker compose exec fio node servidor/convite.mjs --listar
docker compose exec fio node servidor/convite.mjs --admin gabriel@exemplo.com

# backup
bash /opt/fio/infra/backup.sh
```

### A primeira conta

Não há tela de "criar o primeiro administrador" — uma tela dessas fica aberta
na internet até alguém achar. Quem tem acesso à máquina convida:

```bash
docker compose exec fio node servidor/convite.mjs "primeiro"
# → FIO-DQBS-YLNP     (uso único, 14 dias; só aparece uma vez)
```

Crie a conta no site com esse código e depois promova:

```bash
docker compose exec fio node servidor/convite.mjs --admin seu@email.com
```

---

## Backup

```bash
bash /opt/fio/infra/backup.sh          # → /opt/fio/backups/catalogo-AAAAMMDD-HHMM.db.gz
```

Usa `VACUUM INTO`, e não `cp`. Copiar um SQLite em WAL durante uma escrita
produz um arquivo quebrado — quebrado de um jeito que só se descobre no dia em
que o backup for necessário.

Guarda 14 dias e apaga o resto: backup que ninguém limpa enche o disco e
derruba o serviço que ele existia para proteger.

Para rodar sozinho, toda madrugada:

```bash
echo '17 4 * * * bash /opt/fio/infra/backup.sh >> /var/log/fio-backup.log 2>&1' | crontab -
```

> **O que o backup NÃO cobre:** o catálogo, que é derivado e se refaz com a
> ingestão. O que importa ali dentro são as contas, as sessões e o que cada
> leitor marcou — e isso cabe em kilobytes.

---

## Variáveis

Ficam em `/opt/fio/infra/.env`, com permissão `600`.

| | |
|---|---|
| `FIO_SITE` | endereço público; monta o link de trocar senha |
| `FIO_ORIGENS` | **vazio em produção** = só a própria origem aceita |
| `FIO_INSEGURO` | `1` tira o `Secure` do cookie. **Só em localhost.** |
| `FIO_EMAIL_CHAVE` | vazio ⇒ o link de trocar senha sai **no log** em vez de por e-mail |
| `FIO_BANCO`, `FIO_ESTATICO` | caminhos dentro do container |

---

## Quando der errado

| Sintoma | Onde olhar |
|---|---|
| Site fora do ar | `docker compose ps` — o healthcheck bate em `/api/saude` a cada 30 s |
| "unable to open database file" | dono do volume. `docker compose run --rm --user root fio chown -R 1717:1717 /dados` |
| Login não gruda | cookie sem `Secure` em HTTPS, ou `FIO_ORIGENS` com barra no fim |
| Caddy não sobe depois de editar | `docker exec picord-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` |
| Falta memória | a VPS tem 2 GB e o LiveKit come 900 MB. `mem_limit: 320m` no Fio existe para ele morrer sozinho em vez de levar o Wallt junto |
| Publicar levou o site ao ar mas o JS é o velho | `index.html` é `no-cache`, `/ativos/*` é imutável. Se o velho persiste, o `index.html` ficou em cache do lado do Caddy — `docker compose restart` no Fio resolve |

---

## O que ainda não está feito

- **E-mail de verdade.** Sem `FIO_EMAIL_CHAVE`, "esqueci a senha" gera o link
  e o escreve no log. Funciona, mas exige alguém com acesso à máquina.
- **Backup fora da máquina.** Hoje ele fica no mesmo disco que o banco, o que
  cobre "apaguei sem querer" e não cobre "a VPS morreu".
- **Domínio de verdade.** `sslip.io` funciona e é feio.
