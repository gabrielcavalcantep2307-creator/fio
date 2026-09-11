// Abrir um EPUB e tirar dele os capítulos.
//
// O inverso de `epub.mjs`, que monta um. Aqui se desmonta o que o leitor
// mandou: um arquivo que ele comprou, ou que é dele, e que ele quer ler aqui
// com as marcações e a sincronia que o resto da biblioteca oferece.
//
// ─────────────────────────────────────────────────────────────
// SEM DEPENDÊNCIA, como todo o resto deste servidor
//
// EPUB é um zip com XML dentro. Ler zip é ler um índice no fim do arquivo e
// depois inflar cada pedaço, e o `node:zlib` já faz a parte difícil. São umas
// setenta linhas, e valem mais que uma biblioteca de terceiro num servidor
// que roda com 320 MB de memória e recebe arquivo de estranho.
//
// O XML é lido por expressão regular, e isso é uma escolha e não preguiça: o
// que precisamos do OPF são duas listas — o manifesto, que diz qual arquivo é
// qual, e a espinha, que diz a ORDEM. Um analisador completo de XML seria
// mais código e mais superfície para um arquivo malformado atacar.
// ─────────────────────────────────────────────────────────────

import { inflateRawSync } from 'node:zlib'

/** Onde termina o índice do zip. Vem do fim, porque é onde o formato o põe. */
function acharFimDoIndice(b) {
  // o comentário final pode ter até 64 KB, então a busca é limitada
  const de = Math.max(0, b.length - 66_000)
  for (let i = b.length - 22; i >= de; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i
  }
  return -1
}

/**
 * O índice do zip: nome, onde começa, como está comprimido.
 *
 * Só o índice central é lido. O cabeçalho local de cada arquivo mente com
 * frequência — muitos zipadores deixam tamanho zero lá e põem a verdade num
 * descritor depois dos dados — e o central é o que o formato manda respeitar.
 */
function lerIndice(b) {
  const fim = acharFimDoIndice(b)
  if (fim < 0) throw new Error('não parece um arquivo zip')

  const quantos = b.readUInt16LE(fim + 10)
  let p = b.readUInt32LE(fim + 16)
  const entradas = []

  for (let i = 0; i < quantos && p + 46 <= b.length; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break
    const metodo = b.readUInt16LE(p + 10)
    const comprimido = b.readUInt32LE(p + 20)
    const cru = b.readUInt32LE(p + 24)
    const nomeN = b.readUInt16LE(p + 28)
    const extraN = b.readUInt16LE(p + 30)
    const comentN = b.readUInt16LE(p + 32)
    const inicio = b.readUInt32LE(p + 42)
    const nome = b.subarray(p + 46, p + 46 + nomeN).toString('utf8')
    entradas.push({ nome, metodo, comprimido, cru, inicio })
    p += 46 + nomeN + extraN + comentN
  }
  return entradas
}

/** O conteúdo de um arquivo de dentro do zip. */
function abrir(b, e) {
  if (b.readUInt32LE(e.inicio) !== 0x04034b50) throw new Error(`entrada quebrada: ${e.nome}`)
  const nomeN = b.readUInt16LE(e.inicio + 26)
  const extraN = b.readUInt16LE(e.inicio + 28)
  const dados = b.subarray(e.inicio + 30 + nomeN + extraN,
    e.inicio + 30 + nomeN + extraN + e.comprimido)
  if (e.metodo === 0) return dados
  if (e.metodo === 8) return inflateRawSync(dados)
  throw new Error(`compressão ${e.metodo}, que eu não sei abrir`)
}

// ─────────────────────────────────────────────────────────────

const acharTag = (xml, tag) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]
const semXml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** Resolve "../Text/cap1.xhtml" contra a pasta do OPF. */
function juntar(base, rel) {
  const partes = base.split('/').slice(0, -1)
  for (const p of decodeURIComponent(rel).split('/')) {
    if (p === '..') partes.pop()
    else if (p !== '.' && p !== '') partes.push(p)
  }
  return partes.join('/')
}

/**
 * Um documento do EPUB vira um capítulo — ou vários, se ele for um livro
 * inteiro disfarçado.
 *
 * A espinha do EPUB diz a ordem de leitura, e não o que é capítulo. Muita
 * editora empacota o livro todo em três ou quatro arquivos: *Dom Casmurro* do
 * Gutenberg tem 68 mil palavras em quatro documentos, e um deles sozinho é
 * cento e tantos capítulos.
 *
 * Isso ainda se lê, e estraga tudo o que depende de o capítulo ser pequeno: o
 * "você parou aqui", o anti-spoiler, a barra de progresso e a sensação de
 * avançar. Um capítulo de sessenta mil palavras é um livro sem marcador.
 *
 * Então, quando o documento é longo E tem cabeçalhos dentro, ele é partido
 * neles. Quando não tem, fica inteiro — cortar por palpite num texto sem
 * marca é pior do que não cortar.
 */
const marcasDe = (corpo, n) => [...corpo.matchAll(new RegExp(`<(h${n})\\b[^>]*>([\\s\\S]*?)</\\1>`, 'gi'))]

/**
 * Qual nível de cabeçalho separa os capítulos NESTE arquivo.
 *
 * Não dá para fixar `h1` nem `h2`. Cada editora escolhe o seu, e a escolha não
 * segue regra nenhuma: o *Dom Casmurro* do Gutenberg usa `h1` para o nome do
 * autor, `h4` para o título do capítulo e `h5` para o numeral romano — os
 * capítulos de verdade estão no nível MAIS FUNDO, que é o oposto do que se
 * esperaria.
 *
 * Então se experimenta. O nível bom é o que produz pelo menos três pedaços e
 * cujo MAIOR pedaço é pequeno perto do todo; se nenhum serve, o arquivo fica
 * inteiro. Medir é mais confiável que adivinhar, e custa seis expressões
 * regulares.
 */
function melhorNivel(corpo, palavrasTotais) {
  let escolhido = null
  for (let n = 1; n <= 6; n++) {
    const marcas = marcasDe(corpo, n)
    if (marcas.length < 3) continue
    let maior = 0
    marcas.forEach((m, i) => {
      const fim = i + 1 < marcas.length ? marcas[i + 1].index : corpo.length
      maior = Math.max(maior, semXml(corpo.slice(m.index, fim)).split(' ').length)
    })
    // um capítulo não pode ser um quinto do livro
    if (maior <= Math.max(6000, palavrasTotais * 0.2)) {
      if (!escolhido || maior < escolhido.maior) escolhido = { n, marcas, maior }
    }
  }
  return escolhido
}

function partir(corpo) {
  const palavras = semXml(corpo).split(' ').length
  // arquivo curto já é um capítulo; partir aqui só cria migalha
  if (palavras < 4000) {
    const t = semXml(marcasDe(corpo, 1)[0]?.[2] ?? marcasDe(corpo, 2)[0]?.[2] ?? '') || null
    return [{ titulo: t?.slice(0, 200) ?? null, corpo }]
  }

  const nivel = melhorNivel(corpo, palavras)
  if (!nivel) return [{ titulo: null, corpo }]

  const pedacos = []
  const abertura = corpo.slice(0, nivel.marcas[0].index)
  if (semXml(abertura).split(' ').length > 80) pedacos.push({ titulo: null, corpo: abertura })

  nivel.marcas.forEach((m, i) => {
    const fim = i + 1 < nivel.marcas.length ? nivel.marcas[i + 1].index : corpo.length
    const pedaco = corpo.slice(m.index, fim)
    if (semXml(pedaco).length < 40) return
    pedacos.push({ titulo: (semXml(m[2]) || null)?.slice(0, 200) ?? null, corpo: pedaco })
  })
  return pedacos.length ? pedacos : [{ titulo: null, corpo }]
}

/**
 * O livro que está dentro deste arquivo.
 *
 * @param bytes o EPUB inteiro
 * @returns `{ titulo, autor, idioma, capitulos: [{ ordem, titulo, corpo }] }`
 */
export function lerEpub(bytes) {
  const entradas = lerIndice(bytes)
  const por = new Map(entradas.map((e) => [e.nome, e]))

  // 1. o container aponta para o OPF, que é o índice do livro
  const container = por.get('META-INF/container.xml')
  if (!container) throw new Error('não achei META-INF/container.xml — isto não é um EPUB')
  const caminhoOpf = abrir(bytes, container).toString('utf8')
    .match(/full-path="([^"]+)"/i)?.[1]
  if (!caminhoOpf || !por.has(caminhoOpf)) throw new Error('o EPUB aponta para um índice que não existe')

  const opf = abrir(bytes, por.get(caminhoOpf)).toString('utf8')

  // 2. manifesto: id → arquivo
  const arquivoDe = new Map()
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = m[0].match(/\bid="([^"]+)"/i)?.[1]
    const href = m[0].match(/\bhref="([^"]+)"/i)?.[1]
    const tipo = m[0].match(/media-type="([^"]+)"/i)?.[1] ?? ''
    if (id && href && /xhtml|html/i.test(tipo)) arquivoDe.set(id, juntar(caminhoOpf, href))
  }

  // 3. espinha: a ORDEM de leitura, que é a única fonte confiável dela.
  //    Ordenar os arquivos pelo nome parece funcionar e quebra em
  //    "cap10" vindo antes de "cap2".
  const ordem = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/gi)]
    .map((m) => arquivoDe.get(m[1]))
    .filter(Boolean)
  if (!ordem.length) throw new Error('o EPUB não diz em que ordem ler')

  const capitulos = []
  for (const caminho of ordem) {
    const e = por.get(caminho)
    if (!e) continue
    const xhtml = abrir(bytes, e).toString('utf8')
    const corpo = acharTag(xhtml, 'body') ?? xhtml
    if (semXml(corpo).length < 40) continue   // capa, folha de rosto, página vazia

    for (const pedaco of partir(corpo)) {
      capitulos.push({ ordem: capitulos.length + 1, ...pedaco })
    }
  }
  if (!capitulos.length) throw new Error('não achei texto dentro deste EPUB')

  return {
    titulo: semXml(acharTag(opf, 'dc:title') ?? acharTag(opf, 'title')) || null,
    autor: semXml(acharTag(opf, 'dc:creator')) || null,
    idioma: (semXml(acharTag(opf, 'dc:language')) || 'pt').slice(0, 5).toLowerCase(),
    capitulos,
  }
}
