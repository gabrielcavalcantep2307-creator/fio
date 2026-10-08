// A palavra partida no fim da linha (08/10/2026).
//
// O livro impresso parte "parte" em "par-" / "te" na quebra de linha, e o scan
// guarda "par-te", "gover-no", "ape-nas": 12 mil vezes só nas 300 mais
// repetidas. Se juntar as duas pontas dá uma palavra dos livros digitados e a
// segunda ponta NÃO é pronome ("vê-lo", "dar-te", "faz-se" são hífens de
// verdade), é a palavra inteira. Saída: /dados/ocr/hifen.tsv
//
//   node ingestao/ocr-hifen.mjs [pasta]

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const pasta = process.argv[2] || '/dados/ocr'
const ler = (n) => readFileSync(join(pasta, n), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
const dic = new Map()
for (const [w, n, lv] of ler('digitado.tsv')) if (Number(lv) >= 3) dic.set(w, Number(n))
const jaTem = JSON.parse(readFileSync(new URL('../servidor/ocr-correcoes.json', import.meta.url), 'utf8'))
const mapa = jaTem.trocas ?? jaTem

// pronomes que se prendem ao verbo com hífen: aí o hífen é da língua
const PRONOMES = new Set('o a os as lo la los las lho lha lhos lhas lhe lhes me te se nos vos no na nos nas mo ma'.split(' '))
// "pe-lo" é "pelo" (por+o), nunca o verbo "pê" + "lo"; só no começo
const PELO = new Set(['pe-lo', 'pe-la', 'pe-los', 'pe-las'])

const achados = []
for (const [w, n, lv] of ler('so-no-scan.tsv')) {
  if (w in mapa || !w.includes('-') || Number(lv) < 2) continue
  const partes = w.split('-')
  if (partes.length !== 2) continue
  const [a, b] = partes
  const junto = a + b
  if (a.length < 2 || b.length < 2) continue
  // pronome na ponta: "dar-te" é verbo + te, mas "par-te" é a palavra "parte". Como o
  // hífen verdadeiro já existe nos digitados (e aí a palavra não chega aqui), só
  // desisto quando a primeira ponta tem cara de infinitivo (5 letras ou mais, em -r)
  if (!PELO.has(w) && PRONOMES.has(b) && ((a.length >= 5 && a.endsWith('r')) || /[à-ÿ]/.test(a))) continue
  if (junto.length < 5 || (dic.get(junto) ?? 0) < 50) continue
  // primeira letra comida pelo scan ("ar-los" é C-arlos): se uma letra na frente dá palavra mais usada, não
  if ('abcdefghijklmnopqrstuvwxyz'.split('').some((l) => (dic.get(l + junto) ?? 0) * 3 >= dic.get(junto))) continue
  // as duas pontas já são palavras comuns sozinhas ("bem-vindo"): hífen de verdade
  if ((dic.get(a) ?? 0) > 5000 && (dic.get(b) ?? 0) > 5000 && !PELO.has(w)) continue
  achados.push([w, junto, Number(n), Number(lv), dic.get(junto)])
}
achados.sort((x, y) => y[2] - x[2])
writeFileSync(join(pasta, 'hifen.tsv'), achados.map((r) => r.join('\t')).join('\n') + '\n')
console.log(`${achados.length} palavras, ${achados.reduce((s, r) => s + r[2], 0)} ocorrências`)
let sem = 3; const r = () => (sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648
const x = achados.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] }
console.log(x.slice(0, 160).map((y) => y[0] + '>' + y[1]).join('  '))
