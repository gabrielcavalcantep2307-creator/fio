# Como o acervo cresce daqui

Este documento responde a uma frustração legítima: *"o acervo é tão pouco que
dá vergonha de mandar para outras pessoas"*.

A resposta curta é que **há uma brecha grande e legal, e ela está sendo
desperdiçada.** A resposta longa está abaixo, com números e com o que cada
caminho custa.

---

## Onde estamos, sem enfeite

| | |
|---|---|
| Obras no catálogo | 1.537 |
| **Para ler inteiras, aqui** | **~600** (era 123 antes desta rodada) |
| Obras com ficha escrita | 69 |
| Textos de lei | 10, com 1.444 artigos |

O salto de 123 para ~600 não custou nada: **o Gutenberg em português tinha 645
obras e a ingestão só tinha trazido o texto de 113.** Eu havia limitado a doze
por autor curado, e a limitação sobreviveu ao motivo dela. Tirar o teto foi um
comando.

Fica a lição: antes de procurar acervo novo, vale conferir quanto do acervo já
achado ainda não foi trazido.

---

## As quatro portas, por rendimento

### 1. Traduzir o que já é livre — **a brecha grande**

Esta é a sua ideia, e ela funciona. Vale explicar por quê, porque a lógica é
mais forte do que parece:

> Quando a **obra original** está em domínio público, qualquer pessoa pode
> traduzi-la. A tradução é **obra nova**, com direito próprio, e esse direito
> é de quem traduziu — Lei 9.610/98, art. 7º, XI c/c art. 11.

Ou seja: o motivo de o cânone não existir em português livre **não é a obra**,
é a tradução. Maquiavel é livre; a tradução da Martins Fontes não é. Se nós
traduzirmos, o problema acaba — e a tradução é nossa.

**O que isso destrava, hoje, legalmente:**

| Autor | Morreu | Livre no Brasil desde |
|---|---|---|
| Platão, Aristóteles, Sêneca, Marco Aurélio, Epicteto, Sun Tzu | antiguidade | sempre |
| Maquiavel, Montaigne, Descartes, Hobbes, Locke, Rousseau, Kant | séculos XVI–XVIII | sempre |
| Tocqueville, Mill, Marx, Dostoiévski, Tolstói, Nietzsche, Durkheim | século XIX | sempre |
| Le Bon, Weber, Kafka, Beccaria, Lombroso, Freud, Zamiátin | 1917–1939 | sempre |
| **George Orwell** | **1950** | **2021** |

**Orwell está livre no Brasil.** *A Revolução dos Bichos* e *1984* podem ser
traduzidos por nós, e a tradução seria nossa. É a resposta para o livro que
começou este projeto.

**O que NÃO destrava** — e é preciso dizer, porque a tentação é grande:

| Autor | Morreu | Só em |
|---|---|---|
| Camus | 1960 | 2031 |
| Huxley | 1963 | 2034 |
| Arendt | 1975 | 2046 |
| Foucault | 1984 | 2055 |
| Bourdieu | 2002 | 2073 |

Para esses não há brecha nenhuma. Ficha e "onde encontrar", como hoje.

#### Quanto custa

O texto original está no Gutenberg em inglês, francês ou alemão, de graça.
Traduzir com modelo de linguagem, por capítulo, com o capítulo anterior como
contexto:

| Livro | Palavras | Custo aproximado |
|---|---|---|
| *O Príncipe* | 30 mil | ~US$ 0,60 |
| *A Revolução dos Bichos* | 30 mil | ~US$ 0,60 |
| *Do Contrato Social* | 45 mil | ~US$ 0,90 |
| *Crime e Castigo* | 210 mil | ~US$ 4,20 |
| **100 obras do cânone** | ~8 milhões | **~US$ 160** |

Com a API de lote, metade disso. É o **melhor dinheiro por obra** de qualquer
caminho nesta lista — e por uma razão simples: o trabalho já foi feito por
outra pessoa há duzentos anos, e o que falta é a língua.

#### A parte honesta

Tradução automática de prosa filosófica e ensaística fica **boa**. De poesia,
não fica — e de romance literário, fica morna: Dostoiévski traduzido por
máquina perde o que faz ele ser Dostoiévski.

Então a regra tem que estar na tela, e não no combinado:

- toda obra traduzida por nós leva o rótulo **"tradução automática, sem
  revisão humana"**, visível na ficha e na primeira página do livro;
- o original fica sempre acessível ao lado, para conferência;
- quando alguém revisar, o rótulo muda para **"revisada por [nome]"** — e o
  banco já tem `fragmento.revisado` e `texto.tradutor_id` para isso;
- **poesia não entra** na fila automática.

Isto não é ressalva de rodapé. Uma biblioteca que apresenta tradução de
máquina como se fosse tradução de gente está mentindo sobre o próprio acervo —
e este projeto inteiro é construído sobre não fazer isso.

#### Prioridade

Filosofia e política primeiro, que é onde a tradução automática é mais forte e
onde o buraco é maior: Maquiavel, Hobbes, Locke, Rousseau, Mill, Tocqueville,
Marx, Nietzsche, Weber, Le Bon, Beccaria, Sun Tzu, Marco Aurélio, Sêneca,
Epicteto. Depois Kafka e Zamiátin. Orwell por último, porque é o mais visível
e merece revisão humana antes de ir ao ar.

---

### 2. Domínio Público (MEC) — **o maior volume**

Cerca de **174 mil textos em português**, num portal do governo. É o maior
acervo livre da língua, e está a um raspador de distância.

**Por que ainda não foi feito:** não há API. É um formulário JSP dos anos
2000, que responde 403 a quem não parece navegador e pagina de um jeito
próprio. Um dia de trabalho para o raspador, e mais um para limpar o metadado
— boa parte do acervo é tese e dissertação, que não interessa aqui.

**Rendimento realista:** talvez 3 a 8 mil obras literárias e de referência
depois da peneira. É a maior porta de todas.

---

### 3. Internet Archive — **15.352 textos**

Textos em português que não exigem empréstimo. API boa, metadado sujo, muito
PDF escaneado sem camada de texto — e PDF escaneado não entra no leitor, só
como link.

**Rendimento realista:** 1 a 2 mil obras com texto aproveitável. Meio dia de
trabalho, e vale fazer depois do MEC porque há sobreposição grande.

---

### 4. O que cai em domínio público todo ano

Todo 1º de janeiro, quem morreu há 71 anos entra. O sistema **já calcula
isso** — `direito.livre_em` está gravado em cada texto. A fila do ano que vem
é uma consulta, não uma pesquisa.

Em 2027 entra quem morreu em 1956. Em 2031, Camus. Em 2034, Huxley.

É pouco por ano, e é de graça, e ninguém precisa lembrar.

---

## O que NÃO vamos fazer, e por quê

**Sites piratas, Library Genesis, Anna's Archive, torrent.** Não é pudor: é
que isso derruba o site e expõe quem o hospeda. Um acervo grande que não pode
ser mostrado a ninguém vale menos que um pequeno que pode.

E há um detalhe prático que costuma passar: o acervo pirata é feito de
**traduções comerciais** — exatamente as obras cujo dono tem advogado e
interesse em achar. Não é a parte cinzenta da internet; é a parte vermelha.

---

## A ordem que eu faria

1. **Traduzir 30 obras de filosofia e política.** Uma tarde de código, ~US$ 50,
   e resolve a reclamação "não tem os melhores filósofos" de uma vez.
2. **Raspar o Domínio Público.** Dois dias, e é a maior porta.
3. **Internet Archive.** Meio dia, depois do MEC.
4. **Revisar as traduções**, uma a uma, trocando o rótulo. Trabalho contínuo,
   e é o que separa um acervo de um despejo.

Com 1 e 2 feitos, o acervo legível sai de ~600 para alguns milhares — e passa
a ter os livros que as pessoas procuram, e não só os que sobraram.
