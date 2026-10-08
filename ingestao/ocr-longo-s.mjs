// O "s longo" dos livros escaneados (08/10/2026).
//
// Muitos dos 989 livros de foto de página são impressos com o "ſ" (s longo),
// e a máquina leu esse ſ como "f" ou "fl": "difcurfo" (discurso), "fyftema"
// (systema), "refpofta" (resposta), "neceflario" (necessario). É uma CLASSE de
// erro, e dá para desfazê-la sem palpite: troca-se o "f" por "s" (ou "fl"/"ff"
// por "ss") em todas as combinações possíveis, e só vale quando
//   - a palavra lida NÃO existe nos livros digitados,
//   - uma única forma trocada existe nos livros digitados (comparando sem
//     acento, porque o scan também erra o acento), em 3 livros ou mais,
//   - e essa forma é no mínimo 10 vezes mais usada que a segunda colocada.
// Saída: /dados/ocr/longo-s.tsv (palavra, nova, ocorrências, livros). Quem
// decide o que entra em servidor/ocr-correcoes.json sou eu, lendo uma amostra.
//
//   node ingestao/ocr-longo-s.mjs [pasta]

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const pasta = process.argv[2] || '/dados/ocr'
const ler = (n) => readFileSync(join(pasta, n), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
const SEM = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u', ç: 'c' }
const nu = (s) => [...s].map((c) => SEM[c] ?? c).join('')

// o dicionário: palavra de livro digitado, em 3 livros ou mais; por forma SEM acento
// guarda as acentuadas, a mais usada primeiro
const dic = new Map()
const porNu = new Map()
for (const [w, n, lv] of ler('digitado.tsv')) {
  if (Number(lv) < 3 || Number(n) < 20) continue
  dic.set(w, Number(n))
  const k = nu(w)
  porNu.set(k, [...(porNu.get(k) ?? []), [w, Number(n)]])
}
for (const v of porNu.values()) v.sort((a, b) => b[1] - a[1])

const jaTem = JSON.parse(readFileSync(new URL('../servidor/ocr-correcoes.json', import.meta.url), 'utf8'))
const mapa = jaTem.trocas ?? jaTem

// todas as leituras possíveis de uma palavra com ſ lido como f
function variantes(w) {
  const saida = new Set()
  const ir = (i, acc) => {
    if (saida.size > 400) return
    if (i >= w.length) { saida.add(acc); return }
    const c = w[i]
    if (c !== 'f') { ir(i + 1, acc + c); return }
    ir(i + 1, acc + 's')
    ir(i + 1, acc + 'f')
    if (w[i + 1] === 'l' || w[i + 1] === 'f' || w[i + 1] === 'i') { ir(i + 2, acc + 'ss'); ir(i + 2, acc + 's') }
  }
  ir(0, '')
  return saida
}

const achados = []
for (const [w, n, lv] of ler('so-no-scan.tsv')) {
  if (w in mapa || Number(lv) < 2 || Number(n) < 8 || w.length < 4 || !w.includes('f')) continue
  const forca = new Map()
  for (const v of variantes(nu(w))) {
    if (v === nu(w)) continue
    for (const [forma, q] of porNu.get(v) ?? []) forca.set(forma, Math.max(forca.get(forma) ?? 0, q))
  }
  if (!forca.size) continue
  const ord = [...forca].sort((a, b) => b[1] - a[1])
  const [melhor, q] = ord[0]
  if (q < 200 || melhor.length < 6 || w.length < 5 || (ord[1] && ord[1][1] * 10 > q)) continue
  // primeira letra comida pelo scan ("ifcurfo" é d-iscurso, "onftança" é C-onstança):
  // se uma letra a mais na frente dá palavra bem mais usada, a leitura não é esta
  if ('abcdefghijklmnopqrstuvwxyz'.split('').some((l) => (dic.get(l + melhor) ?? 0) * 3 >= q)) continue
  // a troca tem de TIRAR f: a palavra nova com menos f que a lida
  if ((melhor.match(/f/g) ?? []).length >= (w.match(/f/g) ?? []).length) continue
  achados.push([w, melhor, Number(n), Number(lv), q])
}
achados.sort((a, b) => b[2] - a[2])
writeFileSync(join(pasta, 'longo-s.tsv'), achados.map((r) => r.join('\t')).join('\n') + '\n')
console.log(`${achados.length} palavras, ${achados.reduce((s, r) => s + r[2], 0)} ocorrências`)
let sem = 5; const r = () => (sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648
const a = achados.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
console.log(a.slice(0, 150).map((x) => x[0] + '>' + x[1]).join('  '))
