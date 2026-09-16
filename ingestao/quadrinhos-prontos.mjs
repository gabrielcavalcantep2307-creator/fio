// Do catálogo completo de quadrinhos, só o que já está inteiro no disco.
//
//   node ingestao/quadrinhos-prontos.mjs --site /site < quadrinhos-completo.json > quadrinhos.json
//
// O download de milhares de páginas leva horas. Publicar o catálogo inteiro
// antes disso é mostrar volume que abre com metade das páginas quebradas.
// Então o catálogo público lista só o capítulo cujas páginas TODAS existem, e a
// série só aparece com pelo menos um capítulo pronto. Rodar de novo depois do
// download termina de encher a estante.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const i = process.argv.indexOf('--site')
const SITE = i > 0 ? process.argv[i + 1] : 'web/public'
const completo = JSON.parse(readFileSync(0, 'utf8'))

const existe = (p) => { const f = join(SITE, p); return existsSync(f) && statSync(f).size > 0 }
let caps = 0, paginas = 0
const series = []
for (const s of completo.series) {
  const capitulos = s.capitulos.filter((c) => c.paginas.every(existe) && existe(c.capa))
  if (!capitulos.length) continue
  caps += capitulos.length
  paginas += capitulos.reduce((n, c) => n + c.paginas.length, 0)
  series.push({ ...s, capa: capitulos[0].capa, capitulos })
}
process.stdout.write(JSON.stringify({ ...completo, series }))
process.stderr.write(`prontos: ${series.length} séries, ${caps} capítulos, ${paginas} páginas\n`)
