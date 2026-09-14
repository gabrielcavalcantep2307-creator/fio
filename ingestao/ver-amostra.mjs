// Mostra o começo do texto de uma ficha, para decidir com o olho.
//
//   node ingestao/ver-amostra.mjs --banco /dados/catalogo.db --textos 880,2386,3732
//
// Nenhum detector de língua merece confiança cega num banco de produção. Este
// arquivo é o passo entre "o contador disse" e "mudei 4575 linhas": imprime o
// que o contador leu, para uma pessoa conferir se ele leu direito.

import { DatabaseSync } from 'node:sqlite'
import { lingua, semTags } from './conferir-idioma.mjs'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const db = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: true })
const ids = String(arg('textos', '')).split(',').map(Number).filter(Boolean)

const ficha = db.prepare(`
  SELECT t.id, t.obra_id, t.idioma, t.fonte_url, o.titulo
    FROM texto t JOIN obra o ON o.id = t.obra_id WHERE t.id = ?`)
const caps = db.prepare(
  'SELECT ordem, titulo, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem LIMIT 3')

for (const id of ids) {
  const t = ficha.get(id)
  if (!t) { console.log(`texto ${id}: não existe\n`); continue }

  const c = caps.all(id)
  const amostra = c.map((x) => semTags(x.corpo)).join(' ').replace(/\s+/g, ' ').slice(0, 6000)
  const r = lingua(amostra)

  console.log(`── texto ${id} · obra ${t.obra_id} · rotulado "${t.idioma}" · medido "${r.lingua}" (${r.vantagem?.toFixed?.(2)}x)`)
  console.log(`   ${String(t.titulo).slice(0, 70)}`)
  console.log(`   ${t.fonte_url ?? ''}`)
  for (const x of c) {
    console.log(`   [${x.ordem}] ${String(x.titulo ?? '').slice(0, 50)}`)
    console.log(`       ${semTags(x.corpo).replace(/\s+/g, ' ').trim().slice(0, 230)}`)
  }
  console.log()
}
