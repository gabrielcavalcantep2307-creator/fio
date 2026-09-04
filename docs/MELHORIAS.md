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

## 2. Legislação brasileira: o único jeito de ter Direito legível

**O problema.** Direito é o maior tema do acervo (247 obras) e **nenhuma dá
para ler aqui** — são todas manuais comerciais, no trilho B. É a categoria que
mais interessa ao dono da biblioteca, e a mais vazia.

**A saída.** A Lei 9.610/98, art. 8º, diz que **texto de lei e decisão
judicial não são obra protegida**. Constituição, códigos, súmulas e acórdãos
são livres por definição — não há cinza jurídico nenhum.

**O que falta.** Um ingestor do Planalto e do LexML. O formato é estável, e a
estrutura de artigo/parágrafo/inciso cai bem no modelo de capítulo que já
existe: cada artigo vira uma unidade, e o anti-spoiler não se aplica.

**Custo.** Dois dias. É a maior mudança de acervo por hora de trabalho que
existe hoje — de 0 para "a CF/88 inteira, lida no leitor".

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

## 4. Trilhas de leitura

**O problema.** "Você terminou. E agora?" não tem resposta. A página da obra
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
