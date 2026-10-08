// Classes de erro de scan com troca única e conhecida (08/10/2026).
//
// Lidas nos livros mais abertos do acervo (Ano Histórico Sul-Rio-Grandense,
// O Brasil e o Acaso...): quase tudo que a lista não cobria era nome próprio
// (certo), e o que era erro vinha em poucos jeitos fixos:
//   "occasiào", "construcçào"   o til lido como acento grave/circunflexo -> "ão"
//   "diíferença", "soífrer"     o "ff" lido como "íf"                      -> "ff"/"f"
//   "doesta", "eslas", "d'esle" o "t" lido como "l" depois de "es"        -> "est"
//   "couegas", "couocado"       o "l" lido como "ou" depois de "c"        -> "col"
// Vale só quando a palavra lida NÃO existe nos digitados, UMA forma trocada
// existe (sem comparar acento), 50 vezes ou mais, e a segunda colocada é 10x
// menos usada. Saída: /dados/ocr/classes.tsv
//
//   node ingestao/ocr-classes.mjs [pasta]

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const pasta = process.argv[2] || '/dados/ocr'
const ler = (n) => readFileSync(join(pasta, n), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
const SEM = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u', ç: 'c' }
const nu = (s) => [...s].map((c) => SEM[c] ?? c).join('')
const dic = new Map(), porNu = new Map()
for (const [w, n, lv] of ler('digitado.tsv')) {
  if (Number(lv) < 3) continue
  dic.set(w, Number(n))
  const k = nu(w); porNu.set(k, [...(porNu.get(k) ?? []), [w, Number(n)]])
}
const jaTem = JSON.parse(readFileSync(new URL('../servidor/ocr-correcoes.json', import.meta.url), 'utf8'))

// cada regra: [de, [por, ...]] aplicada a UMA posição por vez
const REGRAS = [
  [/[àâ]o(s?)$/, ['ão$1']], [/[àâ]e(s?)$/, ['ãe$1']],
  [/[ií]?íf/, ['ff', 'f']], [/íf/, ['ff', 'f']], [/ííf/, ['ff']],
  [/esl/, ['est']], [/ou(?=[aeiouáéíóúãõ])/, ['ol']],
]
function variantes(w) {
  const s = new Set()
  for (const [re, pors] of REGRAS) {
    const g = new RegExp(re.source, 'g')
    for (const m of w.matchAll(g)) for (const por of pors) s.add(w.slice(0, m.index) + m[0].replace(re, por) + w.slice(m.index + m[0].length))
  }
  return s
}
const ach = []
for (const [w, n, lv] of ler('so-no-scan.tsv')) {
  if (w in jaTem || Number(n) < 2 || w.length < 5) continue
  const forca = new Map()
  for (const v of variantes(w)) for (const [f, q] of porNu.get(nu(v)) ?? []) forca.set(f, Math.max(forca.get(f) ?? 0, q))
  if (!forca.size) continue
  const ord = [...forca].sort((a, b) => b[1] - a[1])
  const [melhor, q] = ord[0]
  if (q < 50 || melhor === w || melhor.length < 5 || (ord[1] && ord[1][1] * 10 > q)) continue
  if ('abcdefghijklmnopqrstuvwxyz'.split('').some((l) => (dic.get(l + melhor) ?? 0) * 3 >= q)) continue
  ach.push([w, melhor, Number(n), Number(lv), q])
}
ach.sort((a, b) => b[2] - a[2])
writeFileSync(join(pasta, 'classes.tsv'), ach.map((r) => r.join('\t')).join('\n') + '\n')
console.log(ach.length, 'palavras', ach.reduce((s, r) => s + r[2], 0), 'ocorrências')
let sem = 5; const r = () => (sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648
const a = ach.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
console.log(a.slice(0, 120).map((x) => x[0] + '>' + x[1]).join('  '))
