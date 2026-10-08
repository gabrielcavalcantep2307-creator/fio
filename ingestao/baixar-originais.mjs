// Os ORIGINAIS dos livros que nós traduzimos (05/10/2026).
//
//   node ingestao/baixar-originais.mjs            # baixa os que faltam
//
// A esteira traduzia direto do Gutenberg e guardava só a tradução. Sem o
// original não há como PROVAR nada: que "athos" é o nome "Athos", que uma
// frase sumiu, que um parágrafo ficou em inglês. Este script traz cada
// original para /dados/originais/<texto_id>.txt — um arquivo por livro, fora
// do banco do site, que ele nem abre para escrever.
//
// Educado com o Gutenberg: um pedido por vez, três segundos entre eles, e o
// que já está no disco não é pedido de novo.

import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'

const BANCO = process.env.FIO_BANCO || '/dados/catalogo.db'
const PASTA = '/dados/originais'
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'
mkdirSync(PASTA, { recursive: true })
const log = (s) => { console.log(s); appendFileSync(PASTA + '/_log.txt', new Date().toISOString().slice(0, 19) + ' ' + s + '\n') }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const db = new DatabaseSync(BANCO, { readOnly: true })
const textos = db.prepare(`SELECT t.id, t.fonte_url, COALESCE(o.titulo_pt, o.titulo) titulo FROM texto t
  JOIN obra o ON o.id = t.obra_id WHERE t.revisao = 'automatica' AND t.dono_id IS NULL ORDER BY t.id`).all()

let baixados = 0, ja = 0, sem = 0, falhas = 0
for (const t of textos) {
  const arquivo = `${PASTA}/${t.id}.txt`
  if (existsSync(arquivo)) { ja++; continue }
  const n = /gutenberg\.org\/(?:cache\/epub|ebooks|files)\/(\d+)/.exec(t.fonte_url ?? '')?.[1]
  if (!n) { sem++; log(`sem endereço do Gutenberg: ${t.id} ${t.titulo} (${t.fonte_url})`); continue }
  try {
    const r = await fetch(`https://www.gutenberg.org/ebooks/${n}.txt.utf-8`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const txt = await r.text()
    if (txt.length < 2000) throw new Error('arquivo pequeno demais (' + txt.length + ')')
    writeFileSync(arquivo, txt)
    baixados++
    log(`ok ${t.id} ${t.titulo} (${Math.round(txt.length / 1024)} KB)`)
  } catch (e) {
    falhas++
    log(`FALHOU ${t.id} ${t.titulo}: ${e.message}`)
  }
  await espera(3000)
}
log(`fim: ${baixados} baixados, ${ja} já estavam, ${sem} sem endereço, ${falhas} falhas, de ${textos.length}`)
