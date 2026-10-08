// Grafia de 2026, por evidência e sem hunspell (08/10/2026).
//
// O dicionário aqui é o próprio acervo: palavra que aparece 10 vezes ou mais
// em TEXTO MODERNO (traduções do Fio e leis do Planalto) é palavra de hoje.
// Uma palavra velha ("annos", "gráo", "systema") é a que NUNCA aparece nesse
// texto, aparece em 2 livros ou mais, e tem o mesmo ESQUELETO de uma palavra
// de hoje (letra dobrada, ph/th/y, ct/pt mudos, ch de "chimica", acento) —
// a mesma lista de mudanças da reforma que ingestao/ortografia.mjs já usa na
// cauda, agora decidida só pelos números, para poder rodar sozinha na VPS.
//
// Travas (todas medidas em amostra lida, 2% de erro na amostra de 200):
//   - a antiga em 3+ ocorrências e 2+ livros; a nova com 10+ no texto moderno;
//   - uma única candidata, ou a primeira 10x mais usada que a segunda;
//   - fora: língua estrangeira (estrangeiras.txt), pronome/pretérito em -ra/-ão/-am,
//     acento novo na última sílaba, nome com maiúscula (eles ficam por conta de
//     servidor/ortografia.mjs), e troca só de acento que TIRA í/ú/â ("memoría"
//     é "memória", não "memoria").
// Saída: /dados/mapas/grafia-auto.json {antiga: nova}
//
//   node ingestao/modernizar-grafia.mjs [pastaOrtografia] [saida]

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const pasta = process.argv[2] || '/dados/ortografia'
const saida = process.argv[3] || '/dados/mapas/grafia-auto.json'
const ler = (n) => readFileSync(join(pasta, n), 'utf8').split('\n').filter(Boolean)
const repo = JSON.parse(readFileSync(new URL('../servidor/ortografia-atualizada.json', import.meta.url), 'utf8'))
const jaTem = new Set(Object.keys(repo.trocas))
const estrangeira = existsSync(join(pasta, 'estrangeiras.txt')) ? new Set(ler('estrangeiras.txt')) : new Set()

const SEM = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u' }
const nu = (s) => [...s].map((c) => SEM[c] ?? c).join('')
const esq = (s) => nu(s.replace(/ch(?=[eií])/g, 'qu')).replace(/([bcdfglmnpt])\1/g, '$1').replace(/ph/g, 'f').replace(/th/g, 't').replace(/rh/g, 'r').replace(/y/g, 'i')
  .replace(/chr/g, 'cr').replace(/chl/g, 'cl').replace(/mpt/g, 'nt').replace(/([aeiou])[cp]t/g, '$1t')
  .replace(/[cp]ç/g, 'ç').replace(/^sc(?=[ei])/, 'c').replace(/mn/g, 'n').replace(/gn(?=[aeiou])/g, 'n')

const uso = new Map()
for (const l of ler('palavras.tsv')) { const [p, n, lv, mod] = l.split('\t'); uso.set(p, [Number(n), Number(lv), Number(mod)]) }
const SO_LETRAS = /^[a-zà-öø-ÿ]+$/

// o dicionário de hoje, por esqueleto
const hoje = new Map()
for (const [p, [n, , mod]] of uso) {
  if (mod < 10 || n < 30 || !SO_LETRAS.test(p)) continue
  const k = esq(p)
  if (!hoje.has(k)) hoje.set(k, [])
  hoje.get(k).push([p, mod])
}
for (const v of hoje.values()) v.sort((a, b) => b[1] - a[1])

const mapa = {}
for (const [a, [n, lv, mod]] of uso) {
  if (n < 3 || lv < 2 || mod > 0 || a.length < 5 || !SO_LETRAS.test(a) || jaTem.has(a) || estrangeira.has(a)) continue
  if (/^([bcdfglmnprst])\1|^gn/.test(a)) continue
  const cands = (hoje.get(esq(a)) ?? []).filter(([b]) => b !== a)
  if (!cands.length) continue
  const [b, qb] = cands[0]
  if (cands[1] && cands[1][1] * 10 > qb) continue
  if (b.length < 4 || estrangeira.has(b)) continue
  // só o acento do fim muda ("buquês" é palavra, "buques" não)
  if (nu(a) === nu(b) && /[áâéêíóôú]s?$/.test(a)) continue
  // mais-que-perfeito/pretérito: "ouvira" não é "ouvirá"; "-árão" é "-aram"
  if (a.endsWith('ra') && b === a.slice(0, -1) + 'á') continue
  if (/[áâéêíóôú]r[ãa][oõ]$/.test(a)) continue
  if (/([aáâàã][oóôõ]|[aáâàã]m)$/.test(a) && !/ç[aáâàã][oóôõ]$/.test(a)) continue
  if (/[áéêíóôú]s?$/.test(b) && !/[áéêíóôú]s?$/.test(a)) continue
  // só o acento muda e a nova tem menos: tira só ô/ê/é/ó/á ("vapôr" -> "vapor"), nunca í/ú/â
  if (nu(a) === nu(b) && b === nu(b) && /[íúâ]/.test(a)) continue
  mapa[a] = b
}
const ordem = Object.fromEntries(Object.entries(mapa).sort(([x], [y]) => x.localeCompare(y, 'pt')))
writeFileSync(saida, JSON.stringify(ordem))
console.log(`${Object.keys(ordem).length} palavras, ${Object.keys(ordem).reduce((s, a) => s + uso.get(a)[0], 0)} ocorrências -> ${saida}`)
let sem = 123; const r = () => (sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648
const x = Object.entries(ordem); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] }
console.log(x.slice(0, 160).map(([a, b]) => a + '>' + b).join('  '))
