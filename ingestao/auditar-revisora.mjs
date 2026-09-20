// A auditoria da revisora: o que ela ESCREVEU, e não quantas vezes escreveu.
//
//   node ingestao/auditar-revisora.mjs --banco /dados/catalogo.db
//   node ingestao/auditar-revisora.mjs --banco /dados/catalogo.db --regra queer
//   node ingestao/auditar-revisora.mjs --banco /dados/catalogo.db --tipo capitulo-perdido
//
// Os números do painel dizem que ela trabalhou; não dizem se ela acertou. Como
// o diário guarda o capítulo INTEIRO antes e depois de cada troca, dá para
// reconstituir cada palavra trocada NA FRASE em que ela estava — que é a única
// forma de alguém olhar e dizer "isso está certo" ou "isso está errado".
//
// O que cada seção procura:
//
//   POR REGRA — toda aplicação de cada entrada do glossário, com a frase. É
//   aqui que aparece a troca certa no lugar errado: "queer" é "estranho" num
//   romance de 1890 e é outra coisa num texto de hoje; "gays" é "vistosas" em
//   Dickens e não é em lugar nenhum depois de 1970.
//
//   CAPÍTULO PERDIDO — as retraduções grandes, com o começo do antes e do
//   depois lado a lado. Se o alemão virou português legível, vê-se em duas
//   linhas; se virou sopa, também.
//
//   O QUE SOBROU — palavras do glossário que AINDA estão no acervo depois de
//   ela passar. Sobrar é sinal de que uma trava barrou (bom) ou de que a regra
//   não casou (a investigar).

import { DatabaseSync } from 'node:sqlite'

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: true })
const soRegra = arg('--regra', null)
// 'aplicada' é o normal; 'proposta' serve para auditar ANTES de deixar
// aplicar, que é a ordem certa desde que a primeira rodada precisou ser
// desfeita inteira.
const ESTADO = arg('--estado', 'aplicada')
const DESDE = arg('--desde', null)
const soTipo = arg('--tipo', null)
const QUANTAS = Number(arg('--quantas', 4))

const semTags = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#[0-9]+;/g, ' ').replace(/[ ]+/g, ' ').trim()

/**
 * Onde dois textos diferem, em palavras — e a frase de cada diferença.
 *
 * Não é um diff geral: é uma varredura em paralelo que para na primeira
 * palavra diferente, registra a vizinhança dos dois lados e continua. Serve
 * porque as trocas do glossário são palavra por palavra e não deslocam o
 * texto; quando deslocam (retradução), a função desiste e devolve o que
 * achou até ali, que é o comportamento certo — o relatório do capítulo
 * perdido mostra o antes e o depois inteiros, não a diferença.
 */
function diferencas(antes, depois, teto = 12) {
  const a = semTags(antes).split(' ')
  const d = semTags(depois).split(' ')
  const saida = []
  // Quando uma troca junta duas palavras numa ("dois centos" → "duzentos") ou
  // parte uma em duas, tudo depois dela anda um lugar, e a comparação em
  // paralelo passa a acusar diferença em cada palavra até o fim do capítulo.
  // A primeira auditoria imprimiu uma cascata assim — "centos → de", "de →
  // homens", "homens → à" — que parecia catorze estragos e era UM, seguido do
  // texto inteiro deslocado. Contagem de palavras diferente já diz que houve
  // deslocamento: nesse caso, reporta-se a primeira diferença e para.
  const deslocou = a.length !== d.length
  for (let i = 0; i < Math.min(a.length, d.length) && saida.length < teto; i++) {
    if (a[i] === d[i]) continue
    saida.push({
      de: a[i], para: d[i],
      frase: a.slice(Math.max(0, i - 9), i).join(' ') + ' 〈' + a[i] + ' → ' + d[i] + '〉 ' + d.slice(i + 1, i + 10).join(' '),
    })
    if (deslocou) break
  }
  return saida
}

const trocas = banco.prepare(`SELECT t.id, t.texto_id, t.tipo, t.regra, t.antes, t.depois, t.estado,
    coalesce(o.titulo_pt, o.titulo) titulo, o.idioma_original
  FROM revisao_troca t JOIN texto x ON x.id = t.texto_id JOIN obra o ON o.id = x.obra_id
  WHERE t.estado = ?` + (DESDE ? ' AND t.id > ' + Number(DESDE) : '') + ' ORDER BY t.id').all(ESTADO)

console.log('=== ' + trocas.length + ' trocas (' + ESTADO + '), auditadas uma a uma ===')
console.log('')

// ── 1. por regra do glossário ──
const porRegra = new Map()
let comDeslocamento = 0
for (const t of trocas) {
  if (t.tipo !== 'glossario') continue
  const difs = diferencas(t.antes, t.depois)
  if (!difs.length) { comDeslocamento++; continue }
  for (const d of difs) {
    const chave = d.de.toLowerCase().replace(/[^a-zà-ÿ]/g, '') + ' → ' + d.para.toLowerCase().replace(/[^a-zà-ÿ]/g, '')
    if (!porRegra.has(chave)) porRegra.set(chave, [])
    porRegra.get(chave).push({ titulo: t.titulo, idioma: t.idioma_original, frase: d.frase })
  }
}

console.log('── O GLOSSÁRIO, REGRA POR REGRA ──')
console.log('(cada uma com até ' + QUANTAS + ' frases de verdade, para conferir com o olho)')
console.log('')
for (const [chave, usos] of [...porRegra.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (soRegra && !chave.includes(soRegra)) continue
  const idiomas = [...new Set(usos.map((u) => u.idioma))].join(',')
  console.log('  ' + chave + '   (' + usos.length + 'x, de ' + idiomas + ')')
  for (const u of usos.slice(0, QUANTAS)) {
    console.log('      ' + u.titulo.slice(0, 28).padEnd(30) + u.frase.slice(0, 150))
  }
  console.log('')
}

// ── 2. capítulos perdidos ──
console.log('── CAPÍTULOS QUE ESTAVAM NA LÍNGUA DE ORIGEM ──')
console.log('')
for (const t of trocas) {
  if (t.tipo !== 'capitulo-perdido') continue
  if (soTipo && soTipo !== t.tipo) continue
  console.log('  ' + t.titulo + ' (' + t.idioma_original + ')')
  console.log('    ANTES : ' + semTags(t.antes).slice(0, 260))
  console.log('    DEPOIS: ' + semTags(t.depois).slice(0, 260))
  console.log('')
}

// ── 3. retraduções de trecho ──
console.log('── TRECHOS RETRADUZIDOS ──')
console.log('')
let n = 0
for (const t of trocas) {
  if (t.tipo !== 'retraducao') continue
  if (n++ >= 8) break
  const difs = diferencas(t.antes, t.depois, 1)
  console.log('  ' + t.titulo.slice(0, 34).padEnd(36) + '(' + t.regra + ')')
  if (difs.length) console.log('    ' + difs[0].frase.slice(0, 220))
  console.log('')
}

console.log('── RESUMO ──')
console.log('  trocas de glossário sem diferença palavra-a-palavra (deslocaram o texto): ' + comDeslocamento)
console.log('  regras distintas aplicadas: ' + porRegra.size)
console.log('  capítulos perdidos reescritos: ' + trocas.filter((t) => t.tipo === 'capitulo-perdido').length)
console.log('  trechos retraduzidos: ' + trocas.filter((t) => t.tipo === 'retraducao').length)
