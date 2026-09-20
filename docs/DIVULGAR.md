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
