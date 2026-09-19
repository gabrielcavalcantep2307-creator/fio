// Enche a fila da esteira com os clássicos em domínio público mais lidos do
// Project Gutenberg que o Fio ainda não tem.
//
//   node ingestao/lote-populares.mjs --ja-temos ja-temos.json --quantos 120 --saida lote.json
//
// `ja-temos.json`: { ids: [ids do Gutenberg já no catálogo ou na fila], titulos: [...] }
// (tirado do banco de produção). A regra é a de sempre: autor morto até 1955,
// original em língua que a esteira traduz, e nada que já esteja em português.
// O título é traduzido pelo MinT só para a fila ficar legível; a obra entra
// no site quando a tradução do livro inteiro fica pronta.

import { readFileSync, writeFileSync } from 'node:fs'
import { traduzir } from '../servidor/servicos/motor-traducao.mjs'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }
const jaTemos = JSON.parse(readFileSync(arg('ja-temos'), 'utf8'))
const ids = new Set(jaTemos.ids.map(Number))
const titulos = new Set(jaTemos.titulos.map((t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()))
const quantos = Number(arg('quantos', 120))
const LIMITE = new Date().getFullYear() - 71
const LINGUAS = new Set(['en', 'fr', 'de', 'es', 'it', 'ru'])
const normal = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const escolhidos = []
let pagina = `https://gutendex.com/books/?sort=popular&languages=${[...LINGUAS].join(',')}`
while (pagina && escolhidos.length < quantos) {
  // o Gutendex é um serviço voluntário e às vezes demora: três tentativas com prazo largo
  let r
  for (let t = 1; t <= 4 && !r; t++) {
    try { r = await fetch(pagina, { headers: { 'user-agent': 'fio/0.1 (biblioteca em portugues)' }, signal: AbortSignal.timeout(150_000) }).then((x) => x.json()) }
    catch (e) { if (t === 4) throw e; process.stdout.write('~'); await new Promise((ok) => setTimeout(ok, 5000 * t)) }
  }
  for (const l of r.results) {
    if (escolhidos.length >= quantos) break
    const autor = l.authors?.[0]
    const lingua = l.languages?.[0]
    if (!autor?.death_year || autor.death_year > LIMITE || !LINGUAS.has(lingua)) continue
    if (l.copyright === true || ids.has(l.id)) continue
    if (!/Text/.test(l.media_type ?? 'Text')) continue
    const titulo = String(l.title).split(/[\r\n;:]/)[0].trim().slice(0, 200)
    if (titulos.has(normal(titulo))) continue
    // fora: coletâneas de leis, dicionários, índices, livros de receitas e "complete works" gigantes
    if (/dictionary|index of|complete works|works of|collected|encyclop|cookbook|volume \d+.*of|bible/i.test(l.title)) continue
    escolhidos.push({ gutenberg: l.id, titulo, autor: autor.name.split(', ').reverse().join(' '), morte: autor.death_year, idioma: lingua, downloads: l.download_count })
  }
  pagina = r.next
}

for (const e of escolhidos) {
  try { e.tituloPt = (await traduzir(e.titulo, { de: e.idioma, para: 'pt' })).replace(/\.$/, '') } catch { e.tituloPt = e.titulo }
  process.stdout.write('.')
}
writeFileSync(arg('saida', 'lote.json'), JSON.stringify(escolhidos, null, 1))
console.log(`\n${escolhidos.length} livros novos para a fila`)
for (const e of escolhidos.slice(0, 25)) console.log(`  ${e.tituloPt} — ${e.autor} (${e.idioma}, ${e.downloads} downloads)`)
