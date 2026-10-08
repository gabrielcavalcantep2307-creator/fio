// O ano de cada obra que ainda não tem (08/10/2026).
//
//   node ingestao/achar-anos.mjs pendentes.json saida.json
//
// pendentes.json: [{ id, t, a, fonte, url, nasc, morte }]. Fontes, da mais para
// a menos segura (cada resposta guarda de onde veio):
//   1. o ano escrito no título ("Lei Municipal 4092 de 2011");
//   2. Wikidata: o texto da Wikisource tem item ligado, e o item tem data de
//      publicação (P577) ou de criação (P571);
//   3. Open Library: o primeiro ano de publicação da obra, achada por título e
//      sobrenome do autor (só aceita se o sobrenome bater);
// Trava: o ano tem de ser posterior ao nascimento do autor (+10) e não pode ser
// futuro. O que não passa fica sem ano — melhor vazio do que errado.

import { readFileSync, writeFileSync } from 'node:fs'

const [entrada, saida] = process.argv.slice(2)
const lista = JSON.parse(readFileSync(entrada, 'utf8'))
const UA = { 'user-agent': 'Fiolib/1.0 (https://fiolib.com.br; biblioteca de dominio publico)' }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (url, tentativas = 3) => {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) })
      if (r.status === 429) { await espera(5000 * (i + 1)); continue }
      if (r.ok) return await r.json()
    } catch { /* tenta de novo */ }
    await espera(1500)
  }
  return null
}
const resultado = {}
const ok = (x, ano) => ano && ano >= (x.nasc ? x.nasc + 10 : 1100) && ano <= 2026
const poe = (x, ano, de) => { if (ok(x, ano) && !resultado[x.id]) resultado[x.id] = { ano, de } }

// 1. ano no título
for (const x of lista) {
  const m = x.t.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/g)
  if (m && /\bde (1[5-9]\d\d|20[0-2]\d)\b/.test(x.t)) poe(x, Number(x.t.match(/\bde (1[5-9]\d\d|20[0-2]\d)\b/)[1]), 'titulo')
}
console.log('no título:', Object.keys(resultado).length)

// 2. Wikisource -> Wikidata
const ws = lista.filter((x) => x.fonte === 'wikisource' && x.url && !resultado[x.id])
const tituloDaUrl = (u) => decodeURIComponent(u.split('/wiki/')[1] ?? '').replace(/_/g, ' ')
const item = new Map()
for (let i = 0; i < ws.length; i += 50) {
  const lote = ws.slice(i, i + 50)
  const titulos = lote.map((x) => tituloDaUrl(x.url))
  const d = await json(`https://pt.wikisource.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(titulos.join('|'))}`)
  const norm = new Map((d?.query?.normalized ?? []).map((n) => [n.from, n.to]))
  const red = new Map((d?.query?.redirects ?? []).map((n) => [n.from, n.to]))
  const porTitulo = new Map(Object.values(d?.query?.pages ?? {}).map((p) => [p.title, p.pageprops?.wikibase_item]))
  for (const [k, x] of lote.entries()) {
    let t = titulos[k]; t = norm.get(t) ?? t; t = red.get(t) ?? t
    const q = porTitulo.get(t)
    if (q) item.set(x.id, q)
  }
  if (i % 500 === 0) console.log('wikisource', i, '/', ws.length, 'com item:', item.size)
  await espera(300)
}
const ids = [...new Set(item.values())]
const dados = new Map()
for (let i = 0; i < ids.length; i += 50) {
  const d = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=${ids.slice(i, i + 50).join('|')}`)
  for (const [q, e] of Object.entries(d?.entities ?? {})) {
    const pega = (p) => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.time).filter(Boolean)
      .map((t) => Number(t.slice(1, 5))).filter((a) => a > 0)
    const a = [...pega('P577'), ...pega('P571')].sort((p, q2) => p - q2)[0]
    if (a) dados.set(q, a)
  }
  await espera(300)
}
for (const x of ws) if (dados.has(item.get(x.id))) poe(x, dados.get(item.get(x.id)), 'wikidata')
console.log('depois do Wikidata:', Object.keys(resultado).length)

// 3. Open Library, pelo título e pelo sobrenome
const sem = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
let n = 0
for (const x of lista) {
  if (resultado[x.id] || !x.a || /autoria não identificada/i.test(x.a)) continue
  const sobrenome = sem(x.a.split(',')[0]).split(/\s+/).filter((p) => p.length > 2).at(-1)
  if (!sobrenome) continue
  const titulo = x.t.replace(/\s*[(:—].*$/, '').trim()
  const d = await json(`https://openlibrary.org/search.json?limit=5&fields=title,author_name,first_publish_year&title=${encodeURIComponent(titulo)}&author=${encodeURIComponent(sobrenome)}`)
  const doc = (d?.docs ?? []).find((o) => (o.author_name ?? []).some((a) => sem(a).includes(sobrenome)) && sem(o.title).slice(0, 12) === sem(titulo).slice(0, 12))
  if (doc?.first_publish_year) poe(x, doc.first_publish_year, 'openlibrary')
  if (++n % 100 === 0) { console.log('openlibrary', n, 'consultas; total com ano:', Object.keys(resultado).length); writeFileSync(saida, JSON.stringify(resultado)) }
  await espera(250)
}
writeFileSync(saida, JSON.stringify(resultado))
const por = {}
for (const v of Object.values(resultado)) por[v.de] = (por[v.de] ?? 0) + 1
console.log('FIM:', Object.keys(resultado).length, 'de', lista.length, por)
