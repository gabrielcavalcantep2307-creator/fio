// O corretor de scan que olha a palavra vizinha (08/10/2026).
//
// A lista de erros de leitura só troca a palavra quando UMA candidata ganha
// folgada ("efta" -> "esta"). Sobram 681 mil ocorrências de palavras com duas ou
// três candidatas plausíveis ("nfto": neto? noto?), que só o contexto resolve —
// como o corretor do celular. Este script prepara duas coisas, lidas na hora da
// entrega por servidor/ortografia.mjs:
//
//   bigramas.bin  quantas vezes cada par de palavras seguidas aparece nos livros
//                 DIGITADOS em português (Gutenberg, Wikisource), que têm a
//                 mesma grafia dos escaneados. Tabela por hash, 2^24 casas de
//                 16 bits (32 MB): cabe no servidor sem encher a memória.
//   cand.json     para cada palavra de scan que não existe nos digitados, até
//                 quatro candidatas que existem (de proposta.tsv e duvidas.tsv).
//
//   node ingestao/ocr-contexto.mjs [pastaOcr] [pastaSaida]

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { hash2, hash1, BITS } from '../servidor/bigramas.mjs'

const [pastaOcr = '/dados/ocr', saida = '/dados/mapas'] = process.argv.slice(2)
mkdirSync(saida, { recursive: true })
const PAL = /[a-zà-öø-ÿ]+(?:['’-][a-zà-öø-ÿ]+)*/g

const tabela = new Uint16Array(1 << BITS)
const unigramas = new Uint32Array(1 << 22)
const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
const textos = banco.prepare(`SELECT id FROM texto WHERE dono_id IS NULL AND idioma = 'pt' AND fonte IN ('gutenberg','wikisource')`).all()
const caps = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?')
let palavras = 0
for (const t of textos) {
  for (const c of caps.iterate(t.id)) {
    let antes = null
    for (const m of c.corpo.replace(/<\/?(p|div|br|h[1-6]|li|blockquote|tr|td)\b[^>]*>/gi, ' . ').replace(/<[^>]+>/g, '').toLowerCase().matchAll(PAL)) {
      const w = m[0].replace(/’/g, "'")
      unigramas[hash1(w) & ((1 << 22) - 1)]++
      if (antes !== null) { const h = hash2(antes, w); if (tabela[h] < 65535) tabela[h]++ }
      antes = w
      palavras++
    }
  }
}
writeFileSync(join(saida, 'bigramas.bin'), Buffer.from(tabela.buffer))
writeFileSync(join(saida, 'unigramas.bin'), Buffer.from(unigramas.buffer))
console.log(`${palavras} palavras lidas nos digitados; tabelas gravadas`)

// candidatas: do que o ocr-lista.mjs já propôs
const dic = new Map()
for (const l of readFileSync(join(pastaOcr, 'digitado.tsv'), 'utf8').split('\n')) { const c = l.split('\t'); if (c[0] && Number(c[2]) >= 3) dic.set(c[0], Number(c[1])) }
const cand = {}
for (const f of ['proposta.tsv', 'duvidas.tsv']) {
  if (!existsSync(join(pastaOcr, f))) continue
  for (const l of readFileSync(join(pastaOcr, f), 'utf8').split('\n')) {
    const c = l.split('\t')
    const w = c[0]
    if (!w || w.length < 4 || dic.has(w)) continue
    const alts = (c[6] ?? '').split(' ').map((x) => x.split(':')[0]).filter((a) => a && dic.has(a) && (dic.get(a) ?? 0) >= 20 && a !== w)
    const todas = [...new Set([c[1], ...alts].filter((a) => a && dic.has(a)))].slice(0, 4)
    if (todas.length) cand[w] = todas
  }
}
writeFileSync(join(saida, 'cand.json'), JSON.stringify(cand))
console.log(`${Object.keys(cand).length} palavras de scan com candidatas`)
