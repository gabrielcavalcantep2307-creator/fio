import { readFileSync, writeFileSync } from 'node:fs'
const linhas = readFileSync('/dados/ocr/proposta.tsv', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
// lidas por mim (1–1.350) e recusadas
const FORA = new Set(('onfo fcr poronde accina cftes effes eftcs diffo comman qiic func ftança llc d\'c lhetas govenio natolio orotheo anlre qni aflm ldeãs nhãs liem atule xms iie aeu ' +
  'beiro eiie fabcr acbeu dtf coii eflava folta élé ífe succe fião fiii foço aiii euora cys dtt csla iiu íca ticia alh lro cec eíto díf coid effei vcl glc ossine ompony demarco baie cpe segun mfím luo asilia').split(' '))
const soS = (a, b) => a.length === b.length && [...a].every((c, i) => c === b[i] || (c === 'f' && b[i] === 's')) && a !== b
const mapa = {}
let lidas = 0, cauda = 0
linhas.forEach(([a, b], i) => {
  if (FORA.has(a)) return
  if (i < 1350) {
    if (a.length <= 4 && !soS(a, b)) return
    mapa[a] = b; lidas++
  } else if (a.length >= 5 && soS(a, b)) { mapa[a] = b; cauda++ }
})
writeFileSync('/dados/ocr/correcoes.json', JSON.stringify(mapa))
console.log({ lidas, cauda, total: Object.keys(mapa).length })
const c = Object.entries(mapa).filter(([a]) => linhas.findIndex((l) => l[0] === a) >= 1350)
let s = 11; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]] }
console.log(c.slice(0, 300).map(([a, b]) => a + '>' + b).join(' '))
