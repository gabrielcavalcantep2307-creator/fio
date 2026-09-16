// Os quadrinhos e mangás do Fio: o catálogo e a lista do que baixar.
//
//   node ingestao/quadrinhos.mjs --saida web/public/dados/quadrinhos.json --baixar downloads.tsv
//
// ─────────────────────────────────────────────────────────────
// O QUE ENTRA, E O QUE NÃO ENTRA
//
// Mangá comercial em português — One Piece, Naruto, Jujutsu — tem dono duas
// vezes: o autor japonês e a editora brasileira da tradução. Site que "tem
// tudo" é scan pirata. Aqui entra só o que tem permissão expressa ou está em
// domínio público, e em português ou sem texto:
//
//   PEPPER&CARROT, de David Revoy — fantasia colorida, publicada sob CC-BY 4.0
//   pelo próprio autor, com tradução OFICIAL para o português do Brasil feita
//   por tradutores creditados. A licença pede crédito, e o crédito vai em cada
//   episódio.
//
//   HOKUSAI MANGA (1814–1878), de Katsushika Hokusai — o livro que deu nome ao
//   "mangá". Domínio público; digitalização da Smithsonian Libraries no Internet
//   Archive, que declara cada volume livre. São desenhos, não há o que traduzir.
//   Lê-se da direita para a esquerda, como o mangá de hoje.
//
//   BORDALO PINHEIRO (1846–1905) — caricatura e história em imagens em
//   português: o Zé Povinho, O António Maria, Pontos nos ii.
//
//   OS LIVROS ILUSTRADOS DE EDO — manga, gafu, ehon e os bestiários de yōkai de
//   Toriyama Sekien, da coleção da Smithsonian Libraries.
//
// E o que ficou de fora, para não voltar a ser procurado: manhwa. O que aparece
// "traduzido em PT-BR" no Internet Archive é scan pirata enviado por usuário, e
// o resto é obra coreana recente, protegida (varredura de 16/09/2026).
//
// Cada volume é conferido na hora: se a instituição não declarar domínio
// público na ficha do item, ele não entra.
// ─────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const pegar = async (url, tipo = 'json') => {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return tipo === 'json' ? await r.json() : await r.text()
    } catch (e) { if (tentativa === 3) throw e; await new Promise((ok) => setTimeout(ok, 1500 * tentativa)) }
  }
}

const downloads = []
const baixar = (url, destino) => { downloads.push([url, destino]); return `/${destino}` }

// ── Pepper&Carrot ──
async function pepperCarrot() {
  const BASE = 'https://www.peppercarrot.com/0_sources'
  const [eps, langs] = await Promise.all([pegar(`${BASE}/episodes-v1.json`), pegar(`${BASE}/langs.json`)])
  const pt = langs.pt
  const capitulos = []
  for (const ep of eps) {
    if (!ep.translated_languages.includes('pt')) continue
    const n = Number(ep.name.match(/^ep(\d+)/)[1])
    const nn = String(n).padStart(2, '0')
    const pasta = `quadrinhos/pepper-carrot/ep${nn}`
    // O título oficial em português mora no SVG da página de título.
    let titulo = `Episódio ${n}`
    try {
      const svg = await pegar(`${BASE}/${ep.name}/lang/pt/E${nn}P00.svg`, 'texto')
      const achado = [...svg.matchAll(/>([^<>]{3,140})</g)].map((m) => m[1].trim()).find((t) => /^Episódio/i.test(t))
      if (achado) titulo = achado
    } catch { /* fica o genérico */ }
    const numeradas = Object.entries(ep.pages).filter(([k]) => /^\d+$/.test(k)).sort((a, b) => Number(a[0]) - Number(b[0]))
    const paginas = [
      baixar(`${BASE}/${ep.name}/low-res/pt_${ep.pages.title}`, `${pasta}/00.jpg`),
      ...numeradas.map(([k, arq]) => baixar(`${BASE}/${ep.name}/low-res/pt_${arq}`, `${pasta}/${k.padStart(2, '0')}.jpg`)),
    ]
    const capa = baixar(`${BASE}/${ep.name}/low-res/pt_${ep.pages.cover}`, `${pasta}/capa.jpg`)
    capitulos.push({ n, titulo, capa, paginas })
    process.stdout.write(`\r  Pepper&Carrot: ${capitulos.length} episódios`)
  }
  console.log()
  return {
    id: 'pepper-carrot',
    titulo: 'Pepper&Carrot',
    autor: 'David Revoy',
    ano: '2014 –',
    estilo: 'colorido',
    formato: 'quadrinho',
    sentido: 'ltr',
    modo: 'rolagem',
    idioma: 'Português (Brasil)',
    resumo: 'Pepper é uma jovem bruxa do Caos que só quer aprender magia de verdade; Carrot é o gato laranja que atrapalha tudo. Episódios curtos, pintados à mão digital, num mundo de escolas de feitiçaria rivais, poções que dão errado e concursos de magia.',
    tags: ['fantasia', 'magia', 'humor', 'aventura', 'bruxas'],
    capa: capitulos[0]?.capa,
    licenca: {
      nome: 'CC-BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/deed.pt_BR',
      credito: `Pepper&Carrot, de David Revoy (www.peppercarrot.com), licença CC-BY 4.0. Tradução para o português do Brasil: ${pt.translators.join(', ')}. Publicado aqui sem alterações.`,
    },
    fonte: 'https://www.peppercarrot.com',
    capitulos,
  }
}

// ── Hokusai Manga ──
async function hokusai() {
  const busca = await pegar('https://archive.org/advancedsearch.php?q=%28identifier%3Adenshinkaishuhov*+OR+identifier%3Ahokusaimangav*%29+AND+contributor%3A%22Smithsonian+Libraries%22&fl%5B%5D=identifier&fl%5B%5D=volume&fl%5B%5D=imagecount&rows=100&output=json')
  const porVolume = new Map()
  for (const x of busca.response.docs) {
    const v = Number(String(x.volume ?? '').replace(/\D/g, ''))
    if (!v) continue
    const nota = (y) => (/a$/.test(y.identifier) ? 0 : 1000) + Number(y.imagecount ?? 0)
    if (!porVolume.has(v) || nota(x) > nota(porVolume.get(v))) porVolume.set(v, x)
  }
  const capitulos = []
  for (const [v, x] of [...porVolume.entries()].sort((a, b) => a[0] - b[0])) {
    const meta = (await pegar(`https://archive.org/metadata/${x.identifier}`)).metadata
    const direitos = String(meta.rights ?? meta['possible-copyright-status'] ?? '')
    if (!/public domain/i.test(direitos)) { console.log(`  volume ${v} fora: direitos "${direitos}"`); continue }
    const total = Number(meta.imagecount)
    const pasta = `quadrinhos/hokusai-manga/v${String(v).padStart(2, '0')}`
    const paginas = Array.from({ length: total }, (_, i) =>
      baixar(`https://archive.org/download/${x.identifier}/page/n${i}_w1600.jpg`, `${pasta}/${String(i).padStart(3, '0')}.jpg`))
    // a página 0 é a capa lisa do livro japonês; a capa daqui é um desenho do miolo
    capitulos.push({ n: v, titulo: `Volume ${v}`, capa: paginas[Math.min(5, paginas.length - 1)], paginas, fonte: `https://archive.org/details/${x.identifier}` })
    process.stdout.write(`\r  Hokusai Manga: ${capitulos.length} volumes`)
  }
  console.log()
  return {
    id: 'hokusai-manga',
    titulo: 'Hokusai Manga',
    autor: 'Katsushika Hokusai',
    ano: '1814 – 1878',
    estilo: 'preto e branco',
    formato: 'mangá',
    sentido: 'rtl',
    modo: 'pagina',
    idioma: 'sem texto',
    resumo: 'Os cadernos de esboços do autor de "A Grande Onda": milhares de figuras — monges, lutadores, animais, fantasmas, ofícios, paisagens — em xilogravura. É o livro que deu nome ao mangá, e se lê como um: da direita para a esquerda, em página dupla.',
    tags: ['Japão', 'arte', 'história', 'xilogravura', 'clássico'],
    capa: capitulos[0]?.capa,
    licenca: {
      nome: 'Domínio público',
      url: 'https://archive.org/details/smithsonianlibraries',
      credito: 'Katsushika Hokusai (1760–1849). Domínio público. Digitalização: Smithsonian Libraries, via Internet Archive.',
    },
    fonte: 'https://archive.org',
    capitulos,
  }
}

// ── Rafael Bordalo Pinheiro (1846–1905) ──
//
// O criador do Zé Povinho, e o avô da caricatura e da história em imagens em
// língua portuguesa. Morreu em 1905: livre em qualquer lugar. As edições vêm
// de digitalizações de bibliotecas (Getty Research Institute e outras) no
// Internet Archive; só entra o item que tem página de imagem de verdade.
async function bordalo() {
  const ITENS = [
    { id: 'gri_33125010712418', titulo: 'Álbum das Glórias (1880)', n: 1 },
    { id: 'oantoniomaria1881unse', titulo: 'O António Maria (1879)', n: 2 },
    { id: 'pontosnosii1188unse', titulo: 'Pontos nos ii — volume 1 (1885)', n: 3 },
    { id: 'pontosnosii3188unse', titulo: 'Pontos nos ii — volume 3 (1885–1886)', n: 4 },
  ]
  const capitulos = []
  for (const it of ITENS) {
    let meta
    try { meta = (await pegar(`https://archive.org/metadata/${it.id}`)).metadata } catch { continue }
    const total = Number(meta?.imagecount)
    if (!total) continue
    const pasta = `quadrinhos/bordalo-pinheiro/${String(it.n).padStart(2, '0')}`
    const paginas = Array.from({ length: total }, (_, i) =>
      baixar(`https://archive.org/download/${it.id}/page/n${i}_w1200.jpg`, `${pasta}/${String(i).padStart(3, '0')}.jpg`))
    capitulos.push({ n: it.n, titulo: it.titulo, capa: paginas[Math.min(6, paginas.length - 1)], paginas, fonte: `https://archive.org/details/${it.id}` })
  }
  console.log(`  Bordalo Pinheiro: ${capitulos.length} volumes`)
  return {
    id: 'bordalo-pinheiro',
    titulo: 'Bordalo Pinheiro: a caricatura portuguesa',
    autor: 'Rafael Bordalo Pinheiro',
    ano: '1879 – 1886',
    estilo: 'preto e branco',
    formato: 'caricatura e história em imagens',
    sentido: 'ltr',
    modo: 'pagina',
    idioma: 'Português (Portugal, séc. XIX)',
    resumo: 'Antes de existir a palavra "quadrinho", Bordalo Pinheiro já contava política em sequência de desenhos. Aqui estão as revistas em que nasceu o Zé Povinho — o povo português que paga a conta e faz o gesto — e o Álbum das Glórias, a galeria de caricaturas dos poderosos do seu tempo.',
    tags: ['Portugal', 'humor', 'política', 'caricatura', 'século XIX'],
    capa: capitulos[0]?.capa,
    licenca: {
      nome: 'Domínio público',
      url: 'https://archive.org/details/texts',
      credito: 'Rafael Bordalo Pinheiro (1846–1905). Domínio público. Digitalizações de bibliotecas via Internet Archive.',
    },
    fonte: 'https://archive.org',
    capitulos,
  }
}

// ── Os livros ilustrados do Japão de Edo ──
//
// Manga, gafu (álbuns de desenho), ehon (livros ilustrados) e os bestiários de
// yōkai: a tradição de onde o mangá moderno saiu. Coleção da Smithsonian
// Libraries, que declara cada item em domínio público — o item que não diz
// isso na ficha não entra. Lê-se da direita para a esquerda.
//
// Ficam de fora os catálogos de padrões (hinagata), o de arranjo floral e a
// história da pintura em texto corrido: são livros, mas não são leitura em
// imagem.
const NOMES_EDO = [
  [/hyakki|yagy/i, null], // agrupados na série de Sekien
  [/^Hokusai gafu/i, 'Álbum de Hokusai'],
  [/^Hokusai soga/i, 'Esboços rápidos no estilo de Hokusai'],
  [/^Ehon ky.ka yama mata yama/i, 'Montanha após montanha (Hokusai)'],
  [/^Ehon onna Imagawa/i, 'Lições ilustradas para mulheres (Hokusai)'],
  [/^Ehon Edo miyage/i, 'Lembranças de Edo (Hiroshige)'],
  [/^S.hitsu gafu/i, 'Álbum de pinceladas rápidas (Hiroshige)'],
  [/^Ehon ts.h.shi/i, 'O tesouro das imagens (Morikuni)'],
  [/^Unhitsu soga/i, 'Esboços a pincel solto (Morikuni)'],
  [/^Ehon noyamagusa/i, 'Ervas dos campos e das montanhas'],
  [/^Seitei kach. gafu/i, 'Pássaros e flores de Seitei'],
  [/^Bairei hyakuch. gafu/i, 'Cem pássaros de Bairei'],
  [/^Bairei gafu/i, 'Álbum de Bairei'],
  [/^K.rin gafu/i, 'Álbum de Kōrin'],
  [/^K.rin manga/i, 'Mangá de Kōrin'],
  [/^Kan.y.sai gafu/i, 'Álbum de Kan\'yōsai'],
  [/^Soken sansui gafu/i, 'Paisagens de Soken'],
  [/^Soga haya-dehon/i, 'Modelos de esboço rápido'],
  [/^Meika gafu/i, 'Álbum dos mestres'],
  [/^Itch. gafu/i, 'Álbum de Itchō'],
  [/^Soga benran/i, 'Manual de esboços'],
  [/^Bunp. gafu/i, 'Álbum de Bunpō'],
  [/^.kyo gafu/i, 'Álbum de Ōkyo'],
  [/^Kanrin gafu/i, 'Álbum de Kanrin'],
  [/^K.ch. gafu/i, 'Álbum de Kōchō'],
  [/^Kansai gafu/i, 'Álbum de Kansai'],
  [/^Kosh. gafu/i, 'Álbum de Koshū'],
  [/^Keinen kach. gafu/i, 'Pássaros e flores de Keinen'],
  [/^Ehon surugamai/i, 'A dança de Suruga (Utamaro)'],
  [/^Ehon bumeikun/i, 'Os grandes guerreiros, ilustrados (Masanobu)'],
  [/^Ehon Kinry.zan/i, 'O templo de Kinryūzan, ilustrado (Masanobu)'],
]
const FORA_EDO = /hinagata|s.ka hyakki|honch. gashi|denshin kaishu|hokusai manga/i
const COLORIDO_EDO = /kach.|hyakuch.|k.rin|edo miyage|surugamai|kan.y.sai|keinen|seitei|bairei/i

function resumoEdo(titulo) {
  if (/kach.|hyakuch.|p.ssaros/i.test(titulo)) return 'Um álbum de pássaros e flores em xilogravura colorida: cada página é um estudo de cor e de gesto, feito para ser copiado por quem aprendia a pintar — e admirado por quem não pintava.'
  if (/edo miyage|sansui|paisag/i.test(titulo)) return 'Paisagens e cenas de rua do Japão de Edo, em página dupla: o país visto por quem ia a pé, antes da fotografia.'
  if (/buneikun|bumeikun|tsuh.shi|guerreir/i.test(titulo)) return 'Heróis, guerreiros e lendas da história japonesa, desenhados como cenas de ação — a matriz do mangá de samurai.'
  if (/soga|manga|esbo/i.test(titulo)) return 'Esboços rápidos: gente trabalhando, brigando, rindo, animais e criaturas em poucos traços. É o mangá no sentido original da palavra — "desenhos espontâneos".'
  return 'Um álbum de desenhos do Japão de Edo, impresso em xilogravura: figuras, cenas e estudos que circulavam como hoje circulam os mangás.'
}

async function edo() {
  const q = encodeURIComponent('mediatype:texts AND contributor:(Smithsonian) AND language:(jpn OR Japanese) AND (title:(manga OR gafu OR ehon OR gashiki OR gashi OR hyakki OR soga OR ryakuga OR gadai) OR subject:("Japanese illustrated books" OR "Picture books" OR Ukiyoe OR "Wood-engravings, Japanese" OR "Color prints, Japanese"))')
  const fl = ['identifier', 'title', 'creator', 'volume', 'date', 'imagecount'].map((f) => `fl[]=${f}`).join('&')
  const docs = []
  for (let page = 1; page <= 4; page++) {
    const d = await pegar(`https://archive.org/advancedsearch.php?q=${q}&${fl}&rows=500&page=${page}&output=json`)
    docs.push(...d.response.docs)
    if (d.response.docs.length < 500) break
  }
  const grupos = new Map()
  for (const x of docs) {
    // O Internet Archive guarda o mácron DECOMPOSTO ("o" + U+0304): sem NFC,
    // "kachō" não casa com /kach./ e metade da coleção sumia em silêncio.
    x.title = String(x.title).normalize('NFC')
    x.creator = String(x.creator ?? '').normalize('NFC')
    const titulo = x.title
    if (FORA_EDO.test(titulo) || Number(x.imagecount) < 12) continue
    const yokai = /hyakki|yagy/i.test(titulo) && /Toriyama|Sekien/i.test(String(x.creator))
    const nome = yokai ? 'yokai' : (NOMES_EDO.find(([re]) => re.test(titulo))?.[1] ?? null)
    if (!nome) continue
    if (!grupos.has(nome)) grupos.set(nome, [])
    grupos.get(nome).push(x)
  }

  const series = []
  for (const [nome, itens] of grupos) {
    // um item por volume, preferindo o sem sufixo "a" e com mais páginas
    const porVolume = new Map()
    for (const x of itens) {
      const chave = `${String(x.title).slice(0, 30)}|${String(x.volume ?? '')}`
      const nota = (y) => (/a$/.test(y.identifier) ? 0 : 1000) + Number(y.imagecount ?? 0)
      if (!porVolume.has(chave) || nota(x) > nota(porVolume.get(chave))) porVolume.set(chave, x)
    }
    const ordenados = [...porVolume.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title))
      || Number(String(a.volume).replace(/\D/g, '') || 0) - Number(String(b.volume).replace(/\D/g, '') || 0))

    const id = nome === 'yokai' ? 'yokai-sekien' : `edo-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    const capitulos = []
    for (const [i, x] of ordenados.entries()) {
      let meta
      try { meta = (await pegar(`https://archive.org/metadata/${x.identifier}`)).metadata } catch { continue }
      if (!/public domain/i.test(String(meta.rights ?? meta['possible-copyright-status'] ?? ''))) continue
      const total = Number(meta.imagecount)
      if (!total) continue
      const pasta = `quadrinhos/${id}/${String(i + 1).padStart(2, '0')}`
      const paginas = Array.from({ length: total }, (_, k) =>
        baixar(`https://archive.org/download/${x.identifier}/page/n${k}_w1200.jpg`, `${pasta}/${String(k).padStart(3, '0')}.jpg`))
      const vol = String(x.volume ?? '').trim()
      const rotulo = nome === 'yokai' ? `${String(x.title).replace(/\s*[:;/].*$/, '')}${vol ? ` — ${vol}` : ''}` : (vol ? `Volume ${vol.replace(/^v\.\s*/i, '')}` : `Volume ${i + 1}`)
      capitulos.push({ n: i + 1, titulo: rotulo, capa: paginas[Math.min(4, paginas.length - 1)], paginas, fonte: `https://archive.org/details/${x.identifier}` })
    }
    if (!capitulos.length) continue

    const primeiro = ordenados[0]
    // O primeiro nome em `creator` costuma ser o EDITOR (Eirakuya, Tanaka…), e
    // o álbum é do artista. Um mestre conhecido na lista ganha o crédito.
    const MESTRES = /Hokusai|Hiroshige|Utamaro|K.rin|Sekien|Keinen|Bairei|Seitei|Morikuni|Masanobu|.kyo|Bunp.|Itch.|Kanrin|Kosh.|K.ch.|Soken|Hokuō|Taisō|Kansai|Yasukuni|Ayatari|Matora|Shunboku|T.kei/
    const nomes = String(primeiro.creator ?? '').split(/,(?=\S)/)
      .map((c) => c.split(',').slice(0, 2).map((x) => x.trim()).reverse().join(' ').replace(/\s+\d.*$/, '').trim())
      .filter(Boolean)
    const autor = nomes.find((n) => MESTRES.test(n)) ?? nomes[0] ?? 'autor japonês'
    const titulo = nome === 'yokai' ? 'Yōkai: o bestiário de Toriyama Sekien' : nome
    series.push({
      id, titulo, autor,
      ano: String(primeiro.date ?? '').slice(0, 4),
      estilo: COLORIDO_EDO.test(String(primeiro.title)) ? 'colorido' : 'preto e branco',
      formato: nome === 'yokai' ? 'mangá de monstros' : /manga|soga|esbo/i.test(titulo) ? 'mangá' : 'livro ilustrado japonês',
      sentido: 'rtl',
      modo: 'pagina',
      idioma: 'japonês antigo (quase só imagem)',
      resumo: nome === 'yokai'
        ? 'Os quatro livros em que Toriyama Sekien catalogou os monstros do folclore japonês (1776–1784): kappa, tengu, raposas de nove caudas, fantasmas de objetos esquecidos. Foi daqui que saiu a cara dos yōkai de GeGeGe no Kitarō, de Pokémon e de metade dos animes de monstros.'
        : resumoEdo(titulo),
      tags: nome === 'yokai' ? ['yōkai', 'monstros', 'folclore', 'Japão', 'terror'] : ['Japão', 'Edo', 'xilogravura', 'arte'],
      capa: capitulos[0].capa,
      licenca: {
        nome: 'Domínio público',
        url: 'https://library.si.edu/',
        credito: `${autor}. Domínio público. Digitalização: Smithsonian Libraries, via Internet Archive.`,
      },
      fonte: 'https://archive.org',
      capitulos,
    })
    process.stdout.write(`\r  Japão de Edo: ${series.length} séries`)
  }
  console.log()
  // yōkai primeiro; depois o que tem mais volumes
  return series.sort((a, b) => (b.id === 'yokai-sekien') - (a.id === 'yokai-sekien') || b.capitulos.length - a.capitulos.length)
}

const series = [await pepperCarrot(), await hokusai(), await bordalo(), ...(await edo())]
const saida = arg('saida', 'web/public/dados/quadrinhos.json')
mkdirSync(dirname(saida), { recursive: true })
writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString().slice(0, 10), series }))
writeFileSync(arg('baixar', 'quadrinhos-downloads.tsv'), downloads.map(([u, d]) => `${u}\t${d}`).join('\n') + '\n')
console.log(`${series.length} séries, ${series.reduce((s, x) => s + x.capitulos.length, 0)} capítulos, ${downloads.length} imagens para baixar`)
