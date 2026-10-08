// A frase de abertura da Wikipédia sobre a obra (08/10/2026), para a sinopse.
//
//   node ingestao/achar-wikipedia.mjs legiveis.json saida.json
//
// Para cada livro da Wikisource, o item do Wikidata ligado à página é a OBRA; se
// ele tem artigo na Wikipédia em português, a primeira frase do artigo é uma
// descrição escrita por gente ("Memorial de Aires é um romance de Machado de
// Assis, publicado em 1908"). Só entra a frase que:
//   - fala da obra (o título do artigo bate com o do livro, sem acento),
//   - tem de 40 a 230 letras e começa com o título,
//   - e diz o que a obra é ("é um/uma ..."), sem parênteses de datas no meio.
// O texto da Wikipédia é CC BY-SA: a saída guarda o título e o endereço do artigo
// para a ficha dar o crédito.

import { readFileSync, writeFileSync } from 'node:fs'

const [entrada, saida] = process.argv.slice(2)
const lista = JSON.parse(readFileSync(entrada, 'utf8')).filter((x) => x.fonte === 'wikisource' && x.url)
const UA = { 'user-agent': 'Fiolib/1.0 (https://fiolib.com.br; biblioteca de dominio publico)' }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (url) => {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) }); if (r.status === 429) { await espera(5000 * (i + 1)); continue } if (r.ok) return await r.json() } catch { /* de novo */ }
    await espera(1500)
  }
  return null
}
const sem = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const tituloDaUrl = (u) => decodeURIComponent(u.split('/wiki/')[1] ?? '').replace(/_/g, ' ')

// 1. item do Wikidata de cada página da Wikisource
const item = new Map()
for (let i = 0; i < lista.length; i += 50) {
  const lote = lista.slice(i, i + 50)
  const titulos = lote.map((x) => tituloDaUrl(x.url))
  const d = await json(`https://pt.wikisource.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(titulos.join('|'))}`)
  const norm = new Map((d?.query?.normalized ?? []).map((n) => [n.from, n.to]))
  const red = new Map((d?.query?.redirects ?? []).map((n) => [n.from, n.to]))
  const por = new Map(Object.values(d?.query?.pages ?? {}).map((p) => [p.title, p.pageprops?.wikibase_item]))
  for (const [k, x] of lote.entries()) { let t = titulos[k]; t = norm.get(t) ?? t; t = red.get(t) ?? t; if (por.get(t)) item.set(x.id, por.get(t)) }
  await espera(250)
}
console.log('itens:', item.size)

// 2. o artigo da Wikipédia em português de cada item
const artigo = new Map()
const qs = [...new Set(item.values())]
for (let i = 0; i < qs.length; i += 50) {
  const d = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=ptwiki&format=json&ids=${qs.slice(i, i + 50).join('|')}`)
  for (const [q, e] of Object.entries(d?.entities ?? {})) if (e.sitelinks?.ptwiki?.title) artigo.set(q, e.sitelinks.ptwiki.title)
  await espera(250)
}
console.log('com artigo na Wikipédia:', artigo.size)

// 3. a frase de abertura
const titulos = [...new Set(artigo.values())]
const extrato = new Map()
for (let i = 0; i < titulos.length; i += 20) {
  const d = await json(`https://pt.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=2&redirects=1&format=json&titles=${encodeURIComponent(titulos.slice(i, i + 20).join('|'))}`)
  const red = new Map((d?.query?.redirects ?? []).map((n) => [n.from, n.to]))
  const norm = new Map((d?.query?.normalized ?? []).map((n) => [n.from, n.to]))
  const porT = new Map(Object.values(d?.query?.pages ?? {}).map((p) => [p.title, p.extract]))
  for (const t of titulos.slice(i, i + 20)) { let k = norm.get(t) ?? t; k = red.get(k) ?? k; if (porT.get(k)) extrato.set(t, { extrato: porT.get(k), titulo: k }) }
  await espera(250)
}
const resultado = {}
let rej = 0
for (const x of lista) {
  const t = artigo.get(item.get(x.id))
  const e = t && extrato.get(t)
  if (!e) continue
  const frase = e.extrato.replace(/\s+/g, ' ').replace(/\s*\([^)]{0,60}\)/g, '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)[0]?.trim()
  const titulo = sem(x.t).replace(/\b(a|o|as|os)\b/g, ' ').replace(/\s+/g, ' ').trim()
  const ok = frase && frase.length >= 40 && frase.length <= 230 && sem(e.titulo).includes(titulo.split(' ')[0]) && / é (um|uma|o|a) | foi (um|uma) /.test(frase)
  if (!ok) { rej++; continue }
  resultado[x.id] = { frase, artigo: e.titulo, url: 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(e.titulo.replace(/ /g, '_')) }
}
writeFileSync(saida, JSON.stringify(resultado))
console.log('aceitas:', Object.keys(resultado).length, 'recusadas:', rej)
