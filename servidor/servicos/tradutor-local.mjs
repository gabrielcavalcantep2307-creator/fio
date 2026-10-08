// O tradutor local, do lado da esteira (06/10/2026).
//
// O serviço (infra/tradutor/servidor.py, Opus-MT dentro da VPS) devolve as
// QUATRO melhores traduções de cada frase. Quem escolhe é este arquivo, com as
// mesmas travas de sempre (revisao.traducaoConfiavel) e duas novas, pagas no
// teste de 06/10 com O Morro dos Ventos Uivantes:
//
//   - palavra que ficou em inglês ("hale", "sinewy", "charitably"): o serviço
//     já diz quais; preferimos a alternativa que traduziu tudo;
//   - frase longa CORTADA no fim (95 palavras viraram 70, sumiu "or complete
//     departure, and I had no desire…"): frase com mais de 30 palavras vai em
//     orações (; : —), que o modelo não encurta.
//
// Se nenhuma das quatro passa, a frase vai ao motor antigo (MinT) e passa pelas
// mesmas travas; se nem assim, fica no original — visível, e não inventada.
// Cada decisão é contada, e a frase duvidosa vai para a lista de revisão.

import { traducaoConfiavel } from '../revisao.mjs'

const SERVICO = process.env.FIO_TRADUTOR || 'http://tradutor:8095'

let saude = { em: 0, de: [] }
/** O serviço está de pé e traduz desta língua? (guardado por um minuto) */
export async function localDisponivel(de) {
  if (Date.now() - saude.em > 60_000) {
    try {
      const r = await fetch(`${SERVICO}/saude`, { signal: AbortSignal.timeout(5_000) })
      saude = { em: Date.now(), de: r.ok ? (await r.json()).de ?? [] : [] }
    } catch { saude = { em: Date.now(), de: [] } }
  }
  return saude.de.includes(de)
}

/** As n melhores traduções de cada frase: [[{t, restos}], ...]. */
export async function hipoteses(frases, de = 'en', n = 4) {
  // o serviço aceita 64 frases por pedido; o parágrafo-muro de 1.912 palavras
  // (História de Florença, cap. 46) passava disso e ficava INTEIRO em inglês
  if (frases.length > 48) {
    const saida = []
    for (let i = 0; i < frases.length; i += 48) saida.push(...await hipoteses(frases.slice(i, i + 48), de, n))
    return saida
  }
  const r = await fetch(`${SERVICO}/traduzir`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ de, frases: de === 'en' ? frases.map(simplificarIngles) : frases, n }),
    // a fila do serviço é uma só (um modelo de cada vez): com a esteira e a
    // retradução pedindo juntas, uma resposta pode esperar a vez
    signal: AbortSignal.timeout(300_000),
  })
  if (!r.ok) throw new Error(`tradutor local devolveu ${r.status}`)
  const { saida } = await r.json()
  if (!Array.isArray(saida) || saida.length !== frases.length) throw new Error('tradutor local devolveu resposta fora do formato')
  return saida
}

// ─────────────────────────────────────────────────────────────
// Frases. O corte antigo partia em "Mr. Heathcliff" — o ponto do título
// parecia fim de frase, e o modelo recebia "Mr." sozinho e repetia
// ("Sr. Sr. Sr."). Agora o título fica grudado no nome.
// ─────────────────────────────────────────────────────────────
const TITULOS = /\b(Mr|Mrs|Ms|Dr|St|Messrs|Mme|Mlle|Prof|Rev|Hon|Capt|Col|Gen|Lt|Sgt|Mt|Jr|Sr|No|Esq|vs|viz|cf|ca)\.(?=\s)/g
const MARCA = '\u0001'
const FIM = /(?<=[.!?…»"”])\s+(?=[A-ZÀ-ÞÀ-Ý"«“¿¡—–-])/u

export function emFrases(texto) {
  return String(texto).replace(TITULOS, '$1' + MARCA).split(FIM)
    .map((f) => f.split(MARCA).join('.')).filter((f) => f.trim())
}

/** Frase com mais de 30 palavras vai em orações (; : —), onde o modelo não corta. */
export function emOracoes(frase) {
  if (frase.split(/\s+/).length <= 30) return [frase]
  // "--" é o travessão dos livros do Gutenberg ("Proceedings of the plebeians--The demand…")
  const partes = frase.split(/(?<=[;:])\s+|\s+(?=[—–]\s)|(?<=\S)--(?=\S)/).filter((p) => p.trim())
  return partes.length > 1 ? partes : [frase]
}

// ─────────────────────────────────────────────────────────────
// Expressões que o modelo erra SEMPRE do mesmo jeito, trocadas no INGLÊS por
// uma equivalente que ele acerta (06/10/2026). Garimpadas nas 700 expressões
// que se repetem em 20+ dos 220 originais (infra/conserto-0610/expressoes.tsv)
// e lidas: quase todas ele já acerta ("de vez em quando", "cara a cara").
// Só entra aqui o que foi visto errado E cuja troca não muda o sentido.
// ─────────────────────────────────────────────────────────────
const PARAFRASES = [
  [/\b([Aa]) (good|great) deal\b/g, '$1 lot'],           // "um bom negócio envergonhado"
  [/\bI dare ?say\b/g, 'I suppose'],                     // "eu ouso dizer"
  [/\bhackney[- ]coach(es)?\b/gi, 'cab$1'],              // "treinadores de Hackney"
  [/\bhackney[- ]coachm[ae]n\b/gi, 'cab drivers'],
]
export function simplificarIngles(frase) {
  let s = frase
  for (const [re, por] of PARAFRASES) s = s.replace(re, por)
  return s
}

/**
 * Escolhe entre as alternativas do modelo. A primeira que passa em TODAS as
 * travas ganha; a ordem é a do próprio modelo (a mais provável primeiro).
 * @returns {{ texto: string|null, usada: number, motivo: string|null, restos: string[] }}
 */
export function escolherHipotese(origem, alternativas, de = 'en') {
  let melhorComResto = null
  let ultimoMotivo = 'sem alternativa'
  for (let i = 0; i < alternativas.length; i++) {
    const { t, restos = [] } = alternativas[i]
    // "⁇" é letra que o modelo não tem e o serviço não soube repor
    if (t.includes('⁇')) { ultimoMotivo = 'letra desconhecida (⁇)'; continue }
    const c = traducaoConfiavel(origem, t, de)
    if (!c.pode) { ultimoMotivo = c.motivo; continue }
    if (!restos.length) return { texto: t, usada: i, motivo: null, restos: [] }
    if (!melhorComResto || restos.length < melhorComResto.restos.length) melhorComResto = { texto: t, usada: i, motivo: 'ficou em inglês: ' + restos.join(', '), restos }
  }
  // todas passaram nas travas, mas todas deixaram alguma palavra em inglês:
  // a com menos fica, MARCADA para a revisão (o motor antigo é pior nisso)
  return melhorComResto ?? { texto: null, usada: -1, motivo: ultimoMotivo, restos: [] }
}
