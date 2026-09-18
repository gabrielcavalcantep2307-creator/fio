// Mais quadrinhos em domínio público, de bibliotecas digitais — em português
// e em outras línguas (a tradução vem depois, pela esteira dos quadrinhos).
//
//   node ingestao/quadrinhos-extras.mjs --completo quadrinhos-completo.json --baixar extras-downloads.tsv
//
// Cada item foi conferido em 17/09/2026: autor morto até 1955 (Brasil) e
// publicação antes de 1931 (EUA, onde fica o servidor), e a instituição
// declara domínio público na ficha (Smithsonian, Library of Congress, Getty,
// Wikimedia Commons). Item sem essa declaração não entra.
//
// Não mexe nas séries que já existem, a não ser para ACRESCENTAR volumes ao
// Bordalo Pinheiro (os números de volume novos começam depois dos antigos).

import { readFileSync, writeFileSync } from 'node:fs'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }
const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.duckdns.org)'
const pegar = async (url) => {
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) { if (t === 3) throw e; await new Promise((ok) => setTimeout(ok, 1500 * t)) }
  }
}

const downloads = []
const baixar = (url, destino) => { downloads.push([url, destino]); return `/${destino}` }
const PD = /public domain|not_in_copyright|out of copyright|no longer under copyright|publicdomain/i

// ── Internet Archive: um item vira um volume ──
async function volumeIA({ id, n, titulo, serie, capa = 4, pular = 0 }) {
  const m = (await pegar(`https://archive.org/metadata/${id}`)).metadata
  const direito = [m['possible-copyright-status'], m.rights, m.licenseurl].filter(Boolean).join(' ')
  const ano = Number(String(m.date ?? '').slice(0, 4))
  if (!PD.test(direito) && !(ano && ano < 1900)) { console.log(`  ! ${id}: sem declaração de domínio público, fica de fora`); return null }
  const total = Number(m.imagecount)
  if (!total) return null
  const pasta = `quadrinhos/${serie}/${String(n).padStart(2, '0')}`
  const paginas = []
  for (let i = pular; i < total; i++) paginas.push(baixar(`https://archive.org/download/${id}/page/n${i}_w1400.jpg`, `${pasta}/${String(i - pular).padStart(3, '0')}.jpg`))
  return { n, titulo, capa: paginas[Math.min(capa, paginas.length - 1)], paginas, fonte: `https://archive.org/details/${id}` }
}

// ── Wikimedia Commons: arquivos de uma categoria, em ordem de nome ──
async function volumeCommons({ categoria, filtro, n, titulo, serie, largura = 1800, capa = 0 }) {
  const arquivos = []
  let cont = {}
  do {
    const j = await pegar(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
      format: 'json', action: 'query', generator: 'categorymembers', gcmtitle: `Category:${categoria}`, gcmtype: 'file', gcmlimit: '200',
      prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiextmetadatafilter: 'LicenseShortName', iiurlwidth: String(largura), ...cont })}`)
    arquivos.push(...Object.values(j.query?.pages ?? {}))
    cont = j.continue ?? null
  } while (cont)
  const bons = arquivos
    .filter((f) => filtro.test(f.title) && PD.test(f.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? ''))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
  const pasta = `quadrinhos/${serie}/${String(n).padStart(2, '0')}`
  const paginas = bons.map((f, i) => {
    const info = f.imageinfo[0]
    return baixar(info.thumburl ?? info.url, `${pasta}/${String(i).padStart(3, '0')}.jpg`)
  })
  if (!paginas.length) return null
  return { n, titulo, capa: paginas[Math.min(capa, paginas.length - 1)], paginas, fonte: `https://commons.wikimedia.org/wiki/Category:${categoria}` }
}

const series = []
const serie = (dados, volumes) => {
  const capitulos = volumes.filter(Boolean)
  if (!capitulos.length) return
  console.log(`${dados.titulo}: ${capitulos.length} volumes, ${capitulos.reduce((s, c) => s + c.paginas.length, 0)} páginas`)
  series.push({ ...dados, capa: capitulos[0].capa, capitulos })
}

serie({
  id: 'wilhelm-busch', titulo: 'Wilhelm Busch: Max e Moritz e outras histórias', autor: 'Wilhelm Busch', ano: '1865 – 1879',
  estilo: 'preto e branco', formato: 'história em imagens', sentido: 'ltr', modo: 'pagina', idioma: 'Alemão e inglês (tradução do Fio a caminho)',
  resumo: 'Max e Moritz, os dois meninos que aprontam sete travessuras e pagam caro na última, são o avô direto dos quadrinhos: rima embaixo, desenho em cima, uma cena depois da outra. Com eles, o macaco Fipps, a menina Julchen e a versão inglesa de Plish e Plum.',
  tags: ['clássico', 'humor', 'infantil', 'Alemanha', 'século XIX'],
  licenca: { nome: 'Domínio público', url: 'https://commons.wikimedia.org/wiki/Category:Max_und_Moritz_(1865)', credito: 'Wilhelm Busch (1832–1908). Domínio público. Digitalizações: Wikimedia Commons, Internet Archive (Bayerische Staatsbibliothek, University of California).' },
  fonte: 'https://commons.wikimedia.org',
}, [
  await volumeCommons({ categoria: 'Max_und_Moritz_(1865)', filtro: /Max und Moritz \(Busch\) \d+\.png$/i, n: 1, titulo: 'Max und Moritz (1865)', serie: 'wilhelm-busch', largura: 1600, capa: 1 }),
  await volumeIA({ id: 'plishplumfromger00buscrich', n: 2, titulo: 'Plish and Plum (1883, em inglês)', serie: 'wilhelm-busch', capa: 6 }),
  await volumeIA({ id: '11390162bsb', n: 3, titulo: 'Fipps, der Affe (1879)', serie: 'wilhelm-busch', capa: 6 }),
  await volumeIA({ id: 'bub_gb_qxFcAAAAMAAJ', n: 4, titulo: 'Julchen (1905)', serie: 'wilhelm-busch', capa: 6 }),
])

serie({
  id: 'benjamin-rabier', titulo: 'Benjamin Rabier: os bichos de Paris', autor: 'Benjamin Rabier', ano: '1900 – 1906',
  estilo: 'colorido', formato: 'álbum ilustrado', sentido: 'ltr', modo: 'pagina', idioma: 'Francês (tradução do Fio a caminho)',
  resumo: 'O desenhista da "Vaca que ri" põe os animais para viver como gente: jantar de gala, briga de vizinhos, piquenique que dá errado. Álbuns coloridos de 1900 a 1906, que inspiraram o Tintim de Hergé.',
  tags: ['humor', 'animais', 'colorido', 'França', 'infantil'],
  licenca: { nome: 'Domínio público', url: 'https://library.si.edu', credito: 'Benjamin Rabier (1864–1939). Domínio público. Digitalizações: Smithsonian Libraries, via Internet Archive.' },
  fonte: 'https://archive.org',
}, [
  await volumeIA({ id: 'SceYnesdelaviep00Rabi', n: 1, titulo: 'Scènes de la vie privée des animaux (1900)', serie: 'benjamin-rabier' }),
  await volumeIA({ id: 'animauxsquotamu00Rabi', n: 2, titulo: "Les animaux s'amusent (1900)", serie: 'benjamin-rabier' }),
  await volumeIA({ id: 'MeYnagerie00Rabi', n: 3, titulo: 'Ménagerie (1906)', serie: 'benjamin-rabier' }),
])

serie({
  id: 'buster-brown', titulo: 'Buster Brown', autor: 'R. F. Outcault', ano: '1904',
  estilo: 'colorido', formato: 'tira de jornal', sentido: 'ltr', modo: 'pagina', idioma: 'Inglês e francês (tradução do Fio a caminho)',
  resumo: 'O menino rico e arteiro e o seu cão Tige, que fala só com o leitor. Cada página termina com Buster escrevendo uma "resolução" moral que ele vai quebrar no domingo seguinte. Do criador do Yellow Kid, o primeiro personagem de quadrinhos de jornal.',
  tags: ['humor', 'clássico', 'colorido', 'EUA', 'tira'],
  licenca: { nome: 'Domínio público', url: 'https://archive.org/details/BusterBrownhisd00Outc', credito: 'Richard F. Outcault (1863–1928). Domínio público. Digitalizações: Library of Congress / Internet Archive e Wikimedia Commons.' },
  fonte: 'https://archive.org',
}, [
  await volumeIA({ id: 'BusterBrownhisd00Outc', n: 1, titulo: 'Buster Brown, his dog Tige and their troubles (1904)', serie: 'buster-brown', capa: 0 }),
  await volumeCommons({ categoria: 'Buster_Brown', filtro: /Buster Brown chez lui \d+[ab]\.jpg$/i, n: 2, titulo: 'Buster Brown chez lui (edição francesa)', serie: 'buster-brown' }),
  await volumeCommons({ categoria: 'Buster_Brown_le_petit_farceur', filtro: /Buster Brown le petit farceur \d+[ab]\.jpg$/i, n: 3, titulo: 'Buster Brown le petit farceur (edição francesa)', serie: 'buster-brown' }),
])

serie({
  id: 'topffer', titulo: 'Rodolphe Töpffer: o primeiro álbum de quadrinhos', autor: 'Rodolphe Töpffer', ano: '1837 – 1860',
  estilo: 'preto e branco', formato: 'história em imagens', sentido: 'ltr', modo: 'pagina', idioma: 'Francês (tradução do Fio a caminho)',
  resumo: 'O senhor Vieux Bois se apaixona, é recusado, tenta morrer de sete jeitos ridículos e não consegue. Publicado em 1837, é considerado o primeiro livro de quadrinhos da história: quadros em sequência com a legenda embaixo, inventados por um professor de Genebra.',
  tags: ['clássico', 'humor', 'Suíça', 'século XIX', 'origem dos quadrinhos'],
  licenca: { nome: 'Domínio público', url: 'https://archive.org/details/gri_33125008412021', credito: 'Rodolphe Töpffer (1799–1846). Domínio público. Digitalização: Getty Research Institute, via Internet Archive.' },
  fonte: 'https://archive.org',
}, [
  await volumeIA({ id: 'gri_33125008412021', n: 1, titulo: 'Les amours de Mr. Vieux Bois', serie: 'topffer', capa: 8 }),
])

serie({
  id: 'opper-willie', titulo: 'Willie e o papai', autor: 'Frederick Burr Opper', ano: '1901',
  estilo: 'preto e branco', formato: 'charge em sequência', sentido: 'ltr', modo: 'pagina', idioma: 'Inglês (tradução do Fio a caminho)',
  resumo: 'O criador de Happy Hooligan faz sátira política em forma de família: o "papai" é o poder econômico, e os filhos são os trustes e os políticos da virada do século nos Estados Unidos.',
  tags: ['sátira', 'política', 'EUA', 'humor'],
  licenca: { nome: 'Domínio público', url: 'https://archive.org/details/williehispapares02oppe', credito: 'Frederick Burr Opper (1857–1937). Domínio público. Digitalização: Library of Congress, via Internet Archive.' },
  fonte: 'https://archive.org',
}, [
  await volumeIA({ id: 'williehispapares02oppe', n: 1, titulo: 'Willie and his papa (1901)', serie: 'opper-willie', capa: 6 }),
])

// ── Bordalo Pinheiro: volumes novos, em português ──
const bordaloNovos = [
  await volumeIA({ id: 'oantoniomaria1882unse', n: 5, titulo: 'O António Maria (1882)', serie: 'bordalo-pinheiro', capa: 6 }),
  await volumeIA({ id: 'oantoniomaria1883unse', n: 6, titulo: 'O António Maria (1883)', serie: 'bordalo-pinheiro', capa: 6 }),
  await volumeIA({ id: 'oantoniomaria1884unse', n: 7, titulo: 'O António Maria (1884)', serie: 'bordalo-pinheiro', capa: 6 }),
  await volumeIA({ id: 'pontosnosii2188unse', n: 8, titulo: 'Pontos nos ii — volume 2', serie: 'bordalo-pinheiro', capa: 6 }),
  await volumeIA({ id: 'pontosnosii4188unse', n: 9, titulo: 'Pontos nos ii — volume 4', serie: 'bordalo-pinheiro', capa: 6 }),
  await volumeIA({ id: 'pontosnosii5188unse', n: 10, titulo: 'Pontos nos ii — volume 5', serie: 'bordalo-pinheiro', capa: 6 }),
  await volumeIA({ id: 'pontosnosii6189unse', n: 11, titulo: 'Pontos nos ii — volume 6', serie: 'bordalo-pinheiro', capa: 6 }),
].filter(Boolean)
console.log(`Bordalo Pinheiro: +${bordaloNovos.length} volumes`)

const completoArq = arg('completo')
if (completoArq) {
  const completo = JSON.parse(readFileSync(completoArq, 'utf8'))
  const novosIds = new Set(series.map((s) => s.id))
  completo.series = [...completo.series.filter((s) => !novosIds.has(s.id)), ...series]
  const bordalo = completo.series.find((s) => s.id === 'bordalo-pinheiro')
  if (bordalo) {
    const tem = new Set(bordalo.capitulos.map((c) => c.n))
    bordalo.capitulos.push(...bordaloNovos.filter((c) => !tem.has(c.n)))
    bordalo.capitulos.sort((a, b) => a.n - b.n)
    bordalo.ano = '1879 – 1891'
  }
  writeFileSync(completoArq, JSON.stringify(completo))
  console.log(`catálogo completo: ${completo.series.length} séries`)
}
const baixarArq = arg('baixar')
if (baixarArq) writeFileSync(baixarArq, downloads.map(([u, d]) => `${u}\t${d}`).join('\n') + '\n')
console.log(`${downloads.length} imagens para baixar`)
