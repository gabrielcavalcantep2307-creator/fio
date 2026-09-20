# Fio — o projeto inteiro, em 18/09/2026

Uma biblioteca em português que liga um livro ao próximo. No ar em
<https://fiolib.com.br> (domínio próprio desde 18/09/2026, Registro.br, ID GACPE180), na mesma VPS do Wallt.
Os endereços antigos (`fiolib.duckdns.org`, `fio.142-93-57-2.sslip.io`) e o `www` redirecionam (308) para ele.

**Caddy:** o Caddy é da Fiolib (serviço `caddy` em `infra/docker-compose.yml`, container `infra-caddy-1`). Desde 20/09/2026 a máquina é só dela (2.25.210.20, Hostinger); o Wallt ficou na antiga com o Caddy dele. Configuração: `infra/Caddyfile` (os imports) e `infra/Caddyfile.fiolib` → `/opt/fio/caddy/`. Publicar com `bash infra/publicar-caddy.sh` (valida antes). O registro de acesso fica em `/opt/fio/logs`. Detalhes em docs/VPS.md.

Este é o documento de entrada: o que existe, onde mora, como se opera, quais
armadilhas já custaram caro e o que falta. Os detalhes de cada assunto estão
nos outros arquivos de `docs/` (índice no fim).

---

## 1. Os números de hoje

| | |
|---|---|
| Obras no catálogo | **5.077** |
| Para ler inteiras aqui | **4.432** (113 milhões de palavras, 88 mil capítulos) |
| Traduzidas por nós (esteira) | **41**, e o plano da esteira com **203** (86 clássicos populares entraram em 18/09: Jane Eyre, O Morro dos Ventos Uivantes, Mulherzinhas, Sherlock, Padre Brown, Arsène Lupin, Wilkie Collins…) |
| Leis oficiais completas | **25** (Constituição, códigos, estatutos) |
| Obras com capa | **1.921** — 1.405 locais (711 desenhadas por tema, 25 de lei), 516 da Open Library |
| Seções de descoberta na home | **17** curadas + 4 mantidas + "A lei, na íntegra" |
| Quadrinhos e mangá para ler aqui | **40 séries, 186 volumes, 9.045 páginas** |
| Mangá, manhwa e manhua para descobrir | **milhares** (AniList, consultado na hora), com onde ler oficialmente |
| Publicações da comunidade | seção nova (17/09): livros e quadrinhos de assinantes Trama/Tear, com revisão |
| Planos | sem conta: 1º capítulo · Grátis: 3 livros/mês · Novelo R$ 9,90 · Trama R$ 19,90 · Tear R$ 34,90 — **ainda sem pagamento**, concedidos pelo painel |
| Contas | 2 (ambas admin) · cadastro **aberto** · portão de leitura **ligado** |

## 2. A regra que vem antes de tudo

**Só entra o que se pode servir legalmente em português.**

- **Domínio público no Brasil:** autor morto há mais de 70 anos (Lei 9.610/98, art. 41). Em 2026, morto até 1955.
- **Tradução é obra nova, com dono** (art. 7º). Tradução comercial de um livro livre continua protegida, então **nós traduzimos do original** (art. 14 garante esse direito). Quando a fonte é uma tradução inglesa, o **tradutor** também precisa estar em domínio público.
- **Lei não tem dono** (art. 8º, IV). Constituição, códigos e estatutos entram inteiros.
- **Licença livre** (CC-BY e afins) entra com o crédito que a licença pede.
- Não entra: scan pirata, PDF de editora, "tradução maquiada", mangá ou manhwa comercial.

A resposta curta para pedido de livro protegido: dizer em uma frase por que não dá, e apontar para traduzir o original livre (`docs/CRESCER.md`).

## 3. Arquitetura

```
 navegador
    │  HTTPS
 Caddy (VPS) ── CSP, HSTS, cabeçalhos
    │
 container infra-fio-1  (Node 22, zero dependências)
    ├── servidor/api.mjs       site estático + API no MESMO processo (cookie sem CORS)
    ├── /dados/catalogo.db     SQLite (node:sqlite), ~2 GB — catálogo E contas
    └── /site  (somente leitura) ← /opt/fio/site no host
          ├── index.html + ativos/index-<hash>.js   o app React (bundle REMENDADO)
          ├── dados/catalogo.json, dados/fichas/*.json, dados/quadrinhos.json
          ├── capas/  (jpg, lei-*.svg, des-*.svg)
          ├── quadrinhos/<série>/<volume>/<página>.jpg
          └── central.html, quadrinhos.html, quadrinho.html, meus-livros.html  (+ .js)

 VPS, container infra-esteira-1 (mesma imagem, mesmo banco)
    └── esteira de tradução, para sempre (servidor/esteira-trabalhador.mjs) → MinT / DeepL
```

### O site no ar é um bundle remendado — nunca rode `infra/publicar.sh`

O fonte React da versão no ar **nunca foi commitado**. `web/src` é uma geração
mais velha (sem perguntas de segurança, resenhas nem busca no texto).
Reconstruir a partir dele **apaga** essas telas; por isso `publicar.sh` tem uma
trava.

Toda mudança no app vira um **remendo registrado** em `infra/remendar-bundle.mjs`:
âncora exata, quantas vezes deve aparecer, e o que entra no lugar. O script parte
do bundle ORIGINAL (`/opt/fio/site/ativos/index-DBmeFHaL.js`, **nunca apagar**),
aplica tudo em ordem, recusa se alguma âncora não bater, e gera
`index-<hash>.js` + `index.html`. São 29 remendos hoje:

- login por usuário OU e-mail
- links **painel** (só admin), **para você** (com contador de avisos) e **quadrinhos** no cabeçalho
- nome no cabeçalho pula abreviação ("Sr. Livrario" → "livrario")
- home: prateleira **Para você**, convite ao questionário, chamada dos quadrinhos, sem prateleiras genéricas de tema
- botões de humor em "Não sabe o que ler?"
- ficha do livro: **Antes de ler** e **Este livro conversa com**
- depois de criar conta → questionário de gosto
- apagar conta sem e-mail (confirmação pelo nome de usuário)
- a tela antiga de conta ("Olá, … · perfil senha perguntas…") leva para **`/conta.html`**
- espaços vazios na **estante** e no **caderno** que `fio-app-extras.js` preenche (meta do ano, revisão do dia)
- livro em **amostra** não fica no cache do app (antes, entrar na conta e voltar mostrava ainda só o 1º capítulo)

Estilo novo vai **em linha**: o CSS no ar só tem as classes Tailwind que o build
antigo usou.

Telas grandes demais para remendo são **páginas próprias** (HTML + JS sem
dependência, texto sempre por nó de texto): painel, central, quadrinhos,
comunidade, publicar, planos, conta, direitos.

### O cabeçalho e o rodapé são de fora do bundle (19/09/2026)

`web/public/fio-cabecalho.js` desenha a MESMA barra e o MESMO rodapé no app e
nas páginas próprias: Buscar · Estante · Quadrinhos ▾ · Comunidade ▾ e, no
canto, tema, painel (só admin), sino de notificações e perfil. Dois remendos
fazem o cabeçalho e o rodapé do bundle não desenharem nada; o cabeçalho do app
só entrega `window.fioAbrirBusca` e `window.fioMudarPrefs`. Ali também moram
os convites aos planos (docs/NOTIFICACOES-E-PLANOS.md).

## 4. O acervo e como ele cresce

### Livros
- **Gutenberg em português** (~700): praticamente esgotado.
- **Traduções nossas:** a esteira (seção 5).
- **Leis:** `ingestao/legislacao.mjs` puxa do Planalto, corta por artigo, é idempotente, tem teto de 90 s por página e aceita `FIO_SO_LEI=trecho` para reprocessar uma só.

### Capas
- `ingestao/capas-bonitas.mjs` troca capa ruim (a arte genérica de triângulos do Gutenberg, 200×300, e folha de rosto cinza) pela edição mais reeditada da Open Library, **só se** o sobrenome do autor bater e a imagem for colorida. Guarda o progresso em `/dados`, então um deploy não o perde.
- `ingestao/capas-desenhadas.mjs` desenha capa com identidade por tema para quem não tem capa real em lugar nenhum: poesia é noite estrelada, história é pergaminho com bússola, filosofia é sol em pedra, religião é vitral, teatro é cortina, ciência é grade, romance é moldura de livraria.
- `ingestao/capas-de-lei.mjs` faz a capa de edição oficial das leis.

### Seções de descoberta
A home é por **experiência**, não por gênero. A curadoria mora em
`servidor/servicos/descoberta.mjs`: seções, ordem e as fichas "Antes de ler", ideias e
conversas de 28 livros centrais. `ingestao/secoes.mjs --gravar` grava no banco e
aposenta as antigas. `ingestao/publicar.mjs` ordena as seções, esconde coleção
sem nada legível (não existe mais a vitrine "O que ainda não podemos servir") e
põe a curadoria nas fichas. O checklist do direcionamento de 16/09 está em
`docs/DESCOBERTA.md`.

### Quadrinhos e mangá
`ingestao/quadrinhos.mjs` monta o catálogo e a lista de download. Cada volume
tem o direito conferido na hora:

| Série | Fonte e direito |
|---|---|
| **Pepper&Carrot** (37 ep., colorido, pt-BR oficial) | CC-BY 4.0, David Revoy — crédito em cada episódio |
| **Hokusai Manga** (14 vol.) | domínio público, Smithsonian Libraries |
| **Yōkai: o bestiário de Toriyama Sekien** (11 vol.) | domínio público, Smithsonian |
| **Bordalo Pinheiro** (4 vol., português, caricatura) | domínio público (autor morreu em 1905) |
| **+30 álbuns do Japão de Edo** (Hiroshige, Utamaro, Kōrin, Morikuni…) | domínio público, Smithsonian |
| **Little Nemo no País dos Sonhos** (11 vol., 260 páginas de domingo, 1905–1911, colorido) | domínio público (McCay morreu em 1934; publicado antes de 1931), digitalizações do Wikimedia Commons — `ingestao/quadrinhos-commons.mjs` |
| **Wilhelm Busch** (Max und Moritz, Fipps, Julchen — 3 vol.; *Plish and Plum* ficou fora, 3 páginas somem no Archive), **Benjamin Rabier** (3), **Buster Brown** (3), **Töpffer** (o primeiro álbum, 1), **Willie e o papai** (Opper, 1), **Bordalo** agora com 11 vol. | domínio público (todos morreram antes de 1955), Internet Archive, Smithsonian e Commons — `ingestao/quadrinhos-extras.mjs` (18/09) |

**Tradução dos balões** (`ingestao/quadrinhos-ocr.mjs`): OCR lê cada página e devolve os blocos de texto com a posição; a esteira (MinT) traduz; o resultado vai para `/dados/quadrinhos-traducao/<serie>.json` e o leitor põe a tradução **sobre cada balão**, com botão PT/original (tecla T). Motores: **Google Cloud Vision** (lê letra desenhada à mão; precisa de chave em `dados/.chave-google-vision`, 1.000 imagens/mês grátis) ou o **OCR do Windows** (`ingestao/ocr-windows.ps1`, grátis e local, mas perde a maior parte da letra à mão — serve para letra tipográfica). Retomável por página; bloco de baixa confiança sai marcado para revisão.

**Mangá, manhwa e manhua modernos — o catálogo de descoberta** (`servidor/mangas.mjs`, aba *Descobrir* e prateleira "Mangá e manhwa em alta" na home). Não hospedamos essas obras: o Fio consulta o **AniList na hora**, com cache de 30 min e teto de 25 chamadas por minuto (os termos da API proíbem coletar e guardar o catálogo). Filtros: tipo (mangá, manhwa, manhua), cor (tag *Full Color*), gênero, status, ordem e "só com versão oficial em português". A ficha lista **onde ler oficialmente**, com as plataformas em português primeiro (MANGA Plus, Comikey…), e os títulos parecidos. As capas passam pelo nosso proxy (`/api/capa-manga/...`), que só aceita o CDN de capas do AniList. Ecchi e adulto ficam fora, e há freio de 90 buscas por minuto por faixa de IP.

Ficaram de fora da leitura dentro do Fio: **mangá e manhwa comerciais** (têm dono duas vezes, o autor e a
editora da tradução) e o "manhwa traduzido PT-BR" do Internet Archive, que é scan
pirata.

O download roda **no host da VPS**, fora do container:
`/opt/fio/entrada/baixar-quadrinhos.sh`, com 6 downloads em paralelo, retomável.
`ingestao/quadrinhos-prontos.mjs` publica só volume **inteiro**. Rode-o duas
vezes ao publicar: sem flag gera `dados/quadrinhos.json` (o leitor), e com
`--resumo` gera `dados/quadrinhos-resumo.json` (25 KB, só capas e contagens). O
resumo alimenta a prateleira **Quadrinhos e mangá** da home, logo antes do Top 10.

O leitor (`quadrinho.html`) tem modos rolagem, página e dupla, sentido ocidental
ou mangá (direita→esquerda, com setas, toque e deslize invertidos), zoom,
interface que some durante a leitura, e progresso e preferências por série no
navegador.

## 5. A esteira de tradução

Não é "IA do Claude": é o **MinT**, o serviço de tradução automática da
Wikimedia, grátis e sem chave.

**Desde 18/09/2026 a esteira é um serviço da API, na VPS, e roda para sempre.**
É o serviço `esteira` do `infra/docker-compose.yml`: mesma imagem e mesmo
banco da API, container à parte (448 MB, 0,8 CPU, `restart: unless-stopped`),
comando `node servidor/esteira-trabalhador.mjs`. À parte porque `node:sqlite`
é síncrono (instalar e republicar dentro da API travariam o site) e para um
livro pesado derrubar a esteira, nunca o site. O PC não participa mais.

A fila do banco (`fila_traducao`) é a única lista de trabalho. A cada volta:
1. promove o que o painel e os assinantes pediram (`espera` → obra → `na_esteira`);
2. se pausada no painel, espera;
3. mede o tamanho de todas as fontes novas (HEAD com `accept-encoding: identity`; com gzip o Gutenberg não diz o tamanho);
4. escolhe: pedido de assinante → livro já começado (tradução pronta ou caderno) → do menor para o maior;
5. traduz com `ingestao/traduzir-obra.mjs` num processo filho (caderno em `/dados/esteira`, 8 em paralelo, freio adaptativo); filho sem avançar 1 h é morto;
6. instala (`instalarTraducao`), põe na busca **só aquele livro** (`indexarTexto`/`indexarObra`, menos de 1 s) e marca pronto (quem pediu recebe aviso);
7. republica `catalogo.json` e `fichas/` (`ingestao/publicar.mjs`, ~30 s, troca por `rename`; recusa catálogo com menos de 90% das obras).

Falha: volta sozinha em 30 min, 2 h, 8 h, 1 dia e 3 dias; depois vira `erro`,
e o painel tem "tentar de novo". Fonte que não é livro e 404 vão direto para
`erro`. Serviço de tradução fora do ar: espera 10 min sem gastar tentativa.
Vigia: nada avançou em 3 h, o processo sai e o Docker religa.

O pulso vai direto para `esteira_pulso` (sem HTTP); o painel mostra ao vivo e
tem **Pausar/Retomar**. `ingestao/esteira.mjs` e `puxar-fila.mjs` (do PC) só
rodam com `--aqui`, para não traduzir em dobro.

Logs: `docker logs -f infra-esteira-1` na VPS.

**Como acelerar (estudo de 18/09):** mandar vários parágrafos numa chamada só
ao MinT **não ajuda** (1,37 s por parágrafo em lote contra 0,44 s com 8 em
paralelo — o serviço processa em série). Modelo local neste PC (i5 sem placa de
vídeo) sai na mesma velocidade. O que acelera de verdade:
1. **Rodar 24 h** numa máquina que não dorme (a VPS aguenta a esteira; ela só manda texto e espera o MinT);
2. **API paga com cota grátis:** DeepL (500 mil caracteres/mês grátis) ou Google Translate (500 mil/mês) — 10 a 50× mais rápido, precisa de chave do dono;
3. **Quadrinhos:** o gargalo era o OCR da letra à mão. Resolvido sem pagar (18/09): **OCR.space**, motor 2, chave grátis por e-mail (25 mil páginas/mês, até 1 MB por página — a maior de Little Nemo tem 990 KB), agora o motor padrão de `ingestao/quadrinhos-ocr.mjs` (`OCRSPACE_CHAVE` no `.env`). Conferido numa página real: 33 balões lidos e traduzidos pelo DeepL em 18 s. O Google Vision exige pré-pagamento de R$ 150 em conta brasileira e ficou de lado.

**DeepL ligado (18/09):** chave grátis do dono em `DEEPL_CHAVE` (`.env` local e da VPS, fora do git), **1 milhão de caracteres por mês**. `ingestao/motor-traducao.mjs` escolhe o motor POR LIVRO: se o livro inteiro cabe no saldo do mês, guardando 200 mil (`DEEPL_RESERVA`) para os balões dos quadrinhos, vai todo pelo DeepL; senão, todo pelo MinT. Livro já começado continua no MinT. Na prática: 1 ou 2 romances por mês no DeepL, o resto no MinT.

## 5b. A revisora (20/09/2026)

O dono abriu livros traduzidos e achou "muitas palavras ainda na língua
original", e pediu um serviço que fique revisando sozinho — "igual à esteira,
mas mais controlado, porque se ficar sem controle vai quebrar todas as
traduções". É o serviço `revisora` do compose (`servidor/revisor-trabalhador.mjs`,
motor em `servidor/revisao.mjs`).

**O que o raio-x achou** (`ingestao/conferir-traducao.mjs`, 168 livros,
9,6 milhões de palavras):

| | |
|---|---|
| Palavra deixada na língua de origem | **0,21 %** — pouca, e concentrada |
| Pior caso | *O Castelo* 5,6 % e *O Processo* 3,5 % |
| A causa de verdade | **capítulo inteiro que a esteira pulou**: o cap. 15 d'*O Castelo* são 21.570 palavras em alemão, no ar |
| Invenções que parecem português | 79 mil ("trêscentos", "ruguiu", "fruncindo") — e boa parte são falso positivo do vocabulário, que é de livro velho |
| Parágrafo inteiro na origem | 42 em 250 mil |

**Ela não reescreve nada.** Faz três coisas fechadas: troca palavra de uma
lista escrita à mão (`servidor/glossario-revisao.json`, 32 entradas, cada uma
com a frase onde foi vista), manda ao MESMO motor da esteira o parágrafo — ou
o capítulo — que ficou na língua de origem, e conserta número por extenso
quebrado.

**A regra que decide se uma palavra pode entrar no glossário** (20/09, depois
da auditoria): *a palavra trocada tem que carregar, nela mesma, a flexão que a
substituta vai precisar.* Palavra estrangeira nunca carrega — "queer" não diz
se é masculino, "fluttered" não diz se é plural —, e as cinco entradas assim
que eu tinha escrito criaram "armadilha **estranho**", "os homens
**vistosas**" e "as bandeiras **esvoaçou**" no ar. Foram desfeitas (as 1.504
trocas, byte a byte) e proibidas: toda entrada declara uma `classe`, e só
`substantivo`, `numeral`, `adverbio` e `flexionada` passam — classe fora da
lista derruba o serviço ao subir. Hífen dos dois lados cancela a troca, porque
composto com hífen é quase sempre nome próprio ("Gay-Headers", em Moby Dick,
virou "Vistosas-Headers").

**Auditar antes de confiar:** `ingestao/auditar-revisora.mjs` mostra cada troca
NA FRASE em que ela caiu — é o único jeito de alguém dizer "isso está certo".
Roda em `--estado proposta` para conferir antes de aplicar. A ordem que passou
a valer: propor → auditar na frase → só então aplicar.

**As sete travas** (detalhadas no cabeçalho de `servidor/revisao.mjs`): escopo
só em `revisao='automatica'`; diário com o capítulo inteiro como estava
(`revisao_troca`, e `--desfazer` devolve byte a byte); tamanho dentro de ±40 %;
a marcação tem que continuar de pé; **prova depois** — o texto trocado é medido
de novo e só entra se ficou mais português; teto de trocas por capítulo e por
livro, que marca o livro `suspeito` e para; e o modo **propor** como padrão,
que grava a proposta e não encosta no texto.

**Onde ela aparece** (20/09, pedido do dono — "não estou vendo essa parte de
revisão aqui na esteira"): **painel → aba Esteira**, logo abaixo da esteira,
com modo, livro de agora, progresso, trocas feitas e as **recusas com o motivo
de cada uma**; interruptor na aba **Controle**; aviso no topo do painel; e
"desfazer tudo" a um clique. Mostrar as recusas é de propósito — elas parecem
defeito e são o contrário: são a prova de que as travas estão segurando.

```bash
docker logs -f infra-revisora-1
docker exec infra-revisora-1 node servidor/revisor-trabalhador.mjs --livro 4563
docker exec infra-revisora-1 node servidor/revisor-trabalhador.mjs --desfazer
```

Modo: `FIO_REVISORA` no `.env` (`parada`/`propor`/`aplicar`) ou o ajuste
`revisora` pelo painel, que só aceita os três valores da lista.

**Ainda de um capítulo só:** 38 livros. `ingestao/dividir-capitulos.mjs` acha
corte seguro em 10 deles (Sherlock, Padre Brown, Arsène Lupin, O Livro da
Selva) e recusa os outros 28. Ele **não roda sozinho** e o padrão é só mostrar;
`--gravar` é decisão humana, livro a livro.

## 6. Contas, segurança e o que cada leitor tem

- **Login:** usuário OU e-mail + senha. Senha em scrypt (N=2¹⁵) com sal próprio. Sessão opaca em cookie `__Host-` HttpOnly, SameSite=Lax, Secure. Freio de tentativas por conta e por faixa de IP.
- **CSRF:** toda escrita exige o cabeçalho `x-fio` e origem da própria casa.
- **Recuperação:** 3 perguntas de um catálogo fechado, respostas em scrypt, disfarce contra enumeração. Não há recuperação por e-mail.
- **Papéis:** `leitor` e `admin`, conferidos no banco a cada pedido. Rota de admin responde 404 para quem não é admin.
- **Cadastro:** o e-mail é opcional. Se a tela manda só o e-mail, deriva-se um nome de usuário válido e livre.
- **LGPD:** exportar tudo (inclui gosto e avisos); apagar a conta digitando o nome de usuário ou o e-mail, com cascata.
- **Barra superior única:** `fio-cabecalho.js` + `fio-cabecalho.css` + `fio-tema.js` repetem nas páginas soltas (quadrinhos, comunidade, publicar, planos, para você, painel) a mesma barra do app, com o mesmo tema (lido de `fio.estante.v1`). "buscar" marca `fio:abrir-busca` e o app abre a busca. Comunidade e "para você" têm sub-barra.
- **Painel** (endereço secreto `FIO_PAINEL`, só para a conta `curador` entrada pelo Google; `/admin.html` leva o admin até lá e é 404 para o resto; arquivos em `servidor/painel/`, fora da pasta pública — ver `servidor/http/painel.mjs` e docs/COMANDOS.md). Aba **Controle**: ligar/desligar site e esteira, o que roda, máquina, segurança, diário do painel:
  - Panorama e Esteira com **a esteira ao vivo**: livro de agora, % dos trechos, tempo restante, % do plano inteiro, últimos livros e log. A esteira manda um pulso (`ingestao/pulso.mjs` → `POST /api/esteira/pulso`, chave `FIO_ESTEIRA_CHAVE` no `.env` da VPS e em `dados/traducoes/.chave-esteira` no PC). Pulso com mais de 2 min = parada.
  - Publicações, Correções, Assinaturas.
  - Configurações: cadastro aberto; "sem conta, só o 1º capítulo"; livros por mês do plano grátis.
- **Planos** (`servidor/planos.mjs`, `servidor/acesso.mjs`, `/assinaturas.html`): sem conta lê o 1º capítulo de cada livro e o 1º volume de cada quadrinho; **Grátis** abre 3 livros novos a cada 30 dias (livro aberto não fecha; leis não contam); **Novelo** livros sem limite, ouvir, EPUB e 2 pedidos de tradução/mês; **Trama** + publicar até 3 obras e 5 pedidos; **Tear** até 20 obras, 15 pedidos na frente da fila e prioridade na revisão. Tudo conferido em `/api/livro/:id`, `/api/livro/:id/epub` (sem plano → planos) e nas imagens de quadrinho. **Ninguém assina sozinho ainda**: a página mostra preços e a comparação completa com o aviso de que o pagamento vem depois; o dono concede plano pelo painel (aba Assinaturas), com prazo opcional. Admin é sempre Tear. Tudo pergunta `planoDe()`; o gateway, quando vier, só grava `origem = 'pagamento'`.
- **Publicações** (`servidor/publicacoes.mjs`, `/publicar.html`, `/publicacoes.html`):
  - Só Trama (3 obras) e Tear (20 obras). Os tetos técnicos (capítulos, páginas, espaço) existem no servidor e não aparecem na vitrine.
  - Obrigatórios para aparecer nos filtros: tipo, formato, até 4 gêneros de lista fechada, classificação, sinopse, cor e sentido (quadrinho), e a declaração de autoria.
  - **Nada aparece sem revisão**: obra nova, capítulo novo ou editado e capa trocada (a antiga fica até aprovar). Admin publica direto. **Nada sai do ar sozinho:** denúncia vai para a fila; edição de capítulo publicado espera com a versão atual no ar.
  - **Imagem** (`servidor/imagem.mjs`): só JPEG, PNG e WebP estático, decididos pelos bytes; o arquivo é desmontado e remontado só com os blocos que desenham (some EXIF/GPS, comentários, texto e o que vier depois do fim — onde mora o arquivo poliglota). Nome sorteado, fora da pasta do site (`/dados/publicacoes`), servido por `/api/pub-arquivo/` conferindo permissão, com `nosniff` e CSP `sandbox`. Faxina de hora em hora.
  - Painel, aba Publicações: aprovar, recusar (motivo vai para o autor como aviso), suspender, reativar, capas pendentes e denúncias.
- **Ouvir em voz alta:** o botão "ouvir" do leitor (voz do próprio aparelho) só fala com plano — o bundle pergunta `window.fioVoz`, que `fio-leitor.js` preenche; sem plano, vai para os planos. Chip de velocidade (0,8× a 1,8×).
- **Revisão comunitária** (`servidor/correcoes.mjs`): nos livros traduzidos pelo Fio, selecionar um trecho mostra "sugerir correção". O painel aceita (troca o texto na hora, só se o trecho for único no capítulo, e credita quem sugeriu) ou recusa, e marca o livro como revisado (rótulo automático sai).
- **Pedidos de tradução** (`servidor/esteira.mjs`, central → Pedidos): busca no catálogo OPDS do Gutenberg e lê a ficha RDF de cada livro (menos de 1 s; o Gutendex levava mais de um minuto). Confere domínio público de **todos** os autores **e tradutores** (morto até 1955; até 18/09 só o primeiro autor era olhado) e põe na fila com quem pediu; aviso quando fica pronto.
- **Curadoria do acervo** (`servidor/curadoria.mjs`, painel → aba **Acervo**): editar título, autor, temas, chamada, "por que ler", o que observar e a capa (upload limpo como as publicações) de qualquer livro, ou escondê-lo; nos quadrinhos, título, resumo, tags, capa (uma página da série ou upload), destaque e esconder. O original nunca é tocado: as mudanças ficam em `curadoria_obra`/`curadoria_serie` e são aplicadas **na hora** sobre `catalogo.json`, `fichas/N.json` e `quadrinhos*.json`, com cache por data do arquivo e versão das mudanças. Cada campo mostra o original e volta a ele com um clique. Livro escondido some do catálogo, das coleções e dá 404 na ficha e no texto.
- **Estúdio de publicação** (`/publicar.html`, refeito em 18/09): começa por "Livro" ou "Quadrinho"; cada obra tem abas Capítulos / Dados / Capa e um checklist do que falta para enviar. Livro: editor com negrito, itálico, quebra de cena e travessão de diálogo, prévia, contagem, **rascunho salvo sozinho no aparelho** (volta se a aba fechar), Ctrl+S, e **importar manuscrito** (.docx, .epub, .txt, .md — lido no navegador por `fio-manuscrito.js`, vira capítulos para conferir). Quadrinho: arrastar várias páginas, barra de progresso, 3 envios em paralelo com nova tentativa, reordenar arrastando. Capítulos também se reordenam arrastando.
- **Minha conta** (`/conta.html`): perfil com os números da leitura, nome, e-mail (pede a senha), plano e uso com barras, senha com medidor, perguntas de recuperação, aparelhos (sair de um só ou de todos os outros), exportar dados, apagar dados de leitura, apagar conta.
- **Dados do navegador têm dono** (`/fio-dono.js`, 18/09): estante, progresso, marcações e quadrinhos guardados no navegador pertencem a UMA conta; outra conta entrando, ou sair, apaga antes da sincronia (antes a estante de uma conta ia para a próxima).
- **Entrar com o Google** (`servidor/google.mjs`): PKCE, nunca junta contas pelo e-mail, vincular pela página de conta, conta do Google define a primeira senha. Interruptor `FIO_GOOGLE=ligado` no `.env` da VPS (**ligado em 18/09**), com no console do Google os endereços `https://fiolib.duckdns.org/api/google/volta` e `https://fio.142-93-57-2.sslip.io/api/google/volta`.
- **A cara dos sites de leitura** (18/09, noite, pedido do dono): `/fio-visual.css` (app e páginas) + remendos: destaque da home com a capa desfocada ao fundo, faixa "Chegaram agora" (`/api/novidades`, traduções mais novas), selos nos cartões (tradução Fio, lei, nota, tempo de leitura), títulos de seção com barrinha vinho, noturno mais fundo. Descobrir com destaque "em alta", cartões com tipo colorido, nota, número do ranking e capítulos; padrão "de 2010 para cá, mais populares".
- **Capas desenhadas para todos** (18/09): as 3.243 obras sem capa ganharam a capa por tema de `ingestao/capas-desenhadas.mjs` (antes só 711 tinham); nenhuma obra do catálogo fica mais sem capa.
- **Quadrinhos, vitrine e créditos** (18/09): destaque do dia, "Novidades no Fio" (data em que o volume chegou), "Mais lidos" (contas com progresso), grade de capas com selos; cada volume abre com a página de créditos (obra, por que é livre, digitalização, tradução). Capas são públicas; páginas do volume 2+ pedem conta.
- **Controle de fluxo** (`servidor/seguranca.mjs` → `fluxoPassa`): por IP, 300 pedidos de API e 1.500 de arquivo por minuto; passou disso, 429 com `retry-after`. Os freios por ação continuam por cima (entrar, publicar, buscar, pedir tradução, corrigir…). O banco espera até 4 s por trava (`busy_timeout`) em vez de falhar.
- **As cinco ideias de 18/09** (tiradas de sites de leitura), uma por ramo:
  - **Estante — meta do ano** (desafio anual do Goodreads): anel de progresso, ritmo, projeção, livros por mês e capas dos terminados (`/api/meta`).
  - **Caderno — revisão do dia** (Daily Review do Kindle/Readwise): marcações antigas voltam em repetição espaçada; fica no navegador.
  - **Quadrinhos — progresso na conta** (Webtoon/Tapas): volume e página por série sincronizados; prateleira "Continuar lendo" (`/api/quadrinhos/progresso`).
  - **Comunidade — seguir obra** (o "inscrever-se" do Webtoon): aviso quando sai capítulo; filtro "só o que sigo".
  - **Para você — encontro às cegas com um livro** (as livrarias que embrulham o livro): três pacotes com pistas, o título só aparece ao desembrulhar.
- **Gosto, recomendações e avisos** (`servidor/gosto.mjs`, `/central.html`):
  - **Conta nova** responde humores, livros que ama, autores, tempo e o que evitar, e sai com recomendações na hora. **Conta antiga** não é interrompida.
  - A recomendação é uma **conta aberta com o motivo escrito** ("porque você leu Crime e Castigo"). Pesa o que a pessoa **lê** (tempo e idade da leitura) mais do que o que ela disse, e o questionário perde peso conforme ela lê.
  - Avisos nascem quando a pessoa aparece, sem duplicar (chave única): "já dá para ler" (livro da lista que ganhou texto), "continue" (leitura parada), recomendações da semana, boas-vindas.

## 7. Operação — os comandos

```bash
# servidor (roda os testes, guarda cópia em servidor.antes, pasta limpa, reconstrói)
bash infra/publicar-so-servidor.sh

# site: novo remendo → gerar e copiar os dois arquivos
node infra/remendar-bundle.mjs --base index-DBmeFHaL.js --index index.html --saida saida/
#   (base e index vêm de /opt/fio/site; copiar saida/ativos/*.js e saida/index.html de volta)

# páginas próprias (painel, central, quadrinhos, comunidade, publicar, planos, conta) e os scripts
# que o app carrega (fio-leitor.js, fio-app-extras.js): scp direto para /opt/fio/site/
#   (fio-comum.js e fio-paginas.css são dividas pelas três páginas novas)

# testes
node --test servidor/testes.mjs        # 105 testes

# seções de descoberta e catálogo (dentro do container)
node /app/ingestao/secoes.mjs --banco /dados/catalogo.db --gravar
node /app/ingestao/publicar.mjs --saida /tmp/dados   # depois copiar catalogo.json e fichas/

# esteira (VPS, sozinha) — acompanhar e mexer
docker logs -f infra-esteira-1
docker exec infra-esteira-1 node servidor/esteira-trabalhador.mjs --importar /dados/esteira/plano.json

# quadrinhos do Commons (Little Nemo): catálogo + downloads; o download roda no host
node ingestao/quadrinhos-commons.mjs --completo quadrinhos-completo.json --baixar commons-downloads.tsv
#   VPS: /opt/fio/entrada/baixar-commons.sh (baixa, publica quadrinhos.json e o resumo)

# tradução dos balões (PC): OCR + tradução → web/public/dados/quadrinhos-traducao/<serie>.json → scp para /opt/fio/site/dados/
node ingestao/quadrinhos-ocr.mjs --serie little-nemo --paginas dados/quadrinhos-ocr/little-nemo.tsv --motor google
```

`/app/ingestao` **some a cada deploy do servidor** (a imagem só leva `servidor/`).
Antes de rodar um script de ingestão no container, copie-o de novo.

## 8. Armadilhas que já custaram caro

- **Nunca `infra/publicar.sh`:** apaga a interface no ar (seção 3).
- **Nunca fundir catálogo local na produção:** o catálogo agora é trabalhado direto na VPS. Desde 16/09 `servidor/fundir.mjs` **recusa** catálogo mais velho ou menor (`FIO_FUNDIR_FORCAR=1` passa por cima).
- **Deploy recria o container:** leva `/tmp` e `/app/ingestao` junto. Tarefa longa grava progresso em `/dados`, ou roda no host.
- **`pkill -f nome` por SSH** mata a própria sessão, se o nome estiver no comando.
- **`fetch` sem timeout** trava a fila inteira sem erro (já aconteceu com o Planalto).
- **Consulta que varre `capitulo` inteiro** trava o processo (`node:sqlite` é síncrono). Use `minutos_leitura`.
- **Títulos do Internet Archive** vêm com acento decomposto: normalize para NFC antes de comparar.
- **Capa local vence a externa:** para mostrar a da Open Library, limpe `capa`.
- **`generos.mjs --gravar`** republica prateleiras antigas; rode `secoes.mjs --gravar` depois.

## 9. O que falta

- **Antes de cobrar assinatura:** termos de uso, CNPJ/nota, gateway com Pix, 7 dias de arrependimento, licença comercial do AniList acima de US$ 150/mês e a licença dos modelos de tradução (`docs/CAMINHOS-LEGAIS.md` §0 e §3).
- **As cinco ideias de 17/09** (`docs/IDEIAS-2026-09-17.md`): fundo dos criadores, Assistir por embed oficial, Descobrir anime, leitura em voz alta, revisão comunitária das traduções.

- **Reconstruir `web/src`** até alcançar o site no ar. É o que destrava:
  - as telas grandes do direcionamento: notas de world-building, barra de progressão, escala do mundo, linha do tempo navegável, página de rota e de tag;
  - o fim dos remendos.
- **Chave do Google Vision** para a tradução dos balões de Little Nemo (e depois Krazy Kat, Tokyo Puck): sem ela, o OCR do Windows não dá qualidade.
- **Mais "Antes de ler"** (28 livros hoje) e mais "Você gostou de…".
- **Quadrinho brasileiro em domínio público:** Angelo Agostini e *O Tico-Tico* estão na Hemeroteca da Biblioteca Nacional, sem API simples.
- **"Say Hello to Black Jack"** (licença livre de uso secundário, em japonês) exigiria traduzir os balões.

## 10. Índice de `docs/`

| Arquivo | Assunto |
|---|---|
| `PROJETO.md` | este |
| `CAMINHOS-LEGAIS.md` | como crescer acervo, vídeo e mangá sem pirataria; o que muda quando o site cobra (17/09) |
| `IDEIAS-2026-09-17.md` | cinco ideias estruturadas |
| `DESCOBERTA.md` | checklist do direcionamento da home (16/09) |
| `AUDITORIA-2026-09-16.md` | a auditoria desta rodada |
| `ARQUITETURA.md`, `VPS.md` | infraestrutura em detalhe |
| `CONTAS.md`, `AUDITORIA-LOGIN-2026-09-11.md` | contas e login |
| `ACERVO.md`, `CRESCER.md` | de onde vêm os livros, e como crescer legalmente |
| `AUDITORIA-2026-09-09.md`, `AUDITORIA-2026-09-14.md`, `AUDITORIA.md` | auditorias anteriores |
| `PLANO.md`, `ROADMAP.md`, `MELHORIAS.md` | planos antigos (históricos) |
