# Comandos da Fiolib

**Tudo roda na VPS.** Nada da Fiolib fica rodando no seu computador: o site, a
esteira de tradução e o backup do banco (03:20) vivem lá, com o PC ligado ou
não. Se um deles cair, o Docker sobe de novo sozinho.

## No dia a dia: o painel

O painel mora num **endereço secreto** (anotado com você; ele fica em
`FIO_PAINEL` no `/opt/fio/infra/.env` da VPS). Entre pelo botão do Google.
`/admin.html` e `/admin` levam você até lá, e para qualquer outra pessoa são um
endereço que não existe.

Aba **Controle**:

| Quero | Onde |
|---|---|
| saber se está tudo funcionando | a lista no topo (verde, amarelo, vermelho) |
| tirar o site do ar para os leitores | Ligar e desligar → *Desligar para os leitores* (eles veem "voltamos já"; você continua vendo tudo) |
| desligar / ligar a esteira | Ligar e desligar → *Desligar a esteira* / *Ligar a esteira* |
| derrubar sessões de outros aparelhos | Segurança do painel → *Sair de todos os outros aparelhos* |

## Emergência: quando o painel não abre

Rode no Git Bash, da pasta `Downloads\fio`. Cada comando entra na VPS, faz a
coisa e sai.

| Quero | Comando |
|---|---|
| ver o que está rodando | `bash infra/fio.sh estado` |
| ligar o site | `bash infra/fio.sh site ligar` |
| desligar o site de verdade | `bash infra/fio.sh site desligar` |
| reiniciar o site | `bash infra/fio.sh site reiniciar` |
| ligar a esteira | `bash infra/fio.sh esteira ligar` |
| desligar a esteira | `bash infra/fio.sh esteira desligar` |
| reiniciar a esteira | `bash infra/fio.sh esteira reiniciar` |
| ler o log do site | `bash infra/fio.sh log site` |
| ler o log da esteira | `bash infra/fio.sh log esteira` |
| tirar o "voltamos já" sem o painel | `bash infra/fio.sh manutencao sair` |
| backup do banco agora | `bash infra/fio.sh backup` |
| trazer uma cópia do site para o PC | `bash infra/fio.sh copia` |

Sem o script (de qualquer computador com a chave `fiolib-deploy`):

```bash
ssh -i ~/.ssh/fiolib-deploy root@142.93.57.2 "docker compose -f /opt/fio/infra/docker-compose.yml up -d"
```

Troque `up -d` por `stop`, `restart` ou `logs --tail 60 esteira` conforme o caso.

## Publicar mudanças

| O quê | Comando |
|---|---|
| o servidor (roda os testes antes) | `bash infra/publicar-so-servidor.sh` |
| as páginas soltas do site | `bash infra/publicar-paginas.sh` |
| a configuração do Caddy da Fiolib | `bash infra/publicar-caddy.sh` |

**Nunca** `infra/publicar.sh`: ele reconstrói o site a partir de um fonte
antigo e apaga a interface que está no ar (ver docs/PROJETO.md).

## Se a conta de administração não conseguir entrar pelo Google

Ponha `FIO_ADMIN_SENHA=permitida` no `/opt/fio/infra/.env`, rode
`bash infra/fio.sh site reiniciar`, entre com a senha, e depois tire a linha e
reinicie de novo.
