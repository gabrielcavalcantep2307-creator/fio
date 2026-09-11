# O plano, de 11/09/2026

Escrito depois de uma reclamação precisa: *"não tem seções chamativas de
livros bons, só livros velhos ultrapassados. Dos livros velhos e famosos e
realmente bons não tem quase nada. E de ficção e fantasia com as capas daora
praticamente nada."*

Está certa, e a causa tem nome.

---

## Por que a estante parece ruim

O acervo legível são 4.400 obras, e quase todas vieram do mesmo lugar: o
Projeto Gutenberg em português. Esse acervo é excelente para quem estuda
literatura portuguesa do século XIX e é exatamente o que ninguém procura à
noite, no sofá.

Os livros famosos e antigos — Kafka, Dostoiévski, Austen, Shakespeare — não
estavam lá por um motivo só, e não é o que parece:

> **A obra é livre. A tradução é que tem dono.**

Kafka é domínio público desde 1995. A tradução brasileira que está na
livraria, não. Por isso o catálogo mostrava a ficha e não o texto, e a estante
parecia uma biblioteca de sebo.

**A esteira existe para resolver isso**, e ela já está andando. Traduzimos do
original e a tradução é nossa, pelo art. 14 da Lei 9.610/98.

---

## O que já mudou, hoje

| | |
|---|---|
| Orwell completo | *A Revolução dos Bichos* e *1984*, legíveis |
| Na esteira agora | 36 obras, de Shakespeare a Lovecraft |
| Capas novas | 46, cobertura de prateleira foi de 134 para 180 de 222 |

E o defeito que impedia você de ler: **o site não lê o banco.** Ele lê um
arquivo estático, `site/dados/catalogo.json`, e esse arquivo era de 07/09.
Escrever no banco não publica nada. Quem olhava o banco via o livro; quem
olhava o site, não.

`infra/subir-traducoes.sh` fecha esse ciclo em quatro passos — instalar,
reindexar, **republicar**, conferir de fora — e o terceiro é o que faltava.

---

## As quatro seções que faltam, e como cada uma chega

### 1. Ficção e fantasia — **a esteira já está trazendo**

Não precisa de fonte nova. O que falta é volume e prateleira.

Já na esteira: Lovecraft (3), Conan Doyle (3), Chesterton, Swift, Jack London,
Shakespeare (7), Kafka (3), Wilde (4).

A acrescentar, todos livres e no Gutenberg: Jules Verne, H. G. Wells, Bram
Stoker, Mary Shelley, Robert Louis Stevenson, Dumas, Poe, os irmãos Grimm,
Andersen, Lewis Carroll, Baum, William Morris e Lord Dunsany — que é onde a
fantasia moderna começa.

**Custo:** zero em dinheiro. Uma rodada da esteira por autor.

### 2. Livros atuais e mais vendidos — **ficha, capa e onde comprar**

Estes são protegidos, e é preciso dizer com todas as letras: **eles nunca vão
abrir.** Entram como ficha, capa bonita e "onde encontrar". É permitido, é
honesto, e é o que faz a página principal parecer viva.

A Amazon não tem lista pública de mais vendidos que se possa consultar sem
contrato. As fontes que dá para usar são a Open Library, que tem obras em
alta, e as listas públicas de jornal. O trabalho de verdade é a **capa**, e
essa é a parte já resolvida por `capas-que-faltam.mjs`.

**Regra que proponho, e que o projeto vai ter que engolir:** a prateleira de
mais vendidos diz, no topo, que ali não se lê. Uma prateleira que promete o
que não entrega é pior que nenhuma.

### 3. Livros amadores da internet — **a seção mais delicada**

É a ideia que mais gosto e a que tem a pegadinha maior.

Livro amador publicado na internet **tem dono**: quem escreveu. Não é domínio
público por estar de graça numa página. Pegar e hospedar é a mesma coisa que
pegar tradução de editora.

O que existe, e é grande:

- **Creative Commons**, onde o autor já disse "pode". O Internet Archive e o
  Gutenberg têm seções assim.
- **Domínio Público do MEC**: cerca de 174 mil textos em português, de um
  portal do governo. É a maior porta que existe e está a um raspador de
  distância.
- **Convite direto ao autor.** Uma página "publique aqui" com licença clara.

**Proponho começar pelo MEC**, que é volume real e legítimo, e deixar a página
de convite como fase 2.

### 4. Os velhos famosos e realmente bons — **já é a fila**

157 obras podem ser traduzidas hoje. O achador encontrou fonte para 48 e a
conferência aprovou 36. Os outros 121 estão parados por falta de fonte, não
por lei.

O Gutenberg é forte em inglês e fraco em filosofia continental. *Discurso do
método*, *Crítica da razão pura* e *O ser e o nada* precisam do **Wikisource
francês e alemão**, que é outro raspador e mais um dia de trabalho.

---

## Sobre a velocidade da tradução

Uma correção que importa: **a tradução não gasta crédito nenhum.** O motor é o
MinT, da Wikimedia, gratuito e sem chave. O que custa é máquina e paciência.

Os números medidos:

| Livro | Palavras | Tempo |
|---|---|---|
| *A Revolução dos Bichos* | 30 mil | 3 min |
| *1984* | 103 mil | ~1 h |

Não dá para acelerar muito, e a razão é justa: com dez pedidos em voo o
serviço parou de responder no meio do segundo livro do dia. Três pedidos e um
freio que aprende é o ritmo que ele aguenta. Insistir seria abusar de quem
oferece de graça.

**O jeito de ir rápido não é apertar o acelerador, é deixar rodando.** A
esteira anda sozinha, cada livro num processo seu, e o caderno garante que
nada é traduzido duas vezes.

Para leitura casual, o rótulo continua sendo obrigatório: sai "tradução
automática, sem revisão humana", com o original ao lado. *1984* abre com "os
relógios estavam atingindo treze", quando deveria ser "batiam treze". Quem
revisar troca o rótulo.

---

## Cinco ideias, na direção que você deu

### 1. A ficha que diz até quando esperar

146 obras do acervo estão protegidas e hoje são um beco sem saída: "não
podemos servir", e acabou.

O banco **já sabe** o ano em que cada uma cai — a coluna `direito.livre_em`
existe e está preenchida. Basta mostrar: *"Camus entra em 2031."* E um botão
de avisar quando entrar.

Todo 1º de janeiro a biblioteca cresce sozinha, e o leitor que pediu recebe um
aviso. Nenhum site de livro faz isso, e para nós é uma consulta.

### 2. Ler a nossa tradução ao lado do original

Guardamos o endereço do texto de partida em toda tradução nossa. Mostrar os
dois lado a lado, parágrafo a parágrafo, resolve três coisas de uma vez: quem
desconfia da máquina confere; quem estuda a língua ganha uma ferramenta que
não existe de graça; e quem quiser corrigir corrige ali mesmo.

É o que transforma "tradução automática" de desculpa em convite.

### 3. A busca vazia vira a fila de compras

Busca sem resultado é a informação mais valiosa que o site produz: é uma
pessoa dizendo o que esperava encontrar.

Guardar o termo — **sem guardar quem buscou** — e mandar direto para o achador
de fontes. O que alguém procurou ontem e não achou pode estar traduzido
amanhã, sozinho. A biblioteca passa a crescer na direção de quem a usa.

### 4. Nota por quanto se leu, e não por estrela

Para a seção de amadores, estrela não serve: são cinco amigos, e cinco
estrelas de amigo não dizem nada.

O banco tem `progresso`. Ordenar por **quantos começaram e chegaram ao fim** é
um sinal honesto, difícil de fraudar e muito mais informativo. "Oito pessoas
abriram, seis terminaram" diz mais que 4,7 estrelas.

### 5. A escada antes do livro difícil

*Crítica da razão pura* afugenta qualquer um. Mas Kant escreveu textos de
vinte páginas, e eles estão em domínio público.

Para cada clássico intimidante, uma escada de dois ou três degraus curtos do
mesmo autor, com uma frase dizendo por que aquele vem antes. É o "Fio" do nome
do projeto, e usa as tabelas `trilha` e `relacao_obra`, que já existem e estão
vazias.

---

## A ordem que eu faria

1. **Deixar a esteira terminar** e subir a cada rodada. É o que muda a
   estante de verdade, e já está acontecendo.
2. **Ficção e fantasia**, acrescentando os autores da lista acima. Uma tarde.
3. **Raspar o Domínio Público do MEC.** Dois dias, e é a maior porta de todas.
4. **Prateleira de mais vendidos**, com o aviso de que ali não se lê.
5. **A ficha que diz até quando esperar** (ideia 1). Meio dia, e é a que mais
   muda a cara do que hoje é um beco sem saída.
6. **Wikisource francês e alemão**, para destravar a filosofia continental.

As ideias 2 a 5 vêm depois, e nenhuma delas precisa de fonte nova: todas usam
tabela que já está no banco, vazia, esperando.
