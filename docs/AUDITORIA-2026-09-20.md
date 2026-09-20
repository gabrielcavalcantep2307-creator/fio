# Auditoria da máquina nova — 20/09/2026

Primeira auditoria depois da mudança para a VPS própria (Hostinger,
`2.25.210.20`, 2 núcleos / 8 GB). A máquina tem dois dias de vida, e é
justamente por isso que esta rodada importa: **o que a máquina velha tinha de
proteção não veio junto.** Configuração de sistema não viaja no `docker
compose`; `/opt/fio` e os volumes vieram, o resto nasceu do zero com o padrão
da Hostinger.

Três achados sérios, todos do mesmo lugar — a porta de administração da
máquina. Nada no site, no servidor ou nas contas.

---

## O que está certo (e vale registrar, porque foi conferido)

| Conferido | Resultado |
|---|---|
| Portas abertas para a internet | só **22, 80 e 443**. A porta do site (8787) está em `127.0.0.1` e não responde de fora — quem fala com ela é o Caddy, do mesmo host |
| Cabeçalhos HTTP | CSP fechada (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), HSTS de 2 anos com subdomínios, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` sem câmera/microfone/localização |
| Rotas sem conta | `/api/eu` **401**, `/api/painel` **401**, `/api/ajustes` **401**, `/admin.html` **404** para quem não é admin, `/api/esteira/pulso` **404** |
| Certificado | Let's Encrypt, válido até **17/12/2026** |
| Backup do banco | `VACUUM INTO` (cópia íntegra com o servidor escrevendo), `umask 077`, pasta `700`, rotação de 14 dias, rodando às 03:20 — as cópias de hoje estão lá, 830 MB cada |
| Atualizações de segurança pendentes | **0** |
| Disco | 15 % de 96 GB |
| Tentativas de invasão nas últimas 24 h | **2**, e as duas vieram de `142.93.57.2`, que é a nossa máquina antiga (script velho ainda apontando para cá) |

As duas tentativas são a boa notícia enganosa desta auditoria: a máquina é
nova e os robôs ainda não a acharam. Vão achar. O endereço já está em DNS
público desde 20/09, e varredura de faixa inteira leva dias, não meses.

---

## Achado 1 — SSH aceita SENHA, e aceita para o root · **grave**

```
permitrootlogin yes
passwordauthentication yes
```

É o padrão de fábrica da Hostinger, e é a porta mais atacada da internet.
Hoje, qualquer um no mundo pode tentar adivinhar a senha do root desta
máquina, sem limite de tentativas por hora e sem nada barrando.

Não é hipótese distante: a máquina ANTIGA já passou por isso. Em 11/09 o SSH
dela ficou inacessível no meio de um deploy — a suspeita registrada em
`docs/VPS.md` foi bloqueio por excesso de conexões no mesmo dia, que é o que
acontece quando um robô está martelando a porta.

**Não usamos senha para nada.** O deploy, os scripts e esta sessão entram por
chave (`~/.ssh/fiolib-deploy`). A senha existe só para quem não deveria entrar.

**Conserto:**

```bash
ssh -i ~/.ssh/fiolib-deploy root@2.25.210.20 "printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/99-fiolib.conf && sshd -t && systemctl reload ssh && sshd -T | grep -E 'passwordauthentication|permitrootlogin'"
```

**O risco, dito com todas as letras:** depois disso, a chave passa a ser o
ÚNICO jeito de entrar por SSH. Perder `~/.ssh/fiolib-deploy` sem ter outra
chave na máquina significa não entrar mais por aí. A saída de emergência
existe e é boa — o **console do painel da Hostinger** entra pela porta de
serviço, sem SSH, e de lá dá para desfazer. Vale conferir que ele abre
**antes** de rodar o comando.

## Achado 2 — não há firewall · **médio**

```
ufw: inactive        iptables INPUT: policy ACCEPT, nenhuma regra
```

Hoje isso custa pouco, porque só três portas escutam. O problema é o dia em
que alguma coisa subir escutando em `0.0.0.0` sem ninguém notar — um container
com a porta publicada errado, um serviço de teste esquecido de pé. Com
firewall, esse erro não vira uma porta aberta na internet; sem firewall, vira.

**Conserto:**

```bash
ssh -i ~/.ssh/fiolib-deploy root@2.25.210.20 "ufw --force reset && ufw default deny incoming && ufw default allow outgoing && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable && ufw status verbose"
```

Cuidado conhecido: o Docker escreve direto no `iptables` e passa por cima do
`ufw` para portas publicadas. Como as nossas são todas `127.0.0.1:` (menos as
do Caddy, que usa a rede do host), isso não nos morde hoje — mas é a razão de
o firewall não substituir a regra de nunca publicar porta em `0.0.0.0`.

## Achado 3 — nada freia quem erra a senha mil vezes · **médio**

`fail2ban` não está instalado. Com o achado 1 consertado, isso deixa de ser
urgente (sem senha não há o que adivinhar), mas continua valendo: ele corta a
conversa antes, e tira do log o ruído que esconde a tentativa que importa.

```bash
ssh -i ~/.ssh/fiolib-deploy root@2.25.210.20 "apt-get install -y fail2ban && printf '[sshd]\nenabled = true\nmaxretry = 4\nbantime = 1h\nfindtime = 10m\n' > /etc/fail2ban/jail.d/fiolib.conf && systemctl enable --now fail2ban && fail2ban-client status sshd"
```

## Achado 4 — o backup mora na máquina que ele protege · **médio, e já conhecido**

Está em `docs/LANCAMENTO.md` como pendência desde 19/09 e continua aberto. As
cópias são boas, íntegras e rotacionadas — e estão todas em `/opt/fio/backups`,
no mesmo disco do banco. Elas protegem contra `DROP TABLE`, contra deploy
ruim e contra corrupção. Não protegem contra a máquina: disco perdido, conta
suspensa ou invasão levam banco e cópias juntos.

A Hostinger faz backup semanal do provedor, o que cobre o desastre grande com
até 7 dias de perda. O buraco é o meio-termo: perder a máquina numa quarta
custa os livros e as contas da semana inteira.

Falta escolher o destino de fora (o mais simples é `rclone` para um
armazenamento barato, ou um `scp` noturno para o PC quando ele estiver ligado).
São 830 MB comprimidos por cópia.

## Achado 5 — reinício pendente · **baixo**

`/var/run/reboot-required`: o núcleo foi atualizado e o que está rodando é o
antigo. Sem urgência (0 atualizações de segurança pendentes), mas fica para a
próxima janela — e tudo aqui sobe sozinho com `restart: unless-stopped`.

---

## A revisora, que nasceu nesta rodada

`servidor/revisor-trabalhador.mjs` é serviço novo e mexe em texto publicado,
então entra na auditoria por conta própria:

- **não abre porta nenhuma** e não fala HTTP com ninguém de dentro; só lê e
  escreve no banco e chama o mesmo motor de tradução da esteira;
- roda com teto de 512 MB e 0,5 CPU, e é a primeira a morrer se faltar memória
  (`oom_score_adj: 100`) — a ordem certa, já que nada nela é urgente;
- nasce em `propor`, que não escreve uma letra no acervo;
- o único jeito de ela mudar texto é `FIO_REVISORA=aplicar`, e o painel só
  grava um dos três valores da lista (`servidor/ajustes.mjs`, com teste);
- tudo o que ela troca guarda o capítulo como estava em `revisao_troca`, e
  `--desfazer` devolve byte a byte (com teste).

## Resumo

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 1 | SSH aceita senha, e para o root | **grave** | comando pronto, esperando o dono |
| 2 | Sem firewall | médio | comando pronto |
| 3 | Sem fail2ban | médio | comando pronto |
| 4 | Backup só na própria máquina | médio | pendência antiga, falta escolher destino |
| 5 | Reinício pendente | baixo | próxima janela |

Nada encontrado no site, no servidor, nas contas ou nos cabeçalhos. A
superfície pública está fechada; o que está aberto é a porta de serviço da
máquina, e é herança do primeiro dia dela.
