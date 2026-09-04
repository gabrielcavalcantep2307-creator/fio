# Fio

Uma biblioteca que não guarda livros: **liga um livro ao próximo.**

O nome é provisório — vem da ideia de puxar um fio: você entra por *A Revolução
dos Bichos* e sai em Hannah Arendt sem ter planejado.

> **Estado:** arquitetura decidida, domínio modelado, ingestão funcionando.
> 659 obras no catálogo. Ainda não há tela.

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
node ingestao/gutenberg.mjs    # monta o catálogo (baixa 21 MB na 1ª vez)
node ingestao/conferir.mjs     # a prova executável do que o ACERVO.md afirma
```

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
