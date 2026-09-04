# Fases

A ordem não é a da proposta original. É a ordem em que cada peça **destrava a
seguinte** — e a primeira coisa a destravar é provar que uma obra fica boa sem
o arquivo dela.

---

## Feito

- [x] Investigação do acervo, com números medidos ([`ACERVO.md`](ACERVO.md))
- [x] As decisões de arquitetura ([`ARQUITETURA.md`](ARQUITETURA.md))
- [x] Modelagem do domínio ([`../servidor/esquema.sql`](../servidor/esquema.sql))
- [x] Cálculo de direito por jurisdição, com a armadilha da tradução
- [x] Ingestão do Gutenberg — 659 obras, 528 legíveis no Brasil
- [x] Busca textual em português (FTS5, acha "revolucao" em "Revolução")

---

## Fase 1 — Uma obra completa, de ponta a ponta

**O objetivo não é ter muitos livros. É ter UM livro perfeito**, para provar
que a proposta se sustenta antes de escalar.

A obra escolhida é *A Revolução dos Bichos*, e ela é o caso mais difícil de
propósito: livre no Brasil, protegida nos EUA, sem nenhuma tradução livre.
Se o produto funciona nela, funciona em qualquer uma.

- [ ] **Normalizador de EPUB** → capítulos de HTML sanitizado no banco
      (é a decisão 2 da arquitetura; destrava leitor, progresso, busca interna,
      offline e spoiler de uma vez)
- [ ] **O leitor**: capítulo por vez, tipografia séria, modo foco, posição
      guardada. Sem biblioteca de EPUB no navegador.
- [ ] **A página da obra**, que funciona sem arquivo: por que existe, o que
      observar, temas, nível, onde encontrar.
- [ ] **Ficha de *A Revolução dos Bichos*** escrita à mão — o padrão de
      qualidade que a IA vai ter que imitar depois.
- [ ] **A home**: continue lendo, a obra em destaque, a próxima leitura
      explicada.
- [ ] Entrada, sessão, estante.

Fim da fase: dá para entrar, entender por que ler, ler, e voltar de onde parou.

## Fase 2 — O contexto, gerado e revisado

- [ ] **Gerador de fragmentos** em lote (`ingestao/contexto.mjs`), com fonte
      registrada e `natureza` (fato / interpretação / hipótese)
- [ ] **Painel de revisão** — fragmento de IA não revisado não chega ao leitor
- [ ] **Anti-spoiler ligado**: a consulta já existe em `banco/base.mjs`; falta
      a tela respeitá-la
- [ ] Conceitos e personagens clicáveis dentro do texto
- [ ] Marcações, notas e o Caderno
- [ ] Pós-leitura

## Fase 3 — O fio

- [ ] Relações entre obras, com a frase do porquê
- [ ] Trilhas ("Poder e sociedade" já existe em código, falta em conteúdo)
- [ ] Perfil de leitor, com as evidências guardadas
- [ ] Recomendação por eixo, cada uma explicando-se
- [ ] Busca em linguagem natural → filtro visível e corrigível
- [ ] Guia de Leitura (a IA ao vivo, e só aqui)

## Fase 4 — Acervo e escala

- [ ] Open Library e Wikidata: o catálogo do trilho B, dezenas de milhares
- [ ] "Onde encontrar" com as fontes autorizadas
- [ ] Trilho C: envio de arquivo do próprio leitor, isolado no banco
- [ ] Leitura offline
- [ ] Mapa de personagens, mapa de conceitos, linha do tempo
- [ ] Publicação na VPS (Docker + Caddy), backup, saúde

---

## O que fica fora, e por quê

- **Embeddings e busca vetorial.** Antes de ter catálogo grande, similaridade
  vetorial só encontra o que a busca textual já encontra — e não sabe explicar
  por quê. Entra na fase 4.
- **Tradução própria de obras livres no Brasil.** É legal e resolveria o
  problema do português de vez. É trabalho editorial de verdade, não de
  programação, e não cabe antes de o resto existir.
- **Recomendação colaborativa.** Precisa de muitos leitores. Com poucos, é
  pior que a regra simples.
