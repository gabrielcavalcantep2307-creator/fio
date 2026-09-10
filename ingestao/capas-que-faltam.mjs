// Baixar as capas que faltam, e recusar as que enganam.
//
//   node ingestao/capas-que-faltam.mjs --lista fila.json --saida pasta/
//
// `fila.json` é uma lista de `{ id, olid, titulo }`. Sai a pasta com os
// arquivos e um `mapa.json` dizendo qual arquivo é de qual obra.
//
// ─────────────────────────────────────────────────────────────
// POR QUE ISTO NÃO É SÓ UM DOWNLOAD
//
// Prateleira sem capa é lista, e 88 das 222 obras que aparecem na página
// principal estão sem. Só que capa errada é pior que capa faltando, e as duas
// fontes de capa deste projeto enganam de jeitos diferentes — os dois já
// custaram tempo antes e estão registrados aqui para não custarem de novo.
//
//   O GUTENBERG SEMPRE DEVOLVE IMAGEM. Quando não tem a capa real, ele
//   DESENHA uma, berrante, com a marca dele. São exatamente 200x300 pixels;
//   scan de livro de verdade preserva a proporção do original e quase nunca
//   cai nesse número redondo. É por isso que a medida é conferida.
//
//   A OPEN LIBRARY DEVOLVE SCAN QUASE BRANCO. Página em branco digitalizada,
//   que CARREGA sem erro nenhum e aparece na tela como um retângulo claro. O
//   sinal barato é o peso: uma capa de verdade, em 400 pixels de largura, não
//   ocupa dois quilobytes. Uma folha branca ocupa.
//
// Nenhuma das duas dá erro. As duas passam batido se ninguém olhar. Por isso
// a conferência é do ARQUIVO, e não do código HTTP.
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const lista = JSON.parse(readFileSync(arg('lista'), 'utf8'))
const saida = arg('saida', 'capas')
mkdirSync(saida, { recursive: true })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────
// Ler a medida sem biblioteca nenhuma
//
// São dois formatos e dois cabeçalhos. JPEG guarda a medida num marcador
// SOF, que é preciso caçar pulando de segmento em segmento; PNG guarda nos
// bytes 16 a 24, sempre. Vinte linhas evitam uma dependência.
// ─────────────────────────────────────────────────────────────

function medidaPNG(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) }
}

function medidaJPEG(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue }
    const marca = b[i + 1]
    // SOF0..SOF15, menos os marcadores que não carregam medida
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
      return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) }
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

const medida = (b) => medidaPNG(b) ?? medidaJPEG(b)

/** Serve como capa? A resposta é sobre o ARQUIVO, e não sobre o pedido. */
function serve(bytes) {
  if (bytes.length < 4000) return 'leve demais — costuma ser página em branco'
  const m = medida(bytes)
  if (!m) return 'não é imagem que eu saiba ler'
  if (m.largura === 200 && m.altura === 300) return 'é a capa que o Gutenberg desenha'
  if (m.largura < 120 || m.altura < 180) return `pequena demais (${m.largura}x${m.altura})`
  if (m.altura < m.largura) return `deitada (${m.largura}x${m.altura}) — capa é em pé`
  return null
}

// ─────────────────────────────────────────────────────────────

async function baixar(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })
  if (!r.ok) return null
  return Buffer.from(await r.arrayBuffer())
}

/**
 * Os endereços a tentar, em ordem de qualidade.
 *
 * A ficha da obra costuma trazer `covers: [id]`, e o id dá a imagem grande. O
 * endereço por OLID é o plano B: existe sempre, e às vezes devolve a edição
 * errada, o que é aceitável para uma prateleira e não seria para uma ficha.
 */
const nu = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * O plano C, que virou o plano que mais funciona.
 *
 * O `olid_work` guardado no acervo aponta para a ficha que a nossa ingestão
 * escolheu um dia, e nem sempre é a ficha COM capa. "1984" e "A revolução dos
 * bichos" — justamente os dois que interessam — apontam para registros
 * obscuros, sem imagem, e o endereço por OLID devolve uma folha em branco.
 *
 * A busca da Open Library resolve, porque ela ordena por edição popular e
 * edição popular tem capa. O preço é o risco de trazer o livro errado, que
 * neste projeto já aconteceu — o Frankl ganhou a capa de "Desenhos Astrais".
 * Por isso o resultado só é aceito se o SOBRENOME do autor casar.
 */
async function porBusca(titulo, autor) {
  const alvo = nu(autor).split(/\s+/).filter((p) => p.length > 2).at(-1)
  if (!alvo) return []
  const q = `https://openlibrary.org/search.json?title=${encodeURIComponent(titulo)}`
    + `&author=${encodeURIComponent(autor)}&fields=title,author_name,cover_i&limit=8`
  try {
    const r = await fetch(q, { headers: { 'user-agent': UA, accept: 'application/json' } })
    if (!r.ok) return []
    const { docs = [] } = await r.json()
    return docs
      .filter((d) => d.cover_i && (d.author_name ?? []).some((n) => nu(n).includes(alvo)))
      .slice(0, 3)
      .map((d) => `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`)
  } catch { return [] }
}

async function enderecos(olid, titulo, autor) {
  const urls = []
  if (olid) {
    const id = String(olid).replace(/^\/works\//, '').replace(/^\//, '')
    try {
      const r = await fetch(`https://openlibrary.org/works/${id}.json`,
        { headers: { 'user-agent': UA, accept: 'application/json' } })
      if (r.ok) {
        const d = await r.json()
        for (const c of (d.covers ?? []).filter((n) => n > 0).slice(0, 3)) {
          urls.push(`https://covers.openlibrary.org/b/id/${c}-L.jpg`)
        }
      }
    } catch { /* segue */ }
  }
  urls.push(...await porBusca(titulo, autor))
  if (olid) {
    const id = String(olid).replace(/^\/works\//, '').replace(/^\//, '')
    urls.push(`https://covers.openlibrary.org/b/olid/${id}-L.jpg`)
  }
  return urls
}

const mapa = {}
const recusadas = []

for (const [i, o] of lista.entries()) {
  let guardou = false
  {
    for (const url of await enderecos(o.olid, o.titulo, o.autor)) {
      let bytes
      try { bytes = await baixar(url) } catch { continue }
      if (!bytes) continue

      const problema = serve(bytes)
      if (problema) { recusadas.push({ ...o, url, problema }); continue }

      const arquivo = `capa-${o.id}.jpg`
      writeFileSync(join(saida, arquivo), bytes)
      const m = medida(bytes)
      mapa[o.id] = { arquivo, largura: m.largura, altura: m.altura, kb: Math.round(bytes.length / 1024) }
      guardou = true
      break
    }
  }
  if (!guardou && !recusadas.some((r) => r.id === o.id)) recusadas.push({ ...o, problema: 'sem capa na fonte' })

  process.stdout.write(`\r  ${i + 1}/${lista.length}  ${Object.keys(mapa).length} capas, ${recusadas.length} recusadas   `)
  await dormir(250)
}
console.log('\n')

writeFileSync(join(saida, 'mapa.json'), JSON.stringify(mapa, null, 1), 'utf8')
console.log(`${Object.keys(mapa).length} capas em ${saida}`)
console.log(`${recusadas.length} recusadas:`)
for (const r of recusadas.slice(0, 20)) {
  console.log(`  ${String(r.titulo).slice(0, 34).padEnd(34)} ${r.problema}`)
}
