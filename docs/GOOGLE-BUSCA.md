# Aparecer no Google

19/09/2026. O dono procurou "fio lib" e não achou o site; achou o GitHub.

## O que aparecia, e por quê

- **Os resultados do GitHub não são nossos.** `axboe/fio` é o "fio — Flexible
  I/O tester", uma ferramenta famosa de Linux para medir disco, do Jens Axboe;
  `redhat-cip/fio` é uma cópia dela da Red Hat. "fio" + "lib" casa com os
  arquivos `libaio.c` deles. Os repositórios da Fiolib estão privados e não
  aparecem em busca nenhuma.
- **O site não aparecia porque o Google quase não tinha o que ler:** sem
  `robots.txt`, sem `sitemap.xml`, o título era "Fio — biblioteca", e cada
  livro mora num endereço com `#` (`/#/obra/612`), que o Google trata como a
  mesma página. Para ele, a Fiolib era UMA página, nova, sem ninguém apontando
  para ela.

## O que foi feito (servidor/http/vitrine.mjs, infra/cabeca-google.mjs)

- Uma página de verdade por livro — `/livro/612-o-cortico` — com título,
  autor, "por que ler", o começo do livro e o botão "Ler agora", e os dados
  estruturados de livro (schema.org `Book`) que o Google usa nos resultados.
- Uma página por autor (`/autor/369-aluisio-azevedo`) e as listas `/livros` e
  `/autores`, para o robô achar tudo andando de link em link.
- `/sitemap.xml` com todos os livros que se leem aqui (~4.500) e os autores;
  `/robots.txt` apontando para ele e fechando `/api/` e as telas de conta.
- A página inicial com título "Fiolib — biblioteca online grátis de livros em
  português", descrição, e os dados de site e organização.
- Só entra no Google livro que se LÊ aqui; os outros respondem `noindex`.

## O que só o dono pode fazer (precisa da conta Google dele)

1. Abrir **https://search.google.com/search-console** e "Adicionar
   propriedade" → **Domínio** → `fiolib.com.br`.
2. O Google mostra um registro **TXT** (`google-site-verification=...`). No
   **Registro.br** → o domínio → DNS → adicionar registro TXT com esse valor
   (nome em branco / `@`). Voltar ao Search Console e clicar em "Verificar"
   (pode levar de minutos a algumas horas).
3. No menu **Sitemaps**, enviar: `https://fiolib.com.br/sitemap.xml`.
4. Em **Inspeção de URL**, colar `https://fiolib.com.br/` e clicar em
   "Solicitar indexação". Repetir com 3 ou 4 livros conhecidos (ex.:
   `https://fiolib.com.br/livro/612-o-cortico`).
5. Opcional, 2 minutos: **Bing Webmaster Tools** (bing.com/webmasters) →
   "Importar do Google Search Console". O Bing também alimenta o DuckDuckGo e
   o ChatGPT.

## Quanto tempo leva

- Procurar **"fiolib"** (uma palavra) deve achar o site em poucos dias a duas
  semanas depois do passo 3.
- **"O Cortiço ler online"**, **"livros grátis em português"**: aí se disputa
  com sites de anos (Domínio Público, Wikisource, Projeto Gutenberg). Leva
  meses, e o que mais pesa é **outros sites apontando para a Fiolib**: postar
  o link em grupos, Reddit (r/livros, r/brasil), escolas, bibliotecas, perfis
  de leitura. Cada link de fora conta.
- O nome ajuda escrito junto: **Fiolib**. "Fio lib" separado disputa com a
  ferramenta de Linux.

## A verificação da marca no Google Cloud (19/09/2026)

O Google recusou a verificação da marca do app OAuth com três queixas. As duas
primeiras foram resolvidas no site; a terceira e a quarta são cliques no
console, e só o dono pode dar.

| A queixa do Google | O que era | Situação |
|---|---|---|
| "O site do URL da sua página inicial não está registrado para você" | o domínio não estava verificado no Search Console **com a mesma conta Google** que é dona do projeto no Cloud | falta: verificar o domínio (passos acima) com a conta certa |
| "A página inicial não explica a finalidade do app" | a home é um app React; sem JavaScript, não havia texto nenhum | **feito**: a apresentação agora está no HTML, dentro de `#raiz` (infra/cabeca-google.mjs), com o que o site faz, o que pedimos do Google e o link da privacidade |
| "O nome do app 'FioLib' não corresponde ao nome na sua página inicial" | a home dizia "Fio — biblioteca" | **feito**: título, logotipo e rodapé dizem **Fiolib**; falta trocar o nome do app no console para exatamente `Fiolib` |

Ordem certa no console (Google Auth Platform → Branding):

1. Nome do app: `Fiolib` (sem maiúscula no meio).
2. Página inicial: `https://fiolib.com.br`.
3. Política de privacidade: `https://fiolib.com.br/privacidade.html`.
4. Termos de serviço: `https://fiolib.com.br/termos.html`.
5. Domínio autorizado: `fiolib.com.br`.
6. Verificar o domínio no Search Console com a MESMA conta, e só então pedir a
   verificação de novo ("Corrigi os problemas").

O logotipo é opcional: sem ele, a tela de permissão mostra só o nome e o
domínio, e a verificação de marca deixa de ser necessária para funcionar — o
login com Google continua aberto a todo mundo desde que o app esteja
**publicado (Em produção)** e os escopos sejam os não sensíveis
(`openid email profile`), que é o caso.
