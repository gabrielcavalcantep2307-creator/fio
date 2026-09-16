// Trocar as capas feias por capa de verdade, quando ela existe.
//
//   node ingestao/capas-bonitas.mjs --banco /dados/catalogo.db --site /site            (confere)
//   node ingestao/capas-bonitas.mjs --banco /dados/catalogo.db --site /site --gravar   (grava)
//
// ─────────────────────────────────────────────────────────────
// O DIAGNÓSTICO (16/09/2026)
//
// Das capas locais do acervo, 280 eram a capa que o GUTENBERG DESENHA quando
// não tem a original — triângulos coloridos e o logotipo dele, sempre 200×300 —
// e 792 eram foto pequena e cinzenta de folha de rosto. A home abria com a
// "Biographia do Padre José Agostinho de Macedo" de triângulos. As boas eram 669.
//
// Aqui se procura, para cada capa ruim, a edição mais reeditada na Open Library
// com capa, e só se aceita se:
//   - o SOBRENOME do autor casar (o Frankl já ganhou a capa de "Desenhos Astrais");
//   - o arquivo for COLORIDO (JPEG com 3 componentes) — capa da Open Library de
//     livro antigo costuma ser a mesma folha de rosto cinza, e trocar cinza por
//     cinza não conserta nada;
//   - não for a capa desenhada do Gutenberg (200×300) nem página em branco.
// Achou: grava `capa_externa` e limpa `capa`, porque a capa local vence a
// externa na tela. Não achou: a obra entra em `sem-capa.json`, e ganha capa
// desenhada por `capas-desenhadas.mjs`.
// ─────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'
import { openSync, readSync, closeSync, existsSync, writeFileSync, readFileSync } from 'node:fs'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }
const GRAVAR = process.argv.includes('--gravar')
const SITE = arg('site', 'web/public')
// Em /dados, e não em /tmp: um deploy recria o container e leva o /tmp junto —
// foi assim que a primeira rodada morreu no meio, em 16/09. O volume de dados
// sobrevive, e com ele a lista do que já foi tentado: rodar de novo retoma.
const SAIDA = arg('saida', '/dados/capas-sem-capa.json')
const TENTADAS = arg('tentadas', '/dados/capas-tentadas.json')
const banco = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: !GRAVAR })
// A esteira sobe livros e reindexa enquanto isto roda; esperar a vez em vez
// de morrer com "database is locked".
if (GRAVAR) banco.exec('PRAGMA busy_timeout = 120000')

const UA = 'fio/0.1 (biblioteca em portugues)'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function medida(b) {
  if (b.length > 24 && b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), c: 3 }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), c: b[i + 9] }
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

function medidaDoArquivo(caminho) {
  const fd = openSync(caminho, 'r'); const buf = Buffer.alloc(65536)
  const n = readSync(fd, buf, 0, 65536, 0); closeSync(fd)
  return medida(buf.subarray(0, n))
}

/** A capa local é ruim? E de que jeito. */
function ruim(o) {
  const p = `${SITE}/capas/${o.capa}`
  if (!existsSync(p)) return 'sem arquivo'
  const m = medidaDoArquivo(p)
  if (!m) return null
  if (m.w === 200 && m.h === 300 && o.capa.startsWith('gutenberg-')) return 'desenhada pelo Gutenberg'
  if (m.c === 1) return 'folha de rosto cinza'
  if (m.w < 150) return 'pequena demais'
  return null
}

const nu = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const tituloLimpo = (t) => String(t).split('\n')[0].replace(/\((vol|tomo|volume)[^)]*\)/gi, '').replace(/\s+/g, ' ').trim()

async function capaDaOpenLibrary(titulo, autor) {
  const alvo = nu(autor).split(/[\s,.]+/).filter((p) => p.length > 2).at(-1)
  if (!alvo || /autoria|desconhec|anonim/.test(alvo)) return null
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(titulo)}`
    + `&author=${encodeURIComponent(autor)}&fields=cover_i,author_name,edition_count&limit=10`
  let docs = []
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
    if (!r.ok) return null
    docs = (await r.json()).docs ?? []
  } catch { return null }
  const candidatos = docs
    .filter((d) => d.cover_i > 0 && (d.author_name ?? []).some((n) => nu(n).includes(alvo)))
    .sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0))
    .slice(0, 3)
  for (const d of candidatos) {
    try {
      const r = await fetch(`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
        { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) })
      if (!r.ok) continue
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length < 6000) continue // página em branco pesa pouco
      const m = medida(bytes)
      if (!m || m.c !== 3 || (m.w === 200 && m.h === 300) || m.h < m.w) continue
      return String(d.cover_i)
    } catch { /* tenta a próxima */ }
    await dormir(400)
  }
  return null
}

const obras = banco.prepare(`
  SELECT o.id, o.titulo, o.titulo_pt, o.capa, o.capa_externa,
         (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
           WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor,
         (SELECT GROUP_CONCAT(t.nome, '|') FROM obra_tema ot JOIN tema t ON t.id = ot.tema_id WHERE ot.obra_id = o.id) temas
    FROM obra o
   WHERE o.publicada = 1 AND o.capa IS NOT NULL AND o.capa <> '' AND o.capa NOT LIKE '%.svg'
   ORDER BY o.id`).all()

const alvos = obras.map((o) => ({ ...o, problema: ruim(o) })).filter((o) => o.problema)
console.log(`${obras.length} capas locais; ${alvos.length} ruins`)

const trocaExterna = GRAVAR && banco.prepare("UPDATE obra SET capa_externa = ?, capa = NULL, atualizado_em = datetime('now') WHERE id = ?")
const lerJson = (f, padrao) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return padrao } }
const semCapa = lerJson(SAIDA, [])
const tentadas = new Set(lerJson(TENTADAS, []))
const guardarProgresso = () => {
  writeFileSync(SAIDA, JSON.stringify(semCapa))
  if (GRAVAR) writeFileSync(TENTADAS, JSON.stringify([...tentadas]))
}
let achadas = 0, jaTinha = 0

for (const [i, o] of alvos.entries()) {
  // Já havia capa da Open Library guardada, escondida atrás da local ruim.
  if (o.capa_externa) {
    if (GRAVAR) trocaExterna.run(o.capa_externa, o.id)
    jaTinha++
    continue
  }
  if (tentadas.has(o.id)) continue // procurado numa rodada anterior, sem capa real
  const titulo = tituloLimpo(o.titulo_pt || o.titulo)
  const id = o.autor ? await capaDaOpenLibrary(titulo, o.autor) : null
  if (id) {
    if (GRAVAR) trocaExterna.run(id, o.id)
    achadas++
  } else {
    semCapa.push({ id: o.id, titulo, autor: o.autor, temas: (o.temas ?? '').split('|').filter(Boolean) })
    tentadas.add(o.id)
  }
  if (i % 25 === 0) {
    console.log(`  ${i + 1}/${alvos.length}  capa real: ${achadas}  já tinha: ${jaTinha}  sem: ${semCapa.length}`)
    guardarProgresso()
  }
  await dormir(700)
}

guardarProgresso()
console.log(`\nfim: ${achadas} capas reais novas, ${jaTinha} reveladas, ${semCapa.length} vão ganhar capa desenhada (${SAIDA})`)
