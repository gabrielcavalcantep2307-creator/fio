# De onde vêm os livros

Este é o documento para ler **primeiro**. Ele responde à pergunta que decide o
produto inteiro, e a resposta não é a que se espera.

Tudo aqui foi **medido**, não presumido. As contagens vêm do catálogo em massa
do Project Gutenberg (`pg_catalog.csv`, 79.288 registros, baixado em
04/09/2026), da API do Internet Archive e da API do Wikisource — não de
artigos falando sobre elas.

---

## A medição, antes da opinião

### Project Gutenberg, por idioma

| Idioma | Obras |
|---|---|
| inglês | 62.791 |
| francês | 4.177 |
| finlandês | 3.681 |
| alemão | 2.422 |
| italiano | 1.109 |
| holandês | 1.108 |
| espanhol | 892 |
| **português** | **645** |

645 obras em português. E o que são elas:

| Autor | Obras |
|---|---|
| Camilo Castelo Branco | 52 |
| Alberto Pimentel | 24 |
| Antero de Quental | 16 |
| Alexandre Herculano | 14 |
| Eça de Queirós | 13 |
| Machado de Assis | 12 |

É um acervo de **literatura portuguesa do século XIX**. Machado aparece com 12
títulos; o resto do Brasil, quase nada. Não há ali um único livro sobre poder,
propaganda ou comportamento coletivo em linguagem moderna.

### O cânone que você quer, por idioma

Rodei a lista do que a proposta pede — poder, sociedade, pensamento crítico —
contra o catálogo inteiro:

| Obra | Disponível | Em português? |
|---|---|---|
| O Príncipe — Maquiavel | sim (3 edições) | **não** |
| Leviatã — Hobbes | sim | **não** |
| Do Contrato Social — Rousseau | sim | **não** |
| Sobre a Liberdade — Mill | sim | **não** |
| A República — Platão | sim (3) | **não** |
| A Democracia na América — Tocqueville | sim (2) | **não** |
| Desobediência Civil — Thoreau | sim (3) | **não** |
| Psicologia das Multidões — Le Bon | sim | **não** |
| O Tacão de Ferro — Jack London | sim | **não** |
| O Processo — Kafka | sim | **não** |
| Utopia — Thomas More | sim | **não** |
| O Capital — Marx | sim (espanhol) | **não** |
| **A Revolução dos Bichos — Orwell** | **não** | não |
| Admirável Mundo Novo — Huxley | **não** | não |
| Nós — Zamiátin | **não** | não |

Zero em português. **Zero.**

### Por que zero

Porque **tradução é obra nova, com direito autoral próprio**. Maquiavel morreu
em 1527 e é domínio público em qualquer lugar do planeta — mas a tradução da
Penguin, da Martins Fontes ou da L&PM foi feita por alguém vivo, ou morto há
menos de 70 anos, e essa tradução tem dono.

O texto antigo é livre. **O português dele não é.**

Isso não é detalhe jurídico. É a restrição central do projeto, e é exatamente o
ponto que qualquer plano de "vamos importar o Gutenberg" ignora.

### As outras fontes, medidas

| Fonte | O que tem | Serve para | Pega |
|---|---|---|---|
| **Project Gutenberg** | 645 pt / 62.791 en, EPUB limpo, catálogo em massa em CSV | leitura completa | acervo pt fraco e antigo |
| **Standard Ebooks** | EPUB de qualidade editorial, CC0 | leitura completa | **só inglês**; download em massa exige ser patrono pagante |
| **Internet Archive** | 15.603 textos em português, 15.352 sem exigir empréstimo | leitura e busca | metadado sujo, muito PDF escaneado, muita tese |
| **Domínio Público (MEC)** | ~174 mil textos | leitura | **sem API**, formulário JSP, bloqueia robô (403/302), PDF escaneado |
| **Wikisource pt** | 39.276 páginas | pouco | dominado por legislação brasileira e fragmentos: procurei "Do Contrato Social" e vieram leis do futebol |
| **Open Library** | metadado de quase tudo, e capas | **catálogo e capa** | 1 req/s anônimo; proíbe download em massa pela API — usar os dumps mensais |
| **Wikidata** | obras, autores, data de morte, adaptações | **cálculo de direito e conexões** | precisa de modelagem |
| **Google Books** | metadado, prévia, link de compra | **onde encontrar** | exige chave (tomei 429 sem chave); os termos proíbem guardar boa parte |
| **LibriVox** | audiolivro de domínio público | complemento | o filtro de idioma da API não funciona direito |

---

## A conclusão, que muda o produto

A pergunta "de onde vêm os livros?" tem resposta ruim se o produto for **um
lugar onde se lê**. Em português, o acervo livre e legal são umas centenas de
obras do século XIX, e nenhuma delas é o que você quer ler.

Mas o diferencial que você descreveu **não é o arquivo**. É:

> fazer o leitor entender o livro, descobrir por que ele importa e saber o que
> ler depois.

E **nada disso exige hospedar o livro.** A página editorial de *A Revolução dos
Bichos* — o contexto histórico, o que observar, o mapa de personagens, a trilha
que leva a *1984* e a Hannah Arendt — é conteúdo nosso, legal, e vale igual
para quem vai ler o livro em papel e para quem vai ler aqui dentro.

Então a arquitetura separa duas coisas que quase todo mundo mistura:

```
   o CATÁLOGO         cresce livre, sem teto jurídico
   (metadado + contexto + trilhas + conexões)
        │
        │  e, para uma fatia dele, só ela:
        ▼
   o TEXTO            cresce devagar, sob regra estrita
   (o arquivo que se lê aqui dentro)
```

O catálogo pode ter dezenas de milhares de obras no primeiro mês. O texto vai
ter algumas centenas. **E está tudo bem**, porque o produto entrega valor nos
dois.

---

## Os três trilhos

Todo livro entra por um destes três caminhos, e o trilho decide o que a tela
mostra no lugar do botão "Ler".

### Trilho A — Livre

Podemos hospedar e servir no nosso leitor.

- Origem: Gutenberg, Standard Ebooks, itens de domínio público do Internet
  Archive, Domínio Público, e o que nós mesmos produzirmos.
- Estado do direito: domínio público **na jurisdição do leitor**, ou licença
  que permita redistribuir.
- Botão: **Ler**.

### Trilho B — Referenciado

Não podemos hospedar. Temos todo o resto.

- Origem do metadado: Open Library e Wikidata (CC0).
- Entregamos: a página editorial completa, o "como ler", os temas, as trilhas,
  as conexões — e **onde encontrar**: comprar, biblioteca pública, empréstimo
  digital do Internet Archive, prévia oficial.
- Botão: **Onde encontrar**.
- É aqui que mora a maior parte do catálogo. Não é consolo: é o motor de
  descoberta.

### Trilho C — Do leitor

O arquivo é seu, e continua seu.

- Você envia um EPUB/PDF que já possui.
- Fica **privado à sua conta**: nunca é servido a outra pessoa, nunca entra na
  busca pública, nunca é redistribuído. É cópia privada, e a garantia disso
  fica no banco, não na tela.
- Ganha leitura, progresso, marcações — e, quando reconhecermos a obra, a mesma
  camada de contexto do trilho B.
- Botão: **Ler** (só para você).

Esse trilho resolve o problema prático sem resolvê-lo por fora da lei: quem já
tem o livro lê o livro, com todo o resto do produto em volta.

---

## O direito é por território, e isso entra no banco no primeiro dia

| | Brasil (Lei 9.610/98, art. 41) | Estados Unidos |
|---|---|---|
| Regra | 70 anos do 1º de janeiro seguinte à **morte do autor** | 95 anos da **publicação** |
| Orwell (morreu em 1950) | **domínio público desde 01/01/2021** | protegido até 2041 |

*A Revolução dos Bichos* **é domínio público no Brasil** — fato verificado, e
foi por isso que em 2021 seis editoras lançaram traduções novas ao mesmo tempo
(Companhia das Letras, Globo, Autêntica, L&PM, Antofágica, Novo Século). Mas:

1. O **inglês original** é livre no Brasil. Podemos hospedar e servir aqui. O
   Gutenberg americano não tem o arquivo (lá ainda é protegido), então a origem
   do arquivo não pode ser ele.
2. **Nenhuma tradução para o português existente é livre.** As seis são de
   tradutores vivos. Não podemos hospedar nenhuma.
3. Servir o texto em inglês para um leitor **nos Estados Unidos** é ilegal lá.

Consequência de arquitetura, não de opinião: o estado do direito é uma tabela
`(texto, jurisdição) → estado`, e a entrega consulta a jurisdição do leitor. Um
campo booleano `dominio_publico` no livro estaria errado desde a primeira
linha.

> **A saída bonita para o carro-chefe:** como a obra é domínio público no
> Brasil, **uma tradução nova é legal, e seria nossa.** É a única forma de ter
> *A Revolução dos Bichos* em português dentro do leitor. Fica registrado como
> possibilidade real — não como plano do MVP.

**O que o MVP faz com o carro-chefe:** página editorial completa (o trilho B
inteiro), texto integral em inglês para leitores no Brasil (trilho A), e "onde
encontrar em português" com as seis edições. É honesto, e é útil.

---

## A regra do idioma, e o que ela custa

**O site é só em português.** Traduzido ou original, tanto faz — mas em
português. Livro em inglês não aparece nem no catálogo.

Isso é decisão do dono do acervo, e ela vale antes de qualquer outra. O custo
é conhecido e está medido acima: o cânone de filosofia política sai do site
inteiro, porque só existe livre em inglês. O ganho é um acervo que não mente
sobre o que entrega.

Consequência prática: **o crescimento do acervo depende de fontes brasileiras
e portuguesas**, não do Gutenberg. O Gutenberg deu 645 obras e acabou.

## Como crescer o acervo em português, na ordem certa

Por rendimento, do maior para o menor. Nenhuma destas exige contornar direito
autoral de ninguém:

| Fonte | Tamanho | O que é | Dificuldade |
|---|---|---|---|
| **Legislação e jurisprudência** | ilimitado | Constituição, códigos, súmulas, acórdãos. **A Lei 9.610/98, art. 8º, diz que texto de lei e decisão judicial não são obra protegida.** É acervo livre por definição, e é o núcleo do Direito | baixa — Planalto e LexML têm formato estável |
| **Domínio Público (MEC)** | ~174 mil textos | O maior acervo livre em português que existe | média — sem API, formulário JSP, bloqueia robô; exige paciência e educação |
| **Internet Archive** | 15.352 textos em pt sem empréstimo | livros escaneados e digitalizados | média — API boa, metadado sujo, muito PDF de imagem |
| **Biblioteca Brasiliana (USP)** | milhares | obras raras brasileiras digitalizadas | média — IIIF |
| **Biblioteca Nacional Digital** | milhares | periódicos e livros | média |
| **Obras que caem em domínio público a cada 1º de janeiro** | cresce sozinho | quem morreu há 71 anos | baixa — é uma consulta ao Wikidata por ano de morte |

A última linha é a que responde ao pedido de "o acervo mais recente possível":
**todo 1º de janeiro um lote novo de autores entra em domínio público no
Brasil.** O sistema já tem o cálculo (`direitoBR`), e já guarda `livre_em` em
cada texto — então a fila do que entra no ano que vem é uma consulta, não uma
pesquisa. Isso vira uma rotina anual, e o acervo cresce sem ninguém decidir
nada.

## O que não vamos fazer

Não por ser difícil, mas por quebrar o produto:

- **Sites piratas, torrents, Anna's Archive, Library Genesis.** Fora.
- **Raspar acervo protegido.** Fora.
- **Presumir que "está na internet" significa "pode hospedar".** É a origem de
  quase todo erro nessa área.
- **Guardar metadado do Google Books além do que os termos permitem.** O
  catálogo próprio se apoia em Open Library e Wikidata, que são CC0. O Google
  entra só como link de compra e prévia.

---

## Como a ingestão roda, na prática

Do jeito certo, que é em massa e não pela API:

```
  dump / catálogo em massa      Gutenberg CSV, dumps mensais do Open Library
        │                       — nunca martelar a API pública
        ▼
  identificação                 ISBN, OLID, Wikidata Q, id externo, hash do arquivo
        │                       — obra ≠ edição ≠ tradução
        ▼
  direito                       calcula por jurisdição, da morte do autor
        │                       e do tradutor; na dúvida, "desconhecido"
        ▼
  normalização                  EPUB → capítulos em HTML limpo, no banco
        │
        ▼
  indexação                     busca textual + vetor
        │
        ▼
  publicação                    entra no catálogo com o trilho já decidido
```

O detalhe que importa: **na dúvida, trilho B.** Livro sem estado de direito
conhecido nunca vira botão "Ler". O padrão do sistema é o cauteloso.

---

## O que a ingestão realmente produziu

Isto não é projeção. É a saída de `node ingestao/gutenberg.mjs` — 645 obras em
português mais as 14 do cânone em inglês:

```
trilho A (dá para ler no Brasil) . 528
trilho B (só referência) ......... 131
com creditado sem ano de morte ...  94   ← viram "desconhecido", e o padrão
                                            cauteloso manda para o trilho B
direito, por jurisdição:
  BR  dominio_publico  528     US  dominio_publico  659
  BR  desconhecido     113
  BR  protegido         18
```

Três coisas que só aparecem quando o cálculo roda de verdade:

**1. Livre nos EUA, protegido no Brasil.** *Orpheu nº 1* — a revista que funda o
modernismo português, com Pessoa, Sá-Carneiro e Almada Negreiros — é domínio
público nos Estados Unidos e **protegida no Brasil até 2046**, porque Almada
morreu em 1970. É o caso exatamente inverso ao do Orwell, e um campo booleano
`dominio_publico` erraria os dois.

**2. A armadilha da tradução, pega sozinha.** *Do Contrato Social* entrou no
trilho B sem ninguém decidir nada:

```
BR: não pode — G. D. H. Cole (tradutor) morreu em 1959 ⇒ livre em 2030.
US: pode ler — item do Project Gutenberg.
```

Rousseau morreu em 1778. A tradução de Cole prende a obra inteira por mais
quatro anos no Brasil. O mesmo aconteceu com *A República* e *O Processo*.
Nenhuma dessas obras é "protegida" — o **texto que temos delas** é.

**3. O padrão cauteloso custa caro, e tem que custar.** 94 obras foram para o
trilho B só porque falta o ano de morte de alguém creditado. Metade
provavelmente é livre. Elas continuam no catálogo, com página e contexto — só
não ganham o botão "Ler" até alguém verificar. Errar para o lado de não servir
é barato; errar para o outro lado, não.

`node ingestao/conferir.mjs` reimprime tudo isso a qualquer momento.

---

## O que fica decidido

1. Catálogo e texto são coisas separadas, e o catálogo é o produto.
2. Três trilhos: livre, referenciado, do leitor.
3. Direito é por `(texto, jurisdição)`, no banco, desde o começo.
4. Obra, edição e tradução são camadas distintas, porque a tradução tem dono.
5. Na dúvida sobre direito, o livro não é servido.
6. Ingestão por dump em massa, nunca por marretada em API pública.
