# Indexação e divulgação — o que já está feito e o que falta

20/09/2026. O dono trouxe uma conversa com o GPT sobre a estrutura do site
antes de divulgar, e pediu para aplicar o que desse e listar o resto.

---

## Antes de tudo: o GPT auditou o domínio errado

Ele testou **`fiolib.com`** e recebeu 502. O nosso é **`fiolib.com.br`**.
`fiolib.com` não é nosso e não responde a nada — o 502 dele não diz nada sobre
este site. Conferido no mesmo dia:

```
fiolib.com      → não resolve, sem resposta
fiolib.com.br   → 200 em 0,61 s
```

Tudo o que ele concluiu a partir daquele 502 ("pode haver um problema técnico
antes de divulgar") não se aplica. O resto do que ele escreveu é conselho
genérico correto, e está tratado abaixo.

---

## O estado real, medido como o Googlebot vê

| Conferido | Resultado |
|---|---|
| `robots.txt` | certo, com `Sitemap:` apontando para o nosso |
| `sitemap.xml` | 200, **5.901 endereços** |
| `/` | 200, com `<title>`, description, canonical, JSON-LD `WebSite` + `Organization` |
| `/livros` | 200, 240 links internos, 2.000 palavras |
| `/livro/:id` | 200, `Book` + `Person` + `ReadAction` + `BreadcrumbList`, canonical, **og:image (a capa)**, h1, texto de verdade |
| `/autor/:id` | 200, `Person`, redireciona para a forma com nome |
| Renderização | **não depende de JavaScript** — a vitrine é HTML de servidor |

A preocupação do GPT com "o crawler recebe `<div id=root></div>`" não se
aplica: o app é hash-routed e o Google nunca chega nele; quem responde nos
endereços indexáveis é `servidor/http/vitrine.mjs`, que escreve HTML pronto.

**Indexado?** Ainda não, em nenhum buscador (conferido em 20/09 no DuckDuckGo
e no Bing: nenhum resultado para `site:fiolib.com.br`). **Isso é normal.** O
domínio foi registrado em 18/09. Para site novo o Google fala em dias a
semanas, e ele não promete prazo.

---

## O que foi consertado hoje

### 1. Soft-404 · era o defeito grave

Qualquer endereço sem extensão respondia **200** com a casca do app:

```
/pagina-que-nao-existe-xyz   200   (4.510 bytes, iguais à home)
/categoria/filosofia         200   (idem)
/admin                       200   (idem)
```

Para uma pessoa é inofensivo. Para o Google é um site com infinitas páginas
idênticas — ele tem nome para isso, *soft 404* —, e o custo é gastar o
orçamento de rastreio em endereços que não existem, justamente quando estamos
tentando ser indexados pela primeira vez.

Agora o corpo continua sendo a casca (quem digitou errado vê o site
funcionando) mas o status diz a verdade. De quebra, `/admin` e
`/../../etc/passwd` deixaram de responder 200 para quem varre o site.

### 2. Páginas de assunto · era o buraco estrutural

O GPT estava certo neste ponto, e era o mais caro. Quem procura *"livros de
filosofia para ler online"* não procura um título — procura um assunto, e o
Google não tinha por onde entender que a Fiolib **tem** filosofia.

Os temas já existiam no catálogo e já apareciam na ficha do livro, como selo
cinza sem link: etiqueta decorativa. Agora são páginas de verdade:

```
/assuntos                    o índice
/assunto/poesia              634 livros
/assunto/direito             618
/assunto/contos              608
/assunto/historia            499
/assunto/romance             366
/assunto/filosofia           116
…24 assuntos no total
```

Cada uma com `CollectionPage` + `ItemList`, canonical, no sitemap, e ligada de
todas as fichas que carregam aquele assunto. É o degrau que faltava entre a
home e um livro. Assunto com menos de 4 livros não vira página: conteúdo raso
não merece indexação.

### 3. Cartão de compartilhamento · meio feito

A ficha de livro já tinha imagem no cartão (a capa). A home, as listas e os
assuntos não tinham nenhuma — e link sem imagem no WhatsApp ou no Reddit é uma
linha de texto cinza que ninguém clica.

`infra/cartao-gerar.html` desenha o cartão 1200×630 com a marca. Precisa de
navegador porque a marca é Literata e desenhar texto com a fonte certa não se
faz em Node sem dependência.

**Falta você:** abrir `infra/cartao-gerar.html` no navegador, clicar em
"Baixar cartao.jpg", e mandar para a VPS:

```bash
scp -i ~/.ssh/fiolib-deploy cartao.jpg root@2.25.210.20:/opt/fio/site/cartao.jpg
```

A vitrine adota o arquivo sozinha no minuto seguinte, em todas as páginas que
não têm imagem própria. Enquanto ele não existir, nenhuma tag é escrita —
apontar `og:image` para um 404 é pior que não ter.

---

## O que você faz, e quando

### Esta semana

1. **Search Console → Inspeção de URL** em `https://fiolib.com.br/`. O que
   aparecer ali responde a sua pergunta de verdade, e é uma de quatro coisas:

   | O que diz | O que significa | O que fazer |
   |---|---|---|
   | "URL não está no Google" + nada mais | ainda não descobriu | esperar; o sitemap já foi enviado |
   | "Descoberta — não indexada" | achou, não rastreou | esperar; é fila dele |
   | "Rastreada — não indexada" | leu e não quis | aí sim há trabalho: conteúdo ou qualidade |
   | "URL está no Google" | indexada | o assunto vira posicionamento, não indexação |

   Clique em **Solicitar indexação** para a home, para `/livros` e para
   `/assuntos`. Não adianta pedir para os 5.901 — há cota diária.

2. **Bing Webmaster Tools → URL Inspection**, o mesmo. O Bing costuma indexar
   site novo mais rápido que o Google, e é o índice que alimenta vários
   produtos de IA.

3. **Subir o `cartao.jpg`** (acima).

4. **Rodar o IndexNow de novo** depois que as páginas de assunto entrarem no
   sitemap — ele avisa Bing, DuckDuckGo, Yandex e Ecosia na hora:

   ```bash
   ssh -i ~/.ssh/fiolib-deploy root@2.25.210.20 "docker exec -e FIO_SITE=https://fiolib.com.br -e FIO_ESTATICO=/site infra-fio-1 node ingestao/avisar-buscadores.mjs"
   ```

   (já roda sozinho todo dia às 04:35; isto é só para não esperar)

### Enquanto espera a indexação — e não depois dela

Não existe vantagem em esperar o Google para começar a divulgar. É o
contrário: **link de gente de verdade é o que faz o Google indexar mais
rápido**, e um domínio novo sem nenhum link apontando para ele é exatamente o
caso mais lento que existe.

Os textos estão em `docs/DIVULGAR.md`, na seção escrita depois da recusa do
Reddit. A ordem que vale:

1. responder perguntas reais com o link **do livro**, não da home;
2. o post sobre a tradução do Orwell, que é notícia de direito autoral e não
   anúncio;
3. os subs que aceitam projeto próprio (r/SideProject, r/brdev, r/portugal).

### Semana que vem, se a indexação andar

- **Posicionamento** é outro assunto, e vem depois. A ordem natural é:
  `site:fiolib.com.br` aparece → `Fiolib` aparece → `biblioteca online
  grátis` aparece. Consulta concorrida ("baixar livros") leva meses e não é
  onde começar.
- **Mais "chamada" por livro.** Hoje só 28 livros têm a frase curada, e a
  descrição dos outros cai para o primeiro parágrafo do texto — que muitas
  vezes começa no meio de uma frase. É o que mais melhoraria a aparência na
  busca, e é curadoria, não código.
- **Assunto nos livros novos.** As traduções recentes da esteira entram sem
  tema (*O Morro dos Ventos Uivantes* não aparece em nenhum assunto). Quanto
  mais livros com tema, mais forte fica cada página de assunto.

### Quando tiver leitores

- **Core Web Vitals** no Search Console, com dados de gente de verdade. Medir
  antes de ter visita é medir o vazio.
- **Monitor externo** de site fora do ar (pendência de `docs/LANCAMENTO.md`):
  um pico de visita num site fora do ar não volta.

---

## O que não vale a pena fazer

- **Palavra-chave espalhada no texto.** O site tem 4.432 livros e 113 milhões
  de palavras em português; o conteúdo já existe. O que faltava era
  *estrutura*, e era o que estava faltando de verdade.
- **Esperar estar em primeiro lugar para divulgar.** Ver acima.
- **Comprar link ou postar em massa.** `docs/DIVULGAR.md` explica por que isso
  derruba o domínio novo em vez de levantá-lo.
