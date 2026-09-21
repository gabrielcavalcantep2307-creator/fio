// A forma do livro, lida do ORIGINAL (21/09/2026).
//
// ─────────────────────────────────────────────────────────────
// POR QUE ESTE ARQUIVO EXISTE
//
// O dono abriu livros e viu "um capítulo só" — inclusive livros que não fomos
// nós que traduzimos — e perguntou se tínhamos puxado errado. O raio-x do
// acervo (ingestao/raio-x-estrutura.mjs) respondeu por fonte: o Wikisource e
// o Gutenberg em português estão bem; 30% das nossas traduções não, e quase
// todas vieram do `.txt` do Gutenberg.
//
// O `.txt` é texto puro. Não diz onde começa um capítulo: há uma linha curta
// entre linhas em branco, e o divisor (servicos/traducao.mjs → emCapitulos)
// tenta adivinhar qual linha curta é título. Adivinhar deu 12 livros inteiros
// numa página só, e o conserto por regra melhorou 13 e deixou outros para
// trás — Sherlock, Robin Hood, O Livro da Selva —, porque no .txt deles o
// título do conto é só um nome, sem número nenhum.
//
// O MESMO livro, no Gutenberg, existe em HTML, e o HTML não adivinha: cada
// capítulo é um <h2> ou um <h3>, escrito por quem preparou a edição. É a
// forma do livro original, dita pelo próprio original. Este arquivo lê essa
// forma — os títulos, em ordem, com o nível de cada um — e diz onde cada um
// começa no texto.
//
// O texto em si continua vindo de onde veio (o .txt, e o caderno com a
// tradução de cada parágrafo dele). Do HTML só se tira a ESTRUTURA. Por isso
// dá para refazer a forma de um livro já traduzido sem traduzir nada de novo.
// ─────────────────────────────────────────────────────────────

const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.com.br)'

/** O número do livro no Gutenberg, a partir de qualquer URL dele. */
export function idDoGutenberg(url) {
  const m = String(url ?? '').match(/gutenberg\.org\/(?:cache\/epub|ebooks|files)\/(\d+)/)
  return m ? Number(m[1]) : null
}

export const urlHtml = (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…' }
export function textoDe(html) {
  return String(html)
    .replace(/<span[^>]*class="[^"]*pagenum[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ' ') // número de página impressa
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (t, n) => ENTIDADES[n.toLowerCase()] ?? t)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A chave de comparação de um trecho: só letras e números, sem acento, sem
 * caixa. É assim que o começo de um parágrafo do HTML se acha no .txt, onde
 * aspas, travessões e o itálico (_assim_) são escritos de outro jeito.
 */
export const chaveDeTrecho = (s, n = 60) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, n)

// O que tem forma de cabeçalho e NÃO é divisão do livro: o sumário, as notas,
// o recado de quem digitou, a licença.
const NAO_E_DIVISAO = /^(contents|table of contents|index|footnotes?|notes?|transcriber'?s? notes?|illustrations?|list of illustrations|the end|finis|fim|conteúdo|sumário|índice|notas)\.?$/i

/**
 * O esboço do livro: os títulos na ordem em que aparecem, cada um com o nível
 * (2 para <h2>…) e a ÂNCORA — o começo do primeiro parágrafo de texto depois
 * dele, que é por onde ele vai ser achado no .txt.
 *
 * @returns {{ titulos: Array<{nivel:number, texto:string, ancora:string}>, paragrafos:number }}
 */
export function esbocoDoHtml(html) {
  let corpo = String(html)
  // a moldura do Gutenberg (cabeçalho e rodapé da licença) sai inteira
  corpo = corpo.replace(/<section[^>]*pg-boilerplate[\s\S]*?<\/section>/gi, ' ')
  const ini = corpo.search(/\*\*\*\s*START OF TH(?:E|IS) PROJECT GUTENBERG[^<]*/i)
  if (ini >= 0) corpo = corpo.slice(ini).replace(/^[^>]*>/, '')
  const fim = corpo.search(/\*\*\*\s*END OF TH(?:E|IS) PROJECT GUTENBERG/i)
  if (fim >= 0) corpo = corpo.slice(0, fim)
  // o sumário é uma lista de links; os títulos dele não são o livro
  corpo = corpo.replace(/<(table|ul|ol)[^>]*>[\s\S]*?<\/\1>/gi, (m) => (/href=/i.test(m) ? ' ' : m))

  const blocos = []
  for (const m of corpo.matchAll(/<(h[1-6]|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase()
    const texto = textoDe(m[2])
    if (!texto) continue
    blocos.push({ tag, texto })
  }

  const titulos = []
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i]
    if (b.tag[0] !== 'h') continue
    const nivel = Number(b.tag[1])
    if (nivel === 1) continue                         // o título do livro
    if (b.texto.length > 160) continue                // parágrafo marcado como cabeçalho
    if (NAO_E_DIVISAO.test(b.texto)) continue
    // a âncora: o primeiro parágrafo de texto de verdade depois do título
    let ancora = ''
    for (let j = i + 1; j < blocos.length && j < i + 12; j++) {
      if (blocos[j].tag[0] === 'h') break              // outro título antes de texto: sem âncora própria
      if (chaveDeTrecho(blocos[j].texto).length >= 25) { ancora = blocos[j].texto; break }
    }
    titulos.push({ nivel, texto: b.texto, ancora })
  }
  return { titulos, paragrafos: blocos.filter((b) => b.tag === 'p').length }
}

export async function baixarHtml(id, { tentativas = 3 } = {}) {
  let ultimo
  for (let t = 0; t < tentativas; t++) {
    try {
      const r = await fetch(urlHtml(id), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(90_000) })
      if (r.status === 404) return null
      if (!r.ok) throw new Error('HTML devolveu ' + r.status)
      return await r.text()
    } catch (e) { ultimo = e; await new Promise((ok) => setTimeout(ok, 3000 * (t + 1))) }
  }
  throw ultimo
}

/**
 * Onde cada título começa numa lista de parágrafos (os do .txt).
 *
 * Cada âncora é procurada DEPOIS da anterior — o livro anda para a frente —,
 * então um parágrafo igual que se repete mais adiante não confunde. Título
 * cuja âncora não se acha fica de fora (e é contado): melhor um capítulo a
 * menos que um corte no lugar errado.
 *
 * @returns {{ cortes: Array<{indice:number, nivel:number, texto:string}>, perdidos:number }}
 */
export function localizar(esboco, paragrafos) {
  const chaves = paragrafos.map((p) => chaveDeTrecho(p))
  const cortes = []
  let perdidos = 0
  let de = 0
  // títulos sem âncora própria (um "PARTE I" logo seguido de "CAPÍTULO I")
  // ficam guardados e entram como prefixo do próximo que tiver
  let pendentes = []
  for (const t of esboco.titulos) {
    if (!t.ancora) { pendentes.push(t); continue }
    const alvo = chaveDeTrecho(t.ancora, 40)
    let achou = -1
    for (let i = de; i < chaves.length; i++) {
      if (chaves[i].startsWith(alvo) || (alvo.length >= 30 && chaves[i].includes(alvo.slice(0, 30)))) { achou = i; break }
    }
    if (achou < 0) { perdidos++; pendentes = []; continue }
    cortes.push({ indice: achou, nivel: t.nivel, texto: t.texto, acima: pendentes.map((p) => p.texto) })
    pendentes = []
    de = achou + 1
  }
  return { cortes, perdidos }
}
