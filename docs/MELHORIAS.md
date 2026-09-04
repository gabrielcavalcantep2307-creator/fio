# Dez melhorias, em ordem de quanto mudam o produto

Cada uma diz o que resolve, quanto custa e **o que já existe pronto** — porque
metade delas está a um passo, e a outra metade não.

O critério de ordem não é dificuldade: é a pergunta *"isto muda o que o Fio
é, ou só o deixa melhor?"*. As três primeiras mudam o que ele é.

---

## 1. A camada de contexto, gerada em lote

**O problema.** 24 obras têm ficha escrita à mão — "por que este livro existe"
e "o que observar". As outras 1.485 têm capa, tema e nada mais. O diferencial
inteiro do produto está em 1,6% do acervo.

**O que existe.** A tabela `fragmento` com `revela_ate` (o anti-spoiler),
`natureza` (fato / interpretação / hipótese) e `revisado`. As 24 fichas são o
**padrão de qualidade** — sem elas não haveria como julgar o que a máquina
escrevesse.

**O que falta.** `ingestao/contexto.mjs`: para cada obra, uma chamada em lote
que produz chamada, "por que existe" e "o que observar", gravadas com
`gerado_por='ia'` e `revisado=0` — invisíveis até alguém aprovar.

**Custo.** Uma tarde de código. Em modelo, ~US$ 75–190 pelas 1.500 obras, uma
vez (a conta está em [`ARQUITETURA.md`](ARQUITETURA.md), decisão 3). Revisar
1.500 fichas é o trabalho de verdade — daí a fila de revisão da melhoria 6.

---

## 2. Legislação brasileira ✔ FEITA

**O problema era.** Direito era o maior tema do acervo (247 obras) e **nenhuma
dava para ler** — todas manuais comerciais, no trilho B. A categoria que mais
interessa ao dono da biblioteca era a mais vazia.

**Feito.** `ingestao/legislacao.mjs` traz dez textos do Planalto: CF/88,
Código Civil, Penal, de Processo Penal, de Processo Civil, CLT, CDC, Lei de
Direitos Autorais, Maria da Penha e LGPD. **1.444 artigos, 584 mil palavras**,
todos legíveis. O corte é por **artigo**, que é como se lê e como se cita.

Duas pedras no caminho, registradas: o Planalto **fecha a conexão** na cara de
quem não parece navegador, e serve alguns arquivos em **UTF-16LE** sem avisar
— lido como UTF-8 não dá erro, dá lixo, e o script conclui que "a lei só tem
um pedaço".

**Por que foi possível.** A Lei 9.610/98, art. 8º, IV, diz que texto de lei e
decisão judicial **não são objeto de proteção**. Sem zona cinzenta, sem prazo
a esperar, sem tradutor com direito próprio.

**O que ainda falta:** súmulas e jurisprudência (melhoria 15), e o histórico
de versões de cada artigo (melhoria 14).

---

## 3. Ligar o anti-spoiler no leitor

**O problema.** O motor está pronto no banco e **não aparece na tela**.
`fragmento.revela_ate` existe, `fragmentosVisiveis()` existe, o progresso do
leitor existe — e o leitor não mostra contexto nenhum durante a leitura.

**O que muda.** Selecionar uma palavra e receber o que ela significa **naquele
ponto do livro**, sem contar o que vem depois. É a promessa original do
projeto, e é a coisa que nenhum leitor de EPUB faz.

**O que falta.** No leitor: seleção → consulta em `fragmento` filtrada por
`revela_ate <= capítulo atual`. Na ingestão: fragmentos de conceito e de
personagem com o capítulo de estreia marcado.

**Custo.** Depende da 1 — sem contexto gerado não há o que mostrar.

---

## 4. Trilhas de leitura ◐ METADE FEITA

**Feito.** Quatro coleções com curadoria — *Todo mundo está lendo*, *Poder e
sociedade*, *Distopias que continuam atuais*, *Para começar a pensar* — nas
tabelas `trilha`/`trilha_item`, e aparecendo na home antes das prateleiras de
tema. Escolha de gente na frente de filtro de metadado.

**Falta.** A sequência: "você está no 3 de 7, e o próximo vem depois deste
porque…". Ver melhoria 16.

**O problema original.** "Você terminou. E agora?" não tem resposta. A página da obra
mostra "do mesmo autor" e "quem lê este, lê" — sugestão por proximidade, não
por caminho.

**O que existe.** As tabelas `trilha`, `trilha_item` e `relacao_obra`
(com `tipo` e `porque`) — vazias.

**O que muda.** *Poder e sociedade*, *Antes de estudar filosofia*, *Machado do
começo ao fim*: uma sequência com "você está aqui" e uma frase dizendo por que
o próximo vem depois deste. É o "Fio" do nome.

**Custo.** Um dia de código; o conteúdo é curadoria, e as primeiras três
trilhas podem ser escritas à mão como as 24 fichas.

---

## 5. Busca dentro do livro

**O problema.** O índice existe (`busca_capitulo`, FTS5 com remoção de acento,
3.908 capítulos) e **ninguém usa**. Procurar uma frase que você lembra de ter
lido é impossível hoje.

**O que muda.** Duas coisas ao preço de uma: buscar dentro do livro aberto, e
buscar no acervo inteiro por trecho — "aquele livro em que alguém fala em olhos
de ressaca".

**O que falta.** Uma rota no servidor (o índice está no banco, não no site
estático) e um campo no leitor.

**Custo.** Meio dia. É a melhoria com melhor relação entre trabalho e efeito.

---

## 6. Painel de administração

**O problema.** Convidar, listar contas, revisar ficha de IA e corrigir
metadado só acontece por SSH. Isso trava a melhoria 1: ninguém revisa 1.500
fichas por linha de comando.

**O que falta.** Uma tela `/admin` para quem tem `papel='admin'`: fila de
revisão (aprovar, editar, recusar), convites, contas e sessões.

**Custo.** Dois dias. Destrava a melhoria 1, que é a mais importante da lista.

---

## 7. Leitura offline

**O problema.** O leitor já é rápido porque o livro inteiro vem num arquivo só
— e mesmo assim, sem rede não abre.

**O que muda.** Metro, avião, rua. E o livro que você está lendo abre
instantaneamente, sempre.

**O que falta.** Um service worker que guarde o casco do site e os livros
abertos. O formato ajuda: `livros/{id}.json` é um arquivo, e guardar um
arquivo é trivial.

**Custo.** Um dia. Cuidado conhecido: service worker mal feito serve versão
velha para sempre — precisa da estratégia certa por tipo de arquivo.

---

## 8. Backup fora da máquina

**O problema.** `infra/backup.sh` grava no **mesmo disco** do banco. Cobre
"apaguei sem querer" e não cobre "a VPS morreu".

**O que muda.** O catálogo se refaz com a ingestão; as contas e o que cada
leitor marcou, não. É pouco byte e é o que não volta.

**O que falta.** Depois do `gzip`, mandar para fora. Um `scp` para outra
máquina já resolve.

**Custo.** Uma hora.

---

## 9. Saber que caiu antes de alguém contar

**O problema.** O `healthcheck` reinicia o container e não avisa ninguém.
Descobrir que o site caiu é abrir o site.

**O que muda.** Um aviso quando `/api/saude` parar de responder por dois
minutos — e o Wallt já tem push e e-mail funcionando na mesma máquina.

**Custo.** Meio dia, e sobe junto a régua dos dois projetos.

---

## 10. Entrar com o Google

**O problema.** Criar conta exige inventar mais uma senha. Para uma biblioteca
de amigos, é a maior fricção que sobrou.

**O que existe.** A coluna `leitor.google_sub`, criada **antes de haver conta
nenhuma** — de propósito: ligar OAuth depois costuma exigir mexer na tabela de
gente, que é a única que não dá para recriar.

**O que falta.** Registrar o cliente no Google, receber o `id_token`, conferir
assinatura e `aud`, e casar por `google_sub` — **nunca por e-mail**, que muda
de dono.

**Custo.** Um dia. O Wallt já faz isso, e o código serve de mapa.

---

## O que eu faria nesta ordem

1. **Legislação** (2) — muda o acervo mais que qualquer outra coisa, e não
   depende de nada.
2. **Busca dentro do livro** (5) — meio dia, e o índice já está pago.
3. **Painel** (6) — porque sem ele a próxima não acontece.
4. **Contexto em lote** (1) — o diferencial do produto, enfim em escala.
5. **Anti-spoiler no leitor** (3) e **trilhas** (4) — as duas viram possíveis
   quando existe contexto.

Backup fora (8) e o aviso de queda (9) são horas soltas: dá para encaixar
entre as outras, e é o tipo de coisa que só se lamenta não ter feito depois.

---
---

# Mais dez, depois destas

As dez de cima eram sobre **o que falta construir**. Estas são sobre o que
aparece quando o que já existe começa a ser usado de verdade.

## 11. Progresso na capa

A prateleira "Você parou aqui" mostra a capa e mais nada. Um anel de progresso
por cima dela — ou uma barra fina no pé — responde "quanto falta" sem clicar,
e é a informação que decide se você abre aquele livro hoje.
**Custo:** duas horas. O dado já está no `progresso`.

## 12. Ler dois livros ao mesmo tempo, sem perder nenhum

Hoje o progresso é por obra e funciona, mas a interface trata leitura como uma
coisa só. Quem lê três de uma vez — e todo leitor pesado lê — precisa de uma
tela que diga onde parou em cada um, e há quanto tempo não toca no terceiro.
**Custo:** meio dia.

## 13. Citação que se copia com a fonte junto

Marcar um trecho é fácil; usar depois é que não. Copiar deveria sair já
formatado: *"trecho" — Machado de Assis, Dom Casmurro, cap. XLVI*. Para quem
estuda Direito, com o artigo e a lei. Isso transforma o caderno de lembrança
em ferramenta de trabalho.
**Custo:** duas horas, e muda o uso.

## 14. Comparar duas versões de um artigo de lei

O Planalto serve o texto **compilado** — com as alterações já aplicadas. O que
o texto dizia antes da reforma some. Para Direito isso importa: metade da
discussão é sobre o que mudou e quando.
**O que falta:** guardar as versões e mostrar lado a lado. O LexML tem o
histórico.
**Custo:** três dias, e é a coisa que nenhum site de lei brasileiro faz bem.

## 15. Súmulas e jurisprudência

Leis são a base; súmulas do STF e do STJ são o que se cita no dia a dia. São
curtas, numeradas, e **livres pelo mesmo art. 8º**. Cada uma vira uma unidade
de leitura, e a busca textual que já existe passa a responder "o que o STJ diz
sobre isso".
**Custo:** dois dias.

## 16. A trilha visível dentro do livro

As trilhas existem no banco e aparecem como prateleira. Falta o fim: ao
terminar um livro, a tela devia dizer *"você está no 3 de 7 — o próximo é
este, e vem depois deste porque…"*. É o "Fio" do nome fechando o ciclo.
**Custo:** um dia, depois da melhoria 4.

## 17. Exportar o caderno como documento

O caderno baixa JSON, que serve para backup e para mais nada. Sair em Markdown
ou `.docx` — agrupado por livro, com as citações formatadas — é o que faz um
semestre de leitura virar material de estudo.
**Custo:** meio dia.

## 18. Uma página por tema, escrita

`/tema/Direito` hoje é uma grade filtrada. Podia abrir com dois parágrafos:
por onde começar, o que vem depois, e por que estas obras e não outras. Trinta
e duas páginas dessas são trinta e duas portas de entrada — e é o tipo de
texto que um buscador encontra.
**Custo:** um dia de código, e curadoria contínua.

## 19. Medir o que ninguém acha

Uma busca que não devolve nada é a informação mais valiosa que o site produz:
é uma pessoa dizendo o que ela esperava encontrar. Guardar os termos sem
resultado — **sem guardar quem buscou** — dá a fila de aquisição do acervo,
escrita pelos próprios leitores.
**Custo:** três horas, e precisa ser feito com cuidado de privacidade: termo e
data, nada mais.

## 20. Leitura em voz alta

O navegador tem síntese de voz embutida (`speechSynthesis`), de graça e sem
dependência. Para quem tem dificuldade de leitura, para quem quer ouvir no
trânsito, e para acessibilidade de verdade — não a de rótulo.
**Custo:** um dia. O texto já está partido em capítulos, que é o formato de
que a fala precisa.

---

## Onde encaixar

11, 13 e 17 são horas soltas que mudam o uso diário — cabem em qualquer
semana. 14 e 15 são o que faria deste o melhor lugar em português para ler
Direito, e nenhum outro site faz. 19 é a que se paga sozinha: depois de um
mês, ela diz o que construir em seguida melhor do que qualquer lista.
