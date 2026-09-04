# Fio

Uma biblioteca que não guarda livros: **liga um livro ao próximo.**

O nome é provisório — vem da ideia de puxar um fio: você entra por *A Revolução
dos Bichos* e sai em Hannah Arendt sem ter planejado.

> **No ar em <https://fiolib.duckdns.org>**, na mesma VPS do Wallt.
> **1.488 obras** com capa e categoria, **526 para ler inteiras** num leitor
> próprio — inclusive a Constituição e nove códigos, livres por lei. Dá para
> **baixar em EPUB**. Contas funcionando: criar (com convite), entrar,
> recuperar senha, e o que você marca aparece no outro aparelho.

**O acervo é só em português.** Traduzido ou original, mas em português — livro
em inglês não aparece nem no catálogo. É uma decisão do dono do acervo, e ela
vale antes de qualquer outra.

---

## A decisão que explica o resto

A pergunta que decide o produto é "de onde vêm os livros?", e a resposta,
medida e não chutada, é desconfortável:

**O acervo livre e legal em português tem 645 obras, quase todas literatura
portuguesa do século XIX.** E o cânone que este projeto quer — Maquiavel,
Hobbes, Rousseau, Mill, Tocqueville, Orwell — existe **inteiro em inglês e zero
em português**, porque tradução é obra nova e toda tradução publicada desses
livros ainda tem dono.

Se o produto fosse "um lugar onde se lê", ele estaria morto na origem.

Mas o diferencial não é o arquivo. É **fazer entender o livro e saber o que ler
depois** — e isso não exige hospedar nada. Então:

```
   o CATÁLOGO      metadado + contexto + trilhas + conexões
                   cresce sem teto jurídico       ← é o produto
        │
        ▼
   o TEXTO         o arquivo que se lê aqui dentro
                   cresce devagar, sob regra estrita
```

Todo livro entra por um de três trilhos:

| | | O botão |
|---|---|---|
| **A** | podemos hospedar e servir | **Ler** |
| **B** | não podemos; temos todo o resto | **Onde encontrar** |
| **C** | é o arquivo do próprio leitor, e continua dele | **Ler** (só para ele) |

A investigação completa, com os números e as fontes, está em
[`docs/ACERVO.md`](docs/ACERVO.md). Leia esse primeiro.

---

## Os documentos

- [`docs/ACERVO.md`](docs/ACERVO.md) — de onde vêm os livros. **Comece aqui.**
- [`docs/CRESCER.md`](docs/CRESCER.md) — como o acervo cresce daqui, e a
  brecha grande: traduzir o que já é livre.
- [`docs/CONTAS.md`](docs/CONTAS.md) — login, senha e sessão, com o motivo de
  cada decisão. É a parte em que um erro não aparece usando.
- [`docs/VPS.md`](docs/VPS.md) — a máquina, e como publicar sem derrubar o Wallt.
- [`docs/AUDITORIA.md`](docs/AUDITORIA.md) — a auditoria de segurança: seis
  problemas achados, seis corrigidos, e o que continua aberto.
- [`docs/MELHORIAS.md`](docs/MELHORIAS.md) — dez melhorias, em ordem de quanto
  mudam o produto.
- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — as cinco decisões técnicas e
  por quê.
- [`servidor/esquema.sql`](servidor/esquema.sql) — o domínio. Está comentado
  como documento, não como código.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — as fases.

---

## Rodando

Precisa só de Node 22+. **Nenhuma dependência** — o SQLite vem no Node
(`node:sqlite`), com FTS5 e remoção de acento.

```bash
npm run acervo      # o catálogo do Gutenberg (baixa 21 MB na 1ª vez)
npm run leis        # a legislação brasileira, livre pelo art. 8º da 9.610/98
npm run temas       # classifica em 31 prateleiras
npm run capas       # baixa as capas, e descarta as que o Gutenberg inventa
npm run autores     # os autores que faltavam, pela Open Library
npm run curadoria   # a camada editorial escrita à mão
npm run textos      # o texto integral, partido em capítulos
npm run publicar    # exporta o site estático

npm test            # os 21 testes do login
npm run contas      # o servidor (site + API), na porta 8787

npm --prefix web install && npm --prefix web run dev
```

O site é **estático**: o que vai ao ar é JSON gerado pela ingestão mais um
pacote de 68 KB de JavaScript. Não há servidor, não há conta, e o que você
marca fica no seu navegador. Quando houver VPS, só a camada de dados muda.

O `conferir.mjs` existe por um motivo: se alguém disser "é só importar o
Gutenberg e a biblioteca está pronta", esse script mostra, com o banco na mão,
por que não é.

### O que ele imprime hoje

```
trilho A (dá para ler)   528
trilho B (referência)    131

destes 14 autores do cânone, em português no acervo: 0

2030  The social contract & discourses   Rousseau (†1778) + G.D.H. Cole (†1959)
```

Rousseau morreu em 1778 e é livre no mundo inteiro. A **tradução** de Cole não
é: prende a obra até 2030 no Brasil. Ninguém decidiu isso — o cálculo pegou
sozinho, e foi para o trilho B.

---

## A regra que não se dobra

Nada de sites piratas, torrents ou raspagem de acervo protegido. E,
principalmente: **"está na internet" não significa "pode hospedar"**. Livro sem
estado de direito conhecido nunca vira botão "Ler" — o padrão do sistema é o
cauteloso, e isso está no banco, não no combinado.
