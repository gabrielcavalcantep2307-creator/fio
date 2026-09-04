# Arquitetura

Leia o [`ACERVO.md`](ACERVO.md) antes deste. Ele decide o que o sistema é; este
aqui decide como ele é feito.

---

## As cinco decisões que explicam o resto

### 1. O catálogo é o produto; o arquivo é um privilégio de alguns livros

Vem do `ACERVO.md`. Consequência prática: **nenhuma tela pode assumir que a
obra tem texto.** A página da obra é completa sem arquivo nenhum. O botão muda,
a página não.

### 2. O EPUB é desmontado na entrada, não no navegador

O caminho fácil seria mandar o EPUB para o navegador e usar uma biblioteca de
leitura. Não vamos.

Na ingestão, o EPUB é aberto, limpo e gravado como **capítulos de HTML
sanitizado no banco**. O navegador pede um capítulo e recebe alguns kilobytes
de HTML pronto.

O que isso compra, e é muito:

| | EPUB no navegador | Capítulos no banco |
|---|---|---|
| Abrir o livro | baixar e descompactar o arquivo inteiro | uma consulta |
| Posição do leitor | CFI frágil, muda com a fonte | capítulo + deslocamento, estável |
| Anti-spoiler | não tem como saber onde você está | `capitulo.ordem` é o eixo |
| Buscar dentro do livro | impossível no servidor | FTS5 |
| Offline | guardar o arquivo | guardar os capítulos, e é o mesmo formato |
| Marcação | âncora dentro de um blob | deslocamento num capítulo |
| Peso no navegador | biblioteca de EPUB inteira | nada |

O spoiler engine, a busca, o progresso e o modo offline **todos dependem dessa
mesma decisão**. É a peça central do leitor.

PDF escaneado é a exceção: não dá para transformar em texto sem OCR. Esses
livros entram marcados como `formato='pdf'`, são lidos em imagem, e **não
recebem a camada de contexto inline** — o sistema é honesto sobre isso na tela
em vez de fingir.

### 3. O contexto é conteúdo editorial gerado uma vez, não uma chamada de IA por leitor

Esta é a decisão que decide se o produto é sustentável.

O jeito ingênuo: o leitor seleciona "totalitarismo", o site chama um modelo, o
modelo responde. Isso custa dinheiro a cada seleção, demora segundos, e cada
leitor recebe uma resposta diferente e não revisada para a mesma palavra.

O jeito certo: **contexto é conteúdo do catálogo**. É gerado uma vez por obra,
gravado na tabela `fragmento`, revisado no painel, e servido depois como
qualquer outro dado — instantâneo, igual para todo mundo, auditável, e de graça
na segunda vez em diante.

A conta, para 1.000 obras com página editorial completa (por que existe, como
ler, temas, personagens, conceitos, pós-leitura — umas 6 chamadas por obra):

| Modelo | Por obra | 1.000 obras | Com a API de lote (50% off) |
|---|---|---|---|
| `claude-opus-5` ($5 / $25 por MTok) | ~US$ 0,38 | ~US$ 380 | ~US$ 190 |
| `claude-sonnet-5` ($2 / $10 por MTok) | ~US$ 0,15 | ~US$ 150 | ~US$ 75 |

Custo **único**, e o catálogo fica pronto. Contra isso, gerar ao vivo para
10.000 leitores × 20 seleções seria a mesma conta toda semana.

**O modelo só entra ao vivo em um lugar:** o Guia de Leitura, quando o leitor
faz uma pergunta que ninguém previu. E mesmo ali, com o texto do capítulo e os
fragmentos já gravados no prompt — com cache — a conta fica na casa de centavos
por pergunta.

Regra que fica no banco, não no combinado: `fragmento.gerado_por='ia'` só
aparece no site com `revisado=1`. Texto de IA não revisado nunca chega ao
leitor.

### 4. Busca em linguagem natural vira filtro, não vetor (por enquanto)

"Quero um livro curto sobre manipulação política" não precisa de embeddings.
Precisa virar:

```json
{ "temas": ["propaganda", "poder"], "paginas_max": 250, "nivel": ["iniciante","intermediario"] }
```

Um modelo faz essa tradução, o banco responde com SQL, e a tela **mostra o
filtro que entendeu** — o leitor corrige se erramos. Isso é mais barato, mais
rápido e muito mais explicável que similaridade vetorial, e explicabilidade é
requisito seu (seção 42 da proposta).

Vetor entra depois, para "obras parecidas com esta", quando o catálogo for
grande o bastante para a semelhança ser interessante. O esquema já reserva o
lugar; a fase 1 não precisa.

### 5. SQLite, e o motivo é operacional

Postgres seria a resposta de manual. SQLite é a resposta certa aqui:

- Você já opera SQLite numa VPS com Docker e Caddy, e já tem backup por cópia
  de arquivo. Isso é músculo pronto — e a maior causa de projeto morto é
  operação que ninguém aguenta.
- FTS5 dá busca textual com remoção de acento, que é exatamente o que o
  português precisa.
- A carga é leitura pesada e escrita leve: catálogo lido por todos, progresso
  escrito por um de cada vez. É o formato em que SQLite ganha.
- O banco inteiro cabe num arquivo, e um `cp` é um backup íntegro.

**A saída, escrita antes de precisar dela:** todo acesso ao banco passa por
`servidor/banco/`. No dia em que houver escrita concorrente de verdade — muitos
leitores marcando texto ao mesmo tempo — troca-se essa camada por Postgres sem
tocar em rota nem em tela. O gatilho é esse, e não "ficou grande".

---

## As camadas

```
  web/                     o que se vê e se clica (React + Vite + Tailwind)
        │
        ▼
  fetch / cache local      o que a tela sabe; offline mora aqui
        │
        ▼
  servidor/http            rotas, sessão, permissão, limite de taxa
        │
        ▼
  servidor/banco           TODO acesso a dado passa por aqui
        │
        ▼
  catalogo.db              SQLite + FTS5
        ▲
        │
  ingestao/                roda fora do site, por lote, e só escreve
```

A regra que segura tudo, herdada do Wallt: **nenhuma camada acredita na de
cima.** A tela esconde o botão "Ler" de um livro do trilho B; o servidor recusa
a entrega do capítulo de novo, sozinho, olhando `direito` e a jurisdição do
leitor. As duas checagens existem, e a de baixo é a que vale.

### Por que a ingestão fica fora do site

Baixar 21 MB de catálogo, descompactar EPUB, chamar modelo de IA e reindexar
não pode compartilhar processo com quem está lendo. `ingestao/` são scripts
que rodam por fora, escrevem no mesmo banco e podem demorar o que quiserem.

---

## A pilha, e por que cada peça

| Camada | Escolha | Por quê |
|---|---|---|
| Interface | React 19 + Vite + TypeScript + Tailwind 4 | é o que você já usa e opera; e a tela é a prioridade nº 1 |
| Servidor | Node 22+, HTTP nativo ou Fastify | mesmo runtime dos scripts de ingestão; um vocabulário só |
| Banco | SQLite (WAL) + FTS5 | acima |
| Busca | FTS5 com `remove_diacritics 2` | "revolucao" acha "Revolução" |
| Leitor | próprio, sobre HTML de capítulo | decisão 2 |
| IA editorial | `claude-opus-5` em lote, na ingestão | decisão 3 |
| IA ao vivo | `claude-sonnet-5` com cache de prompt | só o Guia de Leitura |
| Arquivos | disco da VPS, servido pelo Caddy | não há volume que justifique S3 |
| Publicação | Docker Compose + Caddy | igual ao Wallt: o que você já sabe consertar às 2 da manhã |

---

## Desempenho, em regras e não em intenção

Prioridade nº 2 da sua lista. As regras que valem revisão de código:

1. **O capítulo é a unidade de rede.** Nunca mandar o livro inteiro.
2. **A home é uma consulta.** Uma view materializada por leitor, recalculada
   quando o progresso muda — não seis consultas por seção.
3. **Capa é imagem otimizada, com `width`/`height` no HTML.** Sem isso a página
   pula enquanto carrega, e parece lenta mesmo sendo rápida.
4. **O próximo capítulo é pré-carregado; o resto não.**
5. **Progresso é gravado com atraso** (uns 5 s), não a cada rolagem.
6. **Nada de biblioteca de EPUB, de PDF ou de gráfico no pacote inicial.** O
   leitor de PDF carrega sob demanda, só para quem abrir um PDF.
7. **Toda listagem é paginada por cursor**, nunca `OFFSET`.

---

## Segurança e LGPD, no que muda o desenho

- Sessão por cookie `HttpOnly`, `SameSite=Lax`, assinada no servidor.
- Todo HTML de livro é **sanitizado na ingestão**, não na hora de mostrar.
  Um EPUB é um zip com HTML de origem desconhecida: tratar como entrada hostil.
- Consultas parametrizadas, sempre. Nenhuma string de SQL montada com dado de
  fora.
- Limite de taxa nas rotas de busca e de IA.
- **O trilho C é isolado no banco:** `texto.dono_id` não nulo significa que a
  consulta obriga `dono_id = leitor atual`. Não é regra de tela.
- LGPD: `progresso`, `marcacao`, `nota` e `perfil_leitor` são dados pessoais.
  Precisa existir, desde cedo, **exportar tudo** e **apagar tudo** — e apagar
  significa apagar, não marcar como apagado.
- O perfil de leitor guarda `evidencias`: por que o sistema acha o que acha.
  Serve para explicar ao leitor e para você conseguir depurar recomendação
  ruim.

---

## Publicação

Mesmo formato do Wallt, porque funciona e você já conhece:

```
  Caddy         TLS e arquivos estáticos
  fio-servidor  Node, a API
  volume        catalogo.db + capas + arquivos
```

`docker-compose.yml`, `.env.exemplo`, `instalar.sh`, `publicar.sh`,
`backup.sh` (cópia do `.db` com `VACUUM INTO`, que é consistente com WAL) e
`/saude` para verificação. Migração de banco por arquivos numerados em
`servidor/migracoes/`, aplicados na subida.

---

## O que este documento decide, em uma lista

1. Página da obra funciona sem arquivo.
2. EPUB vira capítulos no banco, na ingestão.
3. Contexto é conteúdo gerado uma vez e revisado, não chamada por leitor.
4. Busca em linguagem natural vira filtro explicável; vetor fica para depois.
5. SQLite, com a troca por Postgres já isolada atrás de `servidor/banco/`.
6. Ingestão roda fora do site.
7. Permissão de leitura é checada no servidor, olhando direito e jurisdição.
