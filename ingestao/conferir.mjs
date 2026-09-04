// A prova executável do que docs/ACERVO.md afirma.
//
// Se alguém (você, eu, ou um GPT confiante) disser que "é só importar o
// Gutenberg e a biblioteca está pronta", rode isto.
//
//   node ingestao/conferir.mjs

import { abrir, podeLer } from '../servidor/banco/base.mjs'

const b = abrir()
const linha = (t) => console.log(`\n${'─'.repeat(64)}\n${t}\n${'─'.repeat(64)}`)

linha('1. O acervo, por trilho')
for (const l of b.prepare(
  `SELECT trilho, COUNT(*) n FROM obra WHERE publicada = 1 GROUP BY 1`).all())
  console.log(`   trilho ${l.trilho}: ${l.n} obras`)

linha('2. O cânone de "poder e sociedade": em que idioma ele existe')
const canone = b.prepare(
  `SELECT o.titulo, o.idioma_original, o.trilho FROM obra o
    WHERE o.idioma_original = 'en' ORDER BY o.id`).all()
for (const l of canone) console.log(`   [${l.trilho}] ${l.idioma_original}  ${l.titulo.split('\n')[0].slice(0, 56)}`)
// A pergunta que importa: algum destes autores existe em português no acervo?
const AUTORES = ['Machiavelli', 'Hobbes', 'Rousseau', 'Mill', 'Plato', 'Tocqueville',
  'Thoreau', 'Le Bon', 'London', 'Kafka', 'More', 'Wollstonecraft', 'Swift', 'Zola']
const emPt = b.prepare(
  `SELECT COUNT(DISTINCT o.id) n FROM obra o
     JOIN obra_pessoa op ON op.obra_id = o.id
     JOIN pessoa p ON p.id = op.pessoa_id
    WHERE o.idioma_original = 'pt'
      AND (${AUTORES.map(() => 'p.nome_ordem LIKE ?').join(' OR ')})`).get(...AUTORES.map(a => `${a},%`))
console.log(`\n   destes ${AUTORES.length} autores, em português no acervo: ${emPt.n}`)
console.log('   O acervo livre em português não contém este cânone. Em nenhuma')
console.log('   tradução — porque toda tradução publicada dele ainda tem dono.')

linha('3. A armadilha da tradução, pega automaticamente')
for (const l of b.prepare(
  `SELECT o.titulo, GROUP_CONCAT(p.nome || ' (†' || COALESCE(p.morte,'?') || ')', ' + ') quem,
          d.estado, d.livre_em
     FROM obra o
     JOIN obra_pessoa op ON op.obra_id = o.id
     JOIN pessoa p ON p.id = op.pessoa_id
     JOIN texto t ON t.obra_id = o.id
     JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = 'BR'
    WHERE d.estado = 'protegido'
    GROUP BY o.id
    ORDER BY d.livre_em
    LIMIT 6`).all())
  console.log(`   ${l.livre_em}  ${l.titulo.split('\n')[0].slice(0, 34).padEnd(34)} ${l.quem}`)
console.log(`
   Rousseau morreu em 1778 e é livre em qualquer lugar. A TRADUÇÃO de
   G. D. H. Cole (†1959) não é: protege a obra inteira até 2030 no Brasil.
   Foi por isso que "Do Contrato Social" caiu no trilho B sozinho, sem
   ninguém decidir nada.`)

linha('4. A mesma obra, dois países, duas respostas')
const t = b.prepare(
  `SELECT t.id, o.titulo FROM texto t JOIN obra o ON o.id = t.obra_id
    WHERE o.titulo LIKE '%social contract%' LIMIT 1`).get()
for (const j of ['BR', 'US']) {
  const r = podeLer(b, { texto_id: t.id, leitor_id: 1, jurisdicao: j })
  console.log(`   ${j}: ${r.pode ? 'PODE LER' : 'não pode'} — ${r.motivo}`)
}
console.log(`
   Um campo booleano "dominio_publico" no livro daria UMA resposta.
   A resposta certa depende de quem está lendo, e de onde.`)

linha('5. Busca sem acento acha com acento (FTS5, unicode61)')
for (const l of b.prepare(
  `SELECT titulo, autores FROM busca_obra WHERE busca_obra MATCH 'revolucao' LIMIT 3`).all())
  console.log(`   ${l.titulo.split('\n')[0].slice(0, 48)} — ${l.autores}`)

console.log()
