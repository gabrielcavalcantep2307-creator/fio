// Escolher entre fichas repetidas da mesma obra.
//
// ─────────────────────────────────────────────────────────────
// AVISO: este arquivo é uma RECONSTRUÇÃO, de 09/09/2026.
//
// O original existiu, rodou e produziu o catálogo que está em produção — e
// depois se perdeu: o deploy levava só `servidor/` e `site/` para a VPS, e a
// pasta `ingestao/` nunca foi commitada nem subiu para lugar nenhum. O que
// sobrou dele foram os dois testes em `servidor/testes.mjs`, e é deles que
// esta versão foi refeita.
//
// Então: o comportamento testado é o de antes. O que os testes não cobrem
// pode ter sido diferente. Antes de rodar isto sobre o catálogo de verdade,
// confira o resultado numa amostra.
// ─────────────────────────────────────────────────────────────
//
// O problema é o de sempre num catálogo montado de várias fontes: a mesma
// obra chega como três fichas — "Dune", "Duna", "Duna (Coleção Duetos)" — e
// alguma delas tem que virar A ficha, com as outras penduradas como sobras.
//
// A ordem dos critérios não é arbitrária, e é o miolo desta escolha:
//
//   1. TEM TEXTO. Um exemplar que a pessoa consegue abrir vale mais que um
//      exemplar bonito que ela não consegue. É o critério que ganha de
//      todos, e por isso "孫子兵法" com dois textos ganha de "A Arte da
//      Guerra" com capa e nenhum.
//   2. O TÍTULO É O QUE SE PROCUROU. Sem isto o id menor ganharia, e o id
//      menor é só quem chegou primeiro na ingestão — a estante mostraria
//      "Dune" para quem tem uma biblioteca em português.
//   3. TEM CAPA. Prateleira sem capa é lista.
//   4. O id menor, que desempata sem sorteio: rodar duas vezes tem que dar
//      o mesmo resultado.

/** Como dois títulos são comparados: sem acento, sem caixa, sem pontuação. */
const achatar = (s) => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

/**
 * Os pesos são degraus, não somas que se equilibram: nenhuma combinação de
 * critérios menores alcança um critério maior. É de propósito — "tem capa e
 * o título casa" NÃO pode ganhar de "dá para ler".
 */
function nota(c, alvo) {
  const procurado = achatar(alvo)
  const casaTitulo = achatar(c.titulo) === procurado || achatar(c.titulo_pt) === procurado
  return (Number(c.textos) > 0 ? 1000 : 0)
       + (casaTitulo ? 100 : 0)
       + (c.capa ? 10 : 0)
}

/**
 * @param candidatos fichas da mesma obra, cada uma com
 *                   `{ id, titulo, titulo_pt, capa, textos }`
 * @param alvo       o título que se estava procurando
 * @returns `{ obra, sobras }` — a que fica, e as que se penduram nela
 */
export function escolher(candidatos, alvo) {
  const ordenadas = [...candidatos].sort((a, b) => {
    const d = nota(b, alvo) - nota(a, alvo)
    return d !== 0 ? d : a.id - b.id
  })
  return { obra: ordenadas[0], sobras: ordenadas.slice(1) }
}
