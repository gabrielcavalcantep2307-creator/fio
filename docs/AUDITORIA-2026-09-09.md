# Auditoria de 09/09/2026

A anterior é [`AUDITORIA.md`](AUDITORIA.md), de 04/09. Esta olhou o que mudou
depois dela — e o que mudou foi muito, porque quase tudo que entrou no
servidor desde então entrou **sem passar pelo git**.

Cinco achados. Cinco corrigidos, com teste. Um sexto está aberto e depende de
uma decisão, não de código.

---

## 1. A porta da casa estava aberta — GRAVE, corrigido

`portaAberta()` era `process.env.FIO_CONVITE !== 'obrigatorio'`. Sem variável
no ambiente, **aberta**. E `FIO_CONVITE` não estava no `docker-compose.yml`.

Resultado: a biblioteca que existe para "mim e meus amigos" aceitou cadastro
de qualquer pessoa da internet desde que subiu, e `GET /api/saude` anunciava
isso de graça para quem passasse:

```
{"ok":true,"versao":1,"convite":"opcional"}
```

O caminho estava completo. Em `criar()`, sem código de convite e com a porta
aberta, a conta é criada.

**Conserto.** `portaAberta()` agora é `=== 'aberto'`: falha fechada. Esquecer
a configuração passa a trancar a porta em vez de escancarar. O compose diz o
padrão por escrito. O teste `sem configuração nenhuma a porta está fechada` é
o que impede a volta.

**Não é dano consumado:** a base de produção tem **uma** conta, que é a do
dono. Ninguém entrou pela porta aberta.

---

## 2. O IP dava para forjar — corrigido

`ipDe()` lia o **primeiro** item do `X-Forwarded-For`.

O Caddy **acrescenta** o IP real ao cabeçalho que chegou, em vez de
substituir. Quem mandasse `X-Forwarded-For: 1.2.3.4` de fora fazia o cabeçalho
chegar como `1.2.3.4, <ip de verdade>` — e ler o primeiro é ler o que o
atacante escreveu.

Com isso, todo freio que conta por IP saía de graça: bastava sortear um valor
novo a cada pedido. Isso vale para `criar` e para `abrir`.

**Conserto.** Passa a ler o último item, que é o que o nosso proxy pôs. A
função saiu do `api.mjs` e virou `ipDoPedido()` no `seguranca.mjs`, onde dá
para testar sem subir servidor. Vale enquanto houver **um** proxy na frente;
entrando outro, essa conta muda junto.

---

## 3. O freio dizia contar duas coisas e contava uma — corrigido

O comentário de `LIMITES` promete duas contas separadas:

> por e-mail protege UMA conta de quem insiste nela
> por IP protege TODAS as contas de quem varre a lista

`esqueci` e `responder` faziam `freio(banco, acao, email ?? ip)` — **OU** um
**OU** outro. Como ataque nenhum manda e-mail malformado, só o balde do
e-mail contava.

O efeito: cinco chutes por conta por hora seguram quem insiste numa conta, e
não seguravam quem chuta cinco vezes em cada uma de duzentas contas na mesma
hora, da mesma máquina. `responder` é a porta de recuperação de senha, então
essa era a mais séria das duas.

**Conserto.** `freioDuplo()` conta nos dois baldes, com tetos separados em
`LIMITES_IP`. Os números do IP são folgados de propósito: `dicaDeIp` guarda só
`187.45.x.x`, para não ter IP inteiro no banco, e nesse tamanho um balde é um
pedaço de operadora.

**De quebra, um trava-vizinho.** `entrar` já contava nos dois baldes — mas com
o **mesmo** teto de oito em quinze minutos. Dois amigos na mesma rede errando
a senha quatro vezes cada trancavam a casa. Agora o teto do IP é 60.

---

## 4. O backup nunca rodou — corrigido

`infra/backup.sh` chamava `docker compose -f /opt/fio/docker-compose.yml`, e o
compose mora em `/opt/fio/infra/`. Com `set -e`, o script morria na primeira
linha.

A pasta `/opt/fio/backups` estava **vazia**. São 2,2 GB de catálogo, 86.588
capítulos e as contas, sem cópia nenhuma desde 04/09.

**Conserto.** O caminho. E fica dito o que ainda falta: mesmo funcionando, o
`backup.sh` grava no **mesmo disco** do banco. Cobre "apaguei sem querer" e
não cobre "a VPS morreu".

---

## 5. Convite que vence hoje aparecia vencido — corrigido

`--listar` comparava `"2026-09-09 12:00:00"`, que é o formato do SQLite, com
o ISO do JavaScript, que traz `T` no lugar do espaço. Como `" " < "T"`, todo
convite no dia do vencimento aparecia vencido com horas de vida pela frente.

---

## 6. As perguntas de segurança entregam quem escreveu a própria — ABERTO

`perguntasDe()` tem um disfarce cuidadoso: para um e-mail que não existe, ela
sorteia três perguntas do catálogo público de sugestões, de um jeito estável e
com um segredo da casa, para que a resposta tenha a mesma cara de uma conta de
verdade.

O disfarce funciona — **enquanto a conta usar as sugestões**. `pergunta` é
texto livre, e quem escreveu a própria devolve uma pergunta que não está em
`GET /api/sugestoes`. Isso prova que a conta existe.

**Não corrigido, de propósito.** As saídas são todas ruins: proibir pergunta
própria tira uma capacidade que foi construída de caso pensado, e sortear as
perguntas dos outros membros vaza texto que eles escreveram, o que é pior.

O que se fez foi tirar a escala do problema: com o teto por IP do achado 3, a
varredura que transformaria isso em lista de endereços passa a esbarrar em 40
por hora. Para uma biblioteca de convite, com a porta fechada, é uma troca
aceitável — mas ela é uma escolha, e fica registrada como escolha.

---

## O que a auditoria procurou e NÃO achou

**Marcação viva nos capítulos.** É a exposição mais séria que este projeto
tem, porque o corpo do capítulo vai para `dangerouslySetInnerHTML` no leitor —
e o texto vem de fora, do Gutenberg e do Wikisource.

Varri os **86.588 capítulos** de produção atrás de `<script`, `onerror`,
`onload`, `<iframe`, `<svg`, `<img`, `javascript:`, `srcdoc`, `<object`,
`<embed` e `<form`.

**Zero.** O saneador fez o trabalho dele.

Isso não quer dizer que o saneador estava certo — a versão que estava neste
repositório **não** estava, e foi reescrita (ver o commit da ingestão). Quer
dizer que a versão que rodou na ingestão de verdade estava, e que o acervo em
produção está limpo.

Também conferidos, sem achado: o cookie de sessão (`__Host-`, `HttpOnly`,
`SameSite=Lax`, `Secure`), a dupla trava de CSRF, o teto de 64 KB no corpo do
pedido, a CSP servida pelo Caddy, e o fato de a porta 8787 estar publicada só
em `127.0.0.1`.

---

## O achado que não é de segurança, e é o mais caro

**O servidor em produção estava quatro passos à frente do repositório, e o
fonte do site novo não existe em lugar nenhum.**

O `publicar.sh` levava para a VPS só `servidor/` e `site/`. Nunca `ingestao/`.
E o `site/` ia como `dist` construído, sem sourcemap.

Então, quando a máquina que rodou aquelas sessões deixou de ter a pasta:

| O que | Onde estava | Recuperado? |
|---|---|---|
| Código do servidor | só na VPS | sim, commit `df543cf` |
| Ingestão (tradutor, catalogador, saneador) | lugar nenhum | refeito dos testes, commit `024fd1f` |
| Fonte do site novo | lugar nenhum | **não** |

O site em produção é a única cópia da interface que tem perguntas de
segurança, busca dentro dos livros e resenhas — e ela existe só como bundle
minificado.

Por isso `publicar.sh` agora **recusa** publicar o site enquanto o `web/src`
não alcançar o que está no ar, e existe `publicar-so-servidor.sh` para mexer
no servidor sem encostar na pasta do site.
