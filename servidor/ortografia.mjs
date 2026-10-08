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

/** Uma troca: devolve a palavra nova com a caixa certa, ou null. */
function trocar(palavra, comecoDeFrase, seguinte, comOcr = false) {
  const original = palavra.toLowerCase().replace(/’/g, "'")
  let chave = original
  const lida = comOcr ? (listaOcr().get(chave) ?? lerAuto().ocr.get(chave) ?? null) : null
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
      return trocar(p, FIM_DE_FRASE.includes(antes), s.slice(i + p.length, i + p.length + 2), comOcr) ?? p
    })
    const t = parte.replace(/[\s"“”«»'‘’(]+$/, '')
    if (t) anterior = t.at(-1)
    return nova
  }).join('')
}
