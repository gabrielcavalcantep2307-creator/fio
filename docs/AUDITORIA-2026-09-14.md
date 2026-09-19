# Auditoria de 14/09/2026 — segurança do site e da VPS, e o código

Duas frentes num dia só: uma varredura de segurança do site (por fora) e da VPS
inteira (por dentro), e uma leitura do código atrás do que dá para deixar mais
rápido e mais enxuto.

O resumo honesto: **a postura de segurança é boa**, melhor do que a de muito
serviço pago. Havia **um** furo grave, e ele era ao mesmo tempo o maior problema
de velocidade. Está corrigido, no ar e testado. E havia um backup que se
acreditava existir e não funcionava — também corrigido.

---

## 1. A busca derrubava o site inteiro — GRAVE, corrigido

`GET /api/procurar` é a rota que procura dentro dos 110 milhões de palavras do
acervo. Ela é **pública** (não precisa de conta) e **não tinha freio**. Uma
palavra comum — "de", "que", "amor" — travava o servidor por **60 segundos**, e
enquanto travava **nada mais respondia**: medi `/api/saude` levar os mesmos 60 s.

O `node:sqlite` é síncrono e a VPS tem **um** núcleo. Uma busca pesada segura o
processo inteiro. Ou seja: qualquer pessoa na internet derrubava a biblioteca
para todo mundo com um clique, de graça e sem deixar rastro de invasão — porque
não era invasão, era o uso normal de uma rota mal construída.

**A causa.** A consulta era `... JOIN (seis tabelas) ... WHERE MATCH ?
ORDER BY bm25(...) LIMIT 120`. Com o `ORDER BY` sobre uma função do índice, o
SQLite tem que **juntar todas** as linhas que casam antes de ordenar e cortar.
Para "machado" são dez linhas; para "de" são centenas de milhares, cada uma
passando por seis tabelas e por um `snippet()`.

**O conserto.** A busca passou a ser em dois passos. Primeiro pergunta só ao
índice (`ORDER BY rank LIMIT 240`), que é o que o FTS5 faz rápido — a fila de
prioridade do bm25 para cedo e não toca em mais nenhuma tabela. Depois resolve
esses 240 candidatos contra obra/texto/direito/autor. 240 linhas, não trezentas
mil. E entrou um freio de 30 buscas por minuto por faixa de IP.

Medido em produção, depois de subir:

| termo | antes | depois |
|-------|-------|--------|
| `de` | 60 s (timeout) | 2,6 s |
| `que` | 60 s (timeout) | 3,1 s |
| `amor` | 60 s (timeout) | 1,1 s |
| `/api/saude` durante uma busca | 60 s | 1,1 s |

O direito continua conferido: obra protegida não aparece no resultado. Três
testes novos cobrem a busca, que antes não tinha nenhum. (commit `710a8ef`)

---

## 2. O backup do Fio não funcionava — corrigido

O cron da madrugada copiava só o Wallt (que ainda se chamava Picord). O backup do Fio existia como script no
repositório e **nunca tinha sido agendado**. Pior: quando fui agendá-lo, ele
quebrou na segunda linha —

```
/opt/fio/infra/backup.sh: line 15: $'\r': command not found
```

Os cinco `.sh` do projeto foram commitados de uma máquina Windows com quebra de
linha CRLF. O bash de Linux lê o `\r` do fim de cada linha como parte do comando
e morre. O backup que se acreditava existir nunca teria rodado uma vez.

**O conserto.** `.gitattributes` com `*.sh text eol=lf` força LF sempre, de
qualquer máquina. O script foi ao ar, rodou (criou `catalogo-20260914-1543.db.gz`,
732 MB) e está agendado para 03:20, guardando 14 dias. (commit `a069a58`)

**Fica dito, como já ficava:** a cópia é no **mesmo disco**. Protege contra
corromper o arquivo e contra apagar sem querer; **não** protege contra a máquina
morrer. Para isso a cópia precisa sair da VPS — para o seu computador ou para um
armazenamento de objetos. Esse passo continua manual, e é a recomendação nº 1
da lista lá embaixo.

---

## O que a auditoria procurou e NÃO achou (a parte boa)

Vale escrever, porque é trabalho que já foi feito e está certo:

- **Vazamento de arquivo pelo site.** Testei `/.env`, `/.git/config`,
  `/dados/catalogo.db`, `/servidor/api.mjs`, `/backups/`. Nenhum vaza: o
  servidor devolve a página do app para tudo que não reconhece, e nunca o
  arquivo. Não há travessia de caminho (`/../`) — a checagem em `servirArquivo`
  segura.
- **Cookie de sessão.** `__Host-fio`, `HttpOnly`, `SameSite=Lax`, `Secure`. O
  prefixo `__Host-` fecha o ataque de subdomínio.
- **CSRF.** Cabeçalho `x-fio` obrigatório em toda escrita, mais conferência de
  `Origin`. Um `<form>` de outro site não consegue.
- **Senha.** scrypt N=2¹⁵, sal por pessoa, comparação em tempo constante, e o
  mesmo tempo gasto quando a conta não existe (não dá para descobrir quem tem
  conta pelo relógio).
- **Freio em tudo que importa.** Entrar, criar, recuperar senha, avaliar,
  sincronizar — com balde por conta E por IP, na ordem certa.
- **A VPS.** Firewall (ufw) ligado, só as portas certas abertas. fail2ban ativo
  (85 IPs banidos até agora). SSH **só com chave**, senha desligada. Cada
  contêiner roda **sem** privilégio e **sem** ser root, com teto de memória. O
  socket do Docker não está montado em lugar nenhum. Os `.env` são 600, do root.
- **Cabeçalhos.** CSP fechada (sem curinga), HSTS de dois anos, `X-Frame-Options
  DENY`, `nosniff`. HTTP redireciona para HTTPS. O certificado renova sozinho.

---

## Recomendações — o que ainda vale fazer, em ordem

Nenhuma é urgente como as duas de cima. Nenhuma foi feita sem você decidir,
porque cada uma tem um custo que é seu para escolher.

1. **Tirar uma cópia do banco para fora da VPS.** É o único risco sem rede de
   proteção: hoje, se o disco morrer, morre tudo. Um comando no seu PC
   (`scp root@142.93.57.2:/opt/fio/backups/catalogo-*.db.gz .`) já resolve por
   enquanto; o certo depois é um Space da DigitalOcean (uns poucos reais/mês).

2. **Aplicar as 14 atualizações do sistema e reiniciar.** Há correções de
   segurança do sistema esperando, e uma delas mexeu no núcleo — até reiniciar,
   não está valendo. Reiniciar derruba os dois projetos por uns 40 segundos.
   Faça a cópia (item 1) antes, e escolha uma hora morta.
   `apt update && apt upgrade -y && reboot`

3. **O índice de busca guarda o texto duas vezes.** O FTS5 está em modo
   `content` normal, o que faz ele manter uma **segunda cópia** de todo o texto
   dos capítulos — cerca de 686 MB dos 2,2 GB do banco. Dá para trocar por FTS
   de conteúdo externo (`content='capitulo'`) e recuperar esse espaço, mas exige
   reindexar o banco inteiro e ajustar o `snippet()`. Vale quando o disco
   apertar, não antes — hoje há 38 GB livres.

4. **Endurecer o SSH um pouco mais.** `X11Forwarding` e `AllowTcpForwarding`
   estão ligados e não são usados. Desligá-los fecha duas portas internas que
   só teriam uso se alguém já tivesse entrado. Risco baixo (o acesso já é só por
   chave), ganho pequeno; é higiene.

---

## Sobre o código: rápido, e o que já está limpo

A varredura de código atrás de "otimizar, reduzir, deixar mais bonito" tem uma
conclusão que é elogio: **o código já está organizado e é enxuto**. Zero
dependências de terceiro no servidor inteiro; cada decisão não-óbvia tem um
comentário explicando o porquê; o banco tem uma porta de entrada só; a regra de
negócio é testável sem subir servidor (78 testes passam).

O maior ganho de velocidade possível no projeto era a busca, e ele foi feito
(item 1). Não há gordura óbvia para cortar: o que parecia repetição — um
ajudante de quatro linhas copiado entre os scripts de ingestão — é, na verdade,
o que deixa cada script rodar sozinho sem depender dos outros. Juntar tudo num
módulo comum tornaria o conjunto mais curto e mais frágil. Não vale a troca.

Em resumo: o dia rendeu dois consertos que importam de verdade (a busca e o
backup), e a confirmação de que o resto está de pé.
