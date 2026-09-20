# Conseguir leitores de verdade (sem virar spam)

20/09/2026. O dono quer gente usando o site para valer, e perguntou se dá para
"espalhar pela internet de um jeito automático".

## O que NÃO vamos fazer, e por quê

Postar sozinho, por robô, em grupos, fóruns e redes sociais. Três motivos, e
nenhum deles é moral:

1. **Mata o Google.** Link em massa de lugar nenhum é exatamente o padrão que o
   algoritmo aprende a punir. Depois de marcado como spam, o domínio novo leva
   meses para sair da caixa — e é o oposto do que estamos construindo.
2. **Mata as contas.** Reddit, X, Discord e WhatsApp detectam e banem número,
   conta e link. Perde-se o canal e o endereço junto.
3. **Não traz leitor.** Traz clique de passagem, que não cria conta, não lê e
   não volta. Para testar o site de verdade é preciso gente que queira ler.

## O que dá para automatizar, e já está feito

| Feito | O que é |
|---|---|
| **IndexNow** (`node ingestao/avisar-buscadores.mjs`) | avisa Bing, DuckDuckGo, Yandex e Ecosia de cada página, com uma chave que só o dono do site pode publicar. 5.843 endereços enviados em 20/09. Rodar de novo quando a esteira soltar livros novos |
| **Sitemap + robots + páginas por livro e autor** | o que o Google lê sozinho (docs/GOOGLE-BUSCA.md) |
| **Botão "Compartilhar"** na página de cada livro | no celular abre a folha do sistema (WhatsApp, Telegram…); no computador copia o link. Sem script de rede nenhuma |
| **Cartão de link** (título, descrição e capa) | quando alguém cola o link, aparece a capa do livro e a frase da obra |

## O que só você pode fazer (e vale dez vezes mais)

Poste você, como dono, dizendo que é seu. É isso que gera os primeiros links
reais — e link de gente de verdade é o que o Google conta.

**Onde, em ordem de retorno para um site de livros em português:**

1. **Reddit** — r/livros, r/brasil, r/EstudosBrasil, r/desabafos (não), r/webdev
   (para a parte técnica). Poste no fim da tarde, dia de semana.
2. **Grupos de WhatsApp e Telegram** de leitura, vestibular, concurso e direito
   (as leis inteiras são um chamariz forte aí).
3. **Twitter/X e Bluesky**, com uma imagem da tela do leitor.
4. **TikTok e Instagram (Reels)**: 20 segundos mostrando abrir um clássico e
   ler sem cadastro. É o que mais converte hoje para público jovem.
5. **Professores e bibliotecas escolares**: um e-mail curto vale uma turma.
6. **Comunidades de domínio público**: listas "awesome" no GitHub, fóruns de
   Projeto Gutenberg e Wikisource em português.
7. **Product Hunt / Hacker News** (Show HN) — público técnico, bom para
   feedback sobre o leitor.

## Textos prontos (copie e cole)

**Reddit — r/livros**

> Fiz uma biblioteca online em português e queria a opinião de vocês
>
> Passei os últimos meses montando a Fiolib (fiolib.com.br): uma biblioteca com
> 4.500 livros em domínio público em português — Machado, Eça, Lima Barreto,
> Álvares de Azevedo — mais as leis brasileiras inteiras e clássicos
> estrangeiros que estou traduzindo aos poucos, porque muita coisa boa nunca
> ganhou tradução livre.
>
> Dá para ler sem conta (o primeiro capítulo de qualquer livro). Com conta
> grátis, o livro inteiro. Não tem anúncio, não tem rastreador e não vendo
> dado nenhum — é um projeto pessoal, não uma startup.
>
> O que eu queria mesmo: gente lendo de verdade para achar o que está ruim. O
> leitor tem paginação, marcação, modo noturno e voz. Se acharem algum livro
> com o texto embaralhado (tem uns que vêm de digitalização antiga), me digam
> qual que eu arrumo.

**WhatsApp / Telegram (curto)**

> Terminei um projeto que eu queria muito: uma biblioteca online, de graça, com
> 4.500 livros em português — clássicos, poesia e as leis inteiras.
> fiolib.com.br — sem anúncio e sem pegadinha. Se puderem abrir e me dizer o
> que acham (e o que está quebrado), ajuda demais.

**Twitter/X, Bluesky**

> Lancei a Fiolib: 4.500 livros em português para ler de graça no navegador.
> Clássicos em domínio público, as leis brasileiras inteiras e traduções que eu
> mesmo faço dos que nunca chegaram por aqui.
> Sem anúncio. Sem rastreador. Sem app para instalar.
> fiolib.com.br

**TikTok / Reels (roteiro de 20 s)**

> (tela do celular abrindo o site)
> "Achei um site com 4.500 livros de graça, em português."
> (rola a estante, abre Dom Casmurro, vira duas páginas)
> "Dá para ler sem criar conta. Sem anúncio, sem propaganda no meio."
> (mostra o modo noturno e a voz lendo)
> "Tem até as leis inteiras, para quem estuda. Fiolib ponto com ponto br."

**E-mail para professor ou biblioteca**

> Assunto: biblioteca online gratuita em português para os alunos
>
> Bom dia, professor(a). Sou o Gabriel e mantenho a Fiolib
> (https://fiolib.com.br), uma biblioteca online gratuita com cerca de 4.500
> obras em domínio público em português — literatura brasileira e portuguesa,
> poesia, filosofia e as leis brasileiras na íntegra.
>
> O site não tem anúncios, não pede dados além de um nome de usuário e funciona
> no celular sem instalar nada. Se for útil para a sua turma, fique à vontade
> para usar e indicar. Qualquer problema no texto de um livro, me avise que eu
> corrijo.

## Depois de postar

- Veja quem chegou e o que leu: **painel → Panorama** (contas novas e livros
  mais abertos), e **Assinaturas** para os pedidos de presente.
- O aviso de site fora do ar (docs/LANCAMENTO.md) importa mais quando a
  divulgação começa: um pico de gente num site fora do ar não volta.
- Responda todo mundo que comentar. A primeira dúzia de leitores fiéis vale
  mais que mil cliques.

---

# O Reddit recusou. Por quê, e o que fazer no lugar (20/09/2026)

O dono postou e ouviu que estava se autodivulgando, contra as diretrizes. Não
foi azar nem moderador ranzinza: **o texto da seção anterior é, na forma, um
anúncio** — "fiz um site, aqui está o link". Quase todo sub de livros barra
isso por definição, e o r/livros tem regra explícita contra divulgação de
projeto próprio.

## A diferença que o Reddit mede

Não é o link. É **de quem é o post**.

| Recusado | Aceito |
|---|---|
| o post é sobre o seu site, e o leitor ganha um link | o post é sobre o que o leitor quer, e o link é onde aquilo está |
| "fiz uma biblioteca, deem uma olhada" | "levantei todos os livros do Machado que estão em domínio público; segue a lista" |
| você aparece como dono pedindo atenção | você aparece como alguém que sabe do assunto e respondeu |

A regra prática que os moderadores aplicam é a **proporção 9:1**: para cada
post seu sobre coisa sua, nove participações em que você não ganha nada. Uma
conta criada hoje que estreia com o próprio link é, para eles, um anúncio —
independentemente do que o site seja.

## Os três caminhos que funcionam, em ordem

### 1. Responder, não anunciar

É o melhor retorno e o de menor risco. Toda semana alguém pergunta em
r/livros, r/brasil, r/estudosbrasil, r/concursospublicos:

> "onde consigo ler *Dom Casmurro* de graça?"
> "tem algum lugar com a CLT inteira para ler?"
> "queria começar a ler clássico mas não tenho dinheiro"

Responda de verdade — indique a obra, diga em que edição, e aí sim o link
direto **do livro**, não da home:

> `https://fiolib.com.br/livro/NNN`

Isso não é divulgação: é a resposta certa para a pergunta. E é o único jeito
em que o link chega junto com uma razão para clicar.

### 2. Postar o TRABALHO, e não o produto

O que você tem e quase ninguém tem é assunto de verdade. Três postagens que
se sustentam sozinhas, mesmo que ninguém visite o site:

**a) A tradução, que é uma notícia de fato**

> **1984 e A Revolução dos Bichos estão em domínio público no Brasil desde
> 2021, e não havia tradução livre em português. Fiz uma.**
>
> Orwell morreu em 1950, então desde 2021 as obras dele são de domínio público
> aqui (Lei 9.610, art. 41: 70 anos). Só que domínio público vale para o
> ORIGINAL — toda tradução publicada no Brasil continua tendo dono, que é o
> tradutor. Na prática, o livro é livre e ninguém pode ler de graça em
> português.
>
> O art. 14 diz que quem traduz uma obra livre é autor da tradução. Então
> traduzi as duas do inglês. Estão aqui, de graça, e a tradução é automática e
> revisada, com o aviso na tela: [links]
>
> Fiquei com uma dúvida que talvez alguém daqui saiba responder: [pergunta
> real sua sobre direito autoral]

Isso é um post sobre **direito autoral e domínio público** que por acaso tem
seus links. Nenhum moderador chama de spam, e o pessoal de r/brasil e
r/direito discute com gosto.

**b) A lista, que é serviço**

> **Levantei os 4.500 livros em português que estão em domínio público e dá
> para ler online. Segue o que achei de mais esquecido.**
>
> (e aí uma lista de verdade, com 15 ou 20 títulos e uma linha sobre cada:
> Lima Barreto além do Policarpo, as poetisas do século XIX, os livros de
> viagem, o que o Gutenberg tem em português e ninguém sabe.)

Poste a lista **no corpo do post**, não atrás do link. Quem quiser ler clica.

**c) A coisa técnica, em r/brdev**

> **Fiz uma biblioteca com 4.500 livros em Node sem uma dependência sequer.
> SQLite, 175 req/s num núcleo. O que eu aprendi.**

Público técnico gosta de número e de decisão explicada. Esse post pode ser
sobre o site abertamente — em sub de programação, projeto próprio é conteúdo.

### 3. A porta da frente

Vários subs têm o lugar certo para isso, e aí é permitido:

- o **post fixo semanal** ("Self-promotion Saturday", "Divulgue seu projeto");
- **r/SideProject**, **r/InternetIsBeautiful**, **r/DigitalHumanities**,
  **r/brdev**, **r/portugal** — todos aceitam projeto próprio;
- **r/books** e **r/freeEbooks** em inglês, falando do acervo em português
  (público pequeno, mas legítimo).

## O que ajuda antes de postar

- **Conta com história.** Conta nova postando link é o gatilho automático.
  Participe uma ou duas semanas antes, sem link nenhum.
- **Link do livro, não da home.** Levar para a home é publicidade; levar para
  a obra que a pessoa procurava é resposta.
- **Diga que é seu.** Esconder é o que vira banimento. "Eu mantenho esse site"
  numa linha resolve, e vira honestidade em vez de propaganda.

## Sobre eu espalhar isso por você

Não vou postar em seu nome, e não é pudor: eu não tenho — nem devo ter — conta
sua no Reddit, no X ou em grupo nenhum, e post automático assinado como você é
exatamente o padrão que faz o link ser marcado como spam e o domínio novo
apanhar no Google por meses. Perderíamos o canal e o endereço.

O que eu faço, e já está no ar: **IndexNow** avisa Bing, DuckDuckGo, Yandex e
Ecosia a cada livro novo, sem pedir nada a ninguém; o sitemap e as páginas por
livro e por autor entregam o acervo ao Google; e o cartão de link faz a capa
aparecer quando você cola o endereço em qualquer lugar. Essa parte é
automática e é a que escala sem custo.

O resto são doze postagens suas, escritas acima. Doze postagens de gente de
verdade valem mais, e são a única coisa que o algoritmo do Google conta como
recomendação.
