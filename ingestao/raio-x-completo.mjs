// O raio-x de TUDO: estrutura, título e sinal de OCR quebrado (21/09/2026).
//
//   node ingestao/raio-x-completo.mjs --banco /dados/catalogo.db
//   node ingestao/raio-x-completo.mjs --banco /dados/catalogo.db --fonte archive --lista
//
// raio-x-estrutura.mjs já mede PAREDE e INTEIRO. Este arquivo soma mais dois
// problemas, varrendo capítulo por capítulo com .iterate() (nunca .all() —
// PROJETO.md §8 avisa que varrer `capitulo` inteiro trava o processo):
//
//   SEM TÍTULO   c.titulo nulo ou vazio
//   OCR RUIM     um símbolo (@ # $ % ^ *) preso ENTRE letras dentro de uma
//                palavra ("espcran$a", "Corr&i") — trocas de caractere que a
//                digitalização do Archive introduz e que uma letra sozinha
//                errada (comum, inevitável) não causa. É medida RELATIVA —
//                não conta erro por erro, ranqueia qual livro está pior.

import { DatabaseSync } from 'node:sqlite'

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
const tem = (n) => process.argv.includes(n)
const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: true })
const soFonte = arg('--fonte', null)

const OCR_RUIM = /[a-zà-ÿ][$@#%^*][a-zà-ÿ]/gi

const sql = `
  SELECT c.id, c.texto_id, c.titulo, c.palavras, c.corpo, t.fonte
    FROM capitulo c JOIN texto t ON t.id = c.texto_id JOIN obra o ON o.id = t.obra_id
    JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = 'BR' AND d.estado IN ('dominio_publico','licenca_livre')
   WHERE o.publicada = 1 AND t.dono_id IS NULL AND t.normalizado = 1
     AND o.id NOT IN (SELECT obra_id FROM curadoria_obra WHERE oculta = 1)
     ${soFonte ? "AND t.fonte = '" + soFonte.replace(/[^a-z]/g, '') + "'" : ''}`

const porTexto = new Map()
let total = 0
for (const c of banco.prepare(sql).iterate()) {
  total++
  const t = porTexto.get(c.texto_id) ?? { fonte: c.fonte, caps: 0, semTitulo: 0, palavras: 0, ocrRuim: 0 }
  t.caps++
  t.palavras += c.palavras ?? 0
  if (!c.titulo || !c.titulo.trim()) t.semTitulo++
  const m = c.corpo?.match(OCR_RUIM)
  if (m) t.ocrRuim += m.length
  porTexto.set(c.texto_id, t)
}

const porFonte = new Map()
for (const t of porTexto.values()) {
  const f = porFonte.get(t.fonte) ?? { livros: 0, caps: 0, semTitulo: 0, palavras: 0, ocrRuim: 0, livrosComOcrRuim: 0 }
  f.livros++; f.caps += t.caps; f.semTitulo += t.semTitulo; f.palavras += t.palavras; f.ocrRuim += t.ocrRuim
  if (t.ocrRuim > 0) f.livrosComOcrRuim++
  porFonte.set(t.fonte, f)
}

console.log('=== ' + total + ' capítulos, ' + porTexto.size + ' textos ===\n')
console.log('fonte'.padEnd(14) + 'livros'.padStart(7) + '   caps sem título' + '      ocorrências OCR ruim'.padStart(10) + '  livros afetados'.padStart(18) + '   por mil palavras')
for (const [fonte, f] of [...porFonte].sort((a, b) => b[1].palavras - a[1].palavras)) {
  const porMil = (f.ocrRuim / (f.palavras / 1000)).toFixed(2)
  console.log(fonte.padEnd(14) + String(f.livros).padStart(7) + String(f.semTitulo).padStart(10) + ' de ' + String(f.caps).padEnd(8) +
    String(f.ocrRuim).padStart(10) + String(f.livrosComOcrRuim).padStart(18) + ('  ' + porMil).padStart(15))
}

if (tem('--lista')) {
  console.log('\n--- os livros com mais sinais de OCR ruim ---')
  const piores = [...porTexto].filter(([, t]) => (!soFonte || t.fonte === soFonte)).sort((a, b) => b[1].ocrRuim - a[1].ocrRuim).slice(0, Number(arg('--quantos', 30)))
  const pegaTitulo = banco.prepare('SELECT coalesce(o.titulo_pt, o.titulo) titulo FROM texto t JOIN obra o ON o.id = t.obra_id WHERE t.id = ?')
  for (const [id, t] of piores) {
    const titulo = pegaTitulo.get(id)?.titulo ?? '?'
    console.log('  ' + String(id).padStart(6) + '  ' + (t.ocrRuim + 'x').padStart(6) + '  ' + (t.palavras + ' pal').padStart(10) + '  ' + titulo.slice(0, 60))
  }
}
