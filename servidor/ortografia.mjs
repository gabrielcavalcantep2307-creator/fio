// A ortografia de hoje, na entrega (05/10/2026).
//
// Dois mil livros do acervo estão na grafia de antes de 1943 ("elle",
// "annos", "pharmacia", "á casa"), e para quem lê hoje isso parece erro em
// toda página. As edições modernas atualizam a grafia; nós também — mas só
// com a lista LIDA palavra por palavra (servidor/ortografia-atualizada.json,
// gerada por ingestao/ortografia.mjs e conferida à mão; as decisões estão em
// infra/conserto-0510/ortografia-decisoes.json).
//
// O que NÃO faz, de propósito:
//   - não mexe no banco: a busca e o texto de origem ficam como vieram, e
//     desfazer uma troca é tirar a palavra da lista;
//   - não troca palavra com maiúscula no meio da frase: "Mattos", "Bella",
//     "Christiano" são nomes de gente e ficam como o autor escreveu;
//   - não toca em texto que já é moderno (tradução nossa, lei, texto de
//     leitor) — só nas fontes de domínio público em português.

import { readFileSync, statSync } from 'node:fs'
import { hash1, hash2 } from './bigramas.mjs'

export const FONTES_ANTIGAS = new Set(['gutenberg', 'wikisource', 'archive', 'standard_ebooks'])

let mapa = null
let nomes = new Set()
function lista() {
  if (!mapa) {
    try {
      const j = JSON.parse(readFileSync(new URL('./ortografia-atualizada.json', import.meta.url), 'utf8'))
      mapa = new Map(Object.entries(j.trocas))
      // também usadas como nome no acervo ("o Mattos", "a Villa Rica"):
      // com maiúscula ficam como o autor escreveu
      nomes = new Set(j.nomes ?? [])
    } catch { mapa = new Map() }
  }
  return mapa
}

const PALAVRA = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g
const FIM_DE_FRASE = '.!?…:—–'
const SO_MINUSCULA = /^[a-zß-öø-ÿ'’-]+$/
const PRIMEIRA_MAIUSCULA = /^[A-ZÀ-ÖØ-Þ][a-zß-öø-ÿ'’-]*$/

// ── os erros de leitura dos escaneados (06/10/2026) ──
// servidor/ocr-correcoes.json, gerada por ingestao/ocr-lista.mjs e lida
// (decisões em infra/conserto-0610/): "efta" -> "esta", "cbamado" ->
// "chamado". Vale SÓ no texto escaneado, e ANTES da grafia: "eftas" vira
// "estas", e "aquclle" vira "aquelle", que a grafia faz "aquele".
let ocr = null
function listaOcr() {
  if (!ocr) {
    try { ocr = new Map(Object.entries(JSON.parse(readFileSync(new URL('./ocr-correcoes.json', import.meta.url), 'utf8')))) }
    catch { ocr = new Map() }
  }
  return ocr
}

// ── as listas AUTOMÁTICAS (08/10/2026) ──
// A modernizadora (servidor/modernizador.mjs, serviço da VPS) escreve duas
// listas em /dados/mapas: grafia-auto.json (palavras velhas que só aparecem
// em livros antigos e têm uma forma de hoje bem usada) e ocr-auto.json (erros
// de scan de classe conhecida). Valem DEPOIS das listas lidas, que ganham em
// qualquer conflito, e a de grafia só troca palavra toda em minúscula: nome
// de gente com maiúscula nunca é tocado. O arquivo é relido quando muda.
const MAPAS = process.env.FIO_MAPAS || '/dados/mapas'
const auto = { grafia: new Map(), ocr: new Map(), mtime: {}, conferido: 0 }
function lerAuto() {
  if (Date.now() - auto.conferido < 60_000) return auto
  auto.conferido = Date.now()
  for (const [chave, arq] of [['grafia', 'grafia-auto.json'], ['ocr', 'ocr-auto.json']]) {
    try {
      const m = statSync(`${MAPAS}/${arq}`).mtimeMs
      if (m === auto.mtime[chave]) continue
      auto[chave] = new Map(Object.entries(JSON.parse(readFileSync(`${MAPAS}/${arq}`, 'utf8'))))
      auto.mtime[chave] = m
    } catch { if (auto.mtime[chave]) { auto[chave] = new Map(); auto.mtime[chave] = 0 } }
  }
  return auto
}

// ── o contexto do scan (08/10/2026) ──
// Palavra de scan com duas ou três candidatas ("nfto": neto? noto?) é decidida
// pelos vizinhos, como o corretor do celular: a tabela de pares de palavras
// (bigramas.bin) vem de livros digitados da mesma época (ingestao/ocr-contexto.mjs).
// Sem evidência de vizinhança, ou com duas candidatas empatadas, não troca nada.
const ctx = { bi: null, uni: null, cand: null, mtime: 0, conferido: 0 }
function lerCtx() {
  if (Date.now() - ctx.conferido < 60_000) return ctx
  ctx.conferido = Date.now()
  try {
    const m = statSync(`${MAPAS}/cand.json`).mtimeMs
    if (m === ctx.mtime) return ctx
    const cru = (f) => { const b = readFileSync(`${MAPAS}/${f}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
    ctx.bi = new Uint16Array(cru('bigramas.bin'))
    ctx.uni = new Uint32Array(cru('unigramas.bin'))
    ctx.cand = JSON.parse(readFileSync(`${MAPAS}/cand.json`, 'utf8'))
    ctx.mtime = m
  } catch { /* ainda não existe: sem contexto */ }
  return ctx
}

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    anterior = atual
  }
  return anterior[b.length]
}

/** Entre as candidatas de `w`, a que mais combina com a palavra de antes e a de depois; ou null. */
export function escolherPorContexto(w, anterior, seguinte, c = lerCtx()) {
  const cs = c.cand?.[w]
  if (!cs || !c.bi || w.length < 4 || w.includes('-')) return null
  const mascara = c.uni.length - 1
  // só candidata de verdade: a até 2 letras da lida, bem usada nos digitados, e que
  // não seja a mesma palavra no plural/singular ("odiosidades" é palavra, só rara)
  const boas = cs.filter((x) => !x.includes('-') && c.uni[hash1(x) & mascara] >= 150 && distancia(w, x) <= 2 && !(x + 's' === w || w + 's' === x))
  const pontos = boas.map((x) => {
    const b1 = anterior ? c.bi[hash2(anterior, x)] : 0
    const b2 = seguinte ? c.bi[hash2(x, seguinte)] : 0
    return { x, b1, b2, ev: b1 + b2, s: Math.log1p(b1) + Math.log1p(b2) + 0.25 * Math.log1p(c.uni[hash1(x) & mascara]) }
  }).sort((a, b) => b.s - a.s)
  const [a, b] = pontos
  // os DOIS vizinhos têm de concordar, ou um deles concordar muito
  if (!a || !((a.b1 >= 3 && a.b2 >= 3) || Math.max(a.b1, a.b2) >= 25)) return null
  if (b && a.s - b.s < 2) return null
  return a.x
}

/** Uma troca: devolve a palavra nova com a caixa certa, ou null. */
function trocar(palavra, comecoDeFrase, seguinte, comOcr = false, vizinhas = null) {
  const original = palavra.toLowerCase().replace(/’/g, "'")
  let chave = original
  let lida = comOcr ? (listaOcr().get(chave) ?? lerAuto().ocr.get(chave) ?? null) : null
  // sem troca fixa: os vizinhos decidem entre as candidatas, só em minúscula
  if (comOcr && !lida && vizinhas && SO_MINUSCULA.test(palavra) && !lista().has(chave) && !lerAuto().grafia.has(chave)) lida = escolherPorContexto(chave, vizinhas[0], vizinhas[1])
  if (lida) chave = lida
  // "ha muito tempo" -> "há"; "Ha! ha!" e "ha, ha" são riso e ficam
  if (chave === 'ha') {
    if (!/^ [a-zà-ÿ]/.test(seguinte)) return null
    return palavra === 'ha' ? 'há' : comecoDeFrase && palavra === 'Ha' ? 'Há' : null
  }
  // a lista automática só pega palavra toda em minúscula
  const nova = lista().get(chave) ?? (SO_MINUSCULA.test(palavra) ? lerAuto().grafia.get(chave) : null) ?? (lida ? chave : null)
  if (!nova) return null
  if (SO_MINUSCULA.test(palavra)) return nova
  if (comecoDeFrase && !nomes.has(original) && PRIMEIRA_MAIUSCULA.test(palavra)) return nova[0].toUpperCase() + nova.slice(1)
  return null
}

/** Atualiza a grafia de um trecho de HTML, sem tocar nas etiquetas. `ocr`: também os erros de scan. */
export function atualizarGrafia(html, { ocr: comOcr = false } = {}) {
  if (!html || !lista().size) return html
  let anterior = '.' // começo do bloco conta como começo de frase
  return html.split(/(<[^>]+>)/).map((parte) => {
    if (parte.startsWith('<')) return parte
    const nova = parte.replace(PALAVRA, (p, i, s) => {
      let j = i - 1
      while (j >= 0 && ' "“”«»\'‘’( '.includes(s[j])) j--
      const antes = j >= 0 ? s[j] : anterior
      // as palavras vizinhas dentro do mesmo trecho (já com a troca fixa de scan), para o contexto
      let viz = null
      // lixo colado na palavra ("forf;a", "c&mpos", "^") quer dizer que o scan quebrou ali: não adivinha
      if (comOcr && !/[&;^~*|\\\d]/.test(s[i - 1] ?? '') && !/[&;^~*|\\\d]/.test(s[i + p.length] ?? '')) {
        const a = s.slice(Math.max(0, i - 40), i).match(/([a-zà-ÿ]+)[^a-zà-ÿ]*$/i)?.[1]?.toLowerCase()
        const d = s.slice(i + p.length, i + p.length + 40).match(/^[^a-zà-ÿ]*([a-zà-ÿ]+)/i)?.[1]?.toLowerCase()
        const fixa = (x) => (x ? listaOcr().get(x) ?? x : null)
        viz = [fixa(a), fixa(d)]
      }
      return trocar(p, FIM_DE_FRASE.includes(antes), s.slice(i + p.length, i + p.length + 2), comOcr, viz) ?? p
    })
    const t = parte.replace(/[\s"“”«»'‘’(]+$/, '')
    if (t) anterior = t.at(-1)
    return nova
  }).join('')
}
