# Fio — o projeto inteiro, em 16/09/2026

Uma biblioteca em português que liga um livro ao próximo. No ar em
<https://fiolib.duckdns.org> (e `fio.142-93-57-2.sslip.io`), na mesma VPS do Wallt.

Este é o documento de entrada: o que existe, onde mora, como se opera, quais
armadilhas já custaram caro e o que falta. Os detalhes de cada assunto estão
nos outros arquivos de `docs/` (índice no fim).

---

## 1. Os números de hoje

| | |
|---|---|
| Obras no catálogo | **5.077** |
| Para ler inteiras aqui | **4.432** (113 milhões de palavras, 88 mil capítulos) |
| Traduzidas por nós (esteira) | **41**, e mais 117 na fila da esteira |
| Leis oficiais completas | **25** (Constituição, códigos, estatutos) |
| Obras com capa | **1.921** — 1.405 locais (711 desenhadas por tema, 25 de lei), 516 da Open Library |
| Seções de descoberta na home | **17** curadas + 4 mantidas + "A lei, na íntegra" |
| Quadrinhos e mangá para ler aqui | **34 séries, 157 volumes, 4.672 páginas** |
| Mangá, manhwa e manhua para descobrir | **milhares** (AniList, consultado na hora), com onde ler oficialmente |
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
          └── admin.html, central.html, quadrinhos.html, quadrinho.html, meus-livros.html  (+ .js)

 PC do dono
    └── esteira de tradução (node ingestao/esteira.mjs --subir) → MinT (Wikimedia, grátis)
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
`index-<hash>.js` + `index.html`. São 23 remendos hoje:

- login por usuário OU e-mail
- links **painel** (só admin), **para você** (com contador de avisos) e **quadrinhos** no cabeçalho
- nome no cabeçalho pula abreviação ("Sr. Livrario" → "livrario")
- home: prateleira **Para você**, convite ao questionário, chamada dos quadrinhos, sem prateleiras genéricas de tema
- botões de humor em "Não sabe o que ler?"
- ficha do livro: **Antes de ler** e **Este livro conversa com**
- depois de criar conta → questionário de gosto
- apagar conta sem e-mail (confirmação pelo nome de usuário)

Estilo novo vai **em linha**: o CSS no ar só tem as classes Tailwind que o build
antigo usou.

Telas grandes demais para remendo são **páginas próprias** (HTML + JS sem
dependência, texto sempre por nó de texto): painel, central, quadrinhos.

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
`ingestao/descoberta.mjs`: seções, ordem e as fichas "Antes de ler", ideias e
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

1. Livro entra pelo painel (aba Esteira), no formato `Título | Autor | id-gutenberg | língua`.
2. `node ingestao/puxar-fila.mjs` (no PC) transforma a fila em obra "a caminho" e acrescenta em `dados/traducoes/esteira.json`.
3. `node ingestao/esteira.mjs --subir` baixa o original, divide em capítulos, traduz parágrafo por parágrafo (8 em paralelo) e guarda um **caderno** para retomar de onde parou.
4. A cada 5 livros, `infra/subir-traducoes.sh` instala na VPS, reindexa a busca e republica o catálogo.
5. O livro aparece com o aviso "tradução automática, sem revisão humana" e o original ao lado.

**Limitação:** a esteira roda no **PC do dono**. PC dormindo mata a esteira;
rodar de novo retoma.

## 6. Contas, segurança e o que cada leitor tem

- **Login:** usuário OU e-mail + senha. Senha em scrypt (N=2¹⁵) com sal próprio. Sessão opaca em cookie `__Host-` HttpOnly, SameSite=Lax, Secure. Freio de tentativas por conta e por faixa de IP.
- **CSRF:** toda escrita exige o cabeçalho `x-fio` e origem da própria casa.
- **Recuperação:** 3 perguntas de um catálogo fechado, respostas em scrypt, disfarce contra enumeração. Não há recuperação por e-mail.
- **Papéis:** `leitor` e `admin`, conferidos no banco a cada pedido. Rota de admin responde 404 para quem não é admin.
- **Cadastro:** o e-mail é opcional. Se a tela manda só o e-mail, deriva-se um nome de usuário válido e livre.
- **LGPD:** exportar tudo (inclui gosto e avisos); apagar a conta digitando o nome de usuário ou o e-mail, com cascata.
- **Painel** (`/admin.html`, conta `curador`):
  - Panorama.
  - Esteira: fila e adicionar livros.
  - Configurações: cadastro aberto; portão de leitura e páginas de graça (padrão ≈ 5 livros).
- **Portão de leitura:** quem lê sem conta tem um teto de páginas (contado por faixa de IP). Estourou, o próximo livro vira um capítulo que convida a criar conta.
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

# páginas próprias (painel, central, quadrinhos): scp direto para /opt/fio/site/

# testes
node --test servidor/testes.mjs        # 84 testes

# seções de descoberta e catálogo (dentro do container)
node /app/ingestao/secoes.mjs --banco /dados/catalogo.db --gravar
node /app/ingestao/publicar.mjs --saida /tmp/dados   # depois copiar catalogo.json e fichas/

# esteira (PC)
node ingestao/puxar-fila.mjs
node ingestao/esteira.mjs --subir
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

- **Reconstruir `web/src`** até alcançar o site no ar. É o que destrava:
  - as telas grandes do direcionamento: notas de world-building, barra de progressão, escala do mundo, linha do tempo navegável, página de rota e de tag;
  - o fim dos remendos.
- **Progresso dos quadrinhos na conta** (hoje só no navegador).
- **Mais "Antes de ler"** (28 livros hoje) e mais "Você gostou de…".
- **Esteira independente do PC:** mover para a VPS ou para uma máquina que não dorme.
- **Quadrinho brasileiro em domínio público:** Angelo Agostini e *O Tico-Tico* estão na Hemeroteca da Biblioteca Nacional, sem API simples.
- **"Say Hello to Black Jack"** (licença livre de uso secundário, em japonês) exigiria traduzir os balões.

## 10. Índice de `docs/`

| Arquivo | Assunto |
|---|---|
| `PROJETO.md` | este |
| `DESCOBERTA.md` | checklist do direcionamento da home (16/09) |
| `AUDITORIA-2026-09-16.md` | a auditoria desta rodada |
| `ARQUITETURA.md`, `VPS.md` | infraestrutura em detalhe |
| `CONTAS.md`, `AUDITORIA-LOGIN-2026-09-11.md` | contas e login |
| `ACERVO.md`, `CRESCER.md` | de onde vêm os livros, e como crescer legalmente |
| `AUDITORIA-2026-09-09.md`, `AUDITORIA-2026-09-14.md`, `AUDITORIA.md` | auditorias anteriores |
| `PLANO.md`, `ROADMAP.md`, `MELHORIAS.md` | planos antigos (históricos) |
