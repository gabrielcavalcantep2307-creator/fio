// A LISTA DOS ERROS DE SCAN (06/10/2026).
//
// 989 livros vieram de foto de página (archive.org), 58 milhões de palavras,
// e a máquina que leu as fotos troca letra: "tipha" (tinha), "cbamado"
// (chamado), "quo" (que), "rommercio" (commercio). O dono: "pegar todo um
// acervo de palavras que são as erradas e já saber o que trocar". É isso, e o
// mesmo método da grafia (ingestao/ortografia.mjs): nada é palpite.
//
//   1. exportar  — cada palavra dos escaneados que NUNCA aparece nos 3.500
//                  livros digitados do acervo (Gutenberg, Wikisource, leis);
//   2. propor    — para cada uma, as palavras dos livros digitados a uma ou
//                  duas trocas de distância, pesando as trocas que a leitura
//                  de scan faz de verdade (rn/m, li/h, cl/d, ii/u, c/e, f/s
//                  longo, n/u...); fica a mais usada nos livros digitados,
//                  só quando ganha com folga;
//   3. eu leio a lista; o que vale vai para servidor/ocr-correcoes.json, e a
//      troca acontece NA ENTREGA, só nos escaneados (servidor/diagramar.mjs).
//
//   node ingestao/ocr-lista.mjs exportar [pasta]
//   node ingestao/ocr-lista.mjs propor   [pasta]

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [modo = 'exportar', pasta = '/dados/ocr'] = process.argv.slice(2)
mkdirSync(pasta, { recursive: true })
const arq = (n) => join(pasta, n)
const PAL = /[a-zà-öø-ÿ]+(?:['’-][a-zà-öø-ÿ]+)*/g
const limpo = (h) => h.replace(/<\/?(p|div|br|h[1-6]|li|blockquote|tr|td)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ')

if (modo === 'exportar') {
  const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
  const caps = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?')
  const contar = (fontes) => {
    const v = new Map()
    for (const t of banco.prepare(`SELECT id FROM texto WHERE dono_id IS NULL AND idioma = 'pt' AND fonte IN (${fontes.map(() => '?').join(',')})`).all(...fontes)) {
      const neste = new Set()
      for (const c of caps.iterate(t.id)) for (const m of limpo(c.corpo).matchAll(PAL)) {
        const w = m[0]
        if (w.length > 25) continue
        let x = v.get(w)
        // chave copiada: a fatia prenderia o capítulo inteiro na memória
        if (!x) { x = [0, 0]; v.set(JSON.parse(JSON.stringify(w)), x) }
        x[0]++
        if (!neste.has(w)) { neste.add(w); x[1]++ }
      }
    }
    return v
  }
  const digitado = contar(['gutenberg', 'wikisource', 'planalto', 'standard_ebooks', 'fio_traducao'])
  writeFileSync(arq('digitado.tsv'), [...digitado].filter(([, x]) => x[0] >= 2).map(([w, x]) => `${w}\t${x[0]}\t${x[1]}`).join('\n') + '\n')
  const scan = contar(['archive'])
  const so = [...scan].filter(([w, x]) => x[0] >= 3 && !digitado.has(w)).sort((a, b) => b[1][0] - a[1][0])
  writeFileSync(arq('so-no-scan.tsv'), so.map(([w, x]) => `${w}\t${x[0]}\t${x[1]}`).join('\n') + '\n')
  console.log(`digitado: ${digitado.size} palavras; só nos escaneados (3+ vezes): ${so.length}, ${so.reduce((s, [, x]) => s + x[0], 0)} ocorrências`)
}

// As trocas que a leitura de scan faz, com o custo de cada uma (1 = típica).
const TROCAS = [
  ['rn', 'm', 1], ['m', 'rn', 1], ['li', 'h', 1], ['h', 'li', 1], ['cl', 'd', 1], ['d', 'cl', 1], ['ii', 'u', 1], ['u', 'ii', 1],
  ['in', 'm', 1], ['ni', 'm', 1], ['ri', 'n', 1], ['n', 'ri', 1], ['iu', 'm', 1], ['vv', 'w', 1], ['tl', 'd', 1], ['fi', 'h', 1],
  ['c', 'e', 1], ['e', 'c', 1], ['o', 'e', 1], ['e', 'o', 1], ['a', 'o', 1], ['o', 'a', 1], ['n', 'u', 1], ['u', 'n', 1],
  ['i', 'l', 1], ['l', 'i', 1], ['t', 'l', 1], ['l', 't', 1], ['i', 't', 1], ['t', 'i', 1], ['f', 's', 1], ['f', 't', 1], ['t', 'f', 1],
  ['h', 'b', 1], ['b', 'h', 1], ['p', 'n', 1], ['n', 'p', 1], ['c', 'o', 1], ['ç', 'c', 1], ['c', 'ç', 1], ['s', 'a', 1], ['a', 's', 1],
  ['é', 'e', 1], ['e', 'é', 1], ['á', 'a', 1], ['a', 'á', 1], ['ó', 'o', 1], ['o', 'ó', 1], ['í', 'i', 1], ['i', 'í', 1], ['ú', 'u', 1],
  ['ã', 'a', 1], ['a', 'ã', 1], ['õ', 'o', 1], ['ê', 'e', 1], ['e', 'ê', 1], ['â', 'a', 1], ['ô', 'o', 1], ['y', 'v', 1], ['v', 'y', 1],
]
const LETRAS = 'abcdefghijklmnopqrstuvwxyzàáâãçéêíóôõú'

function vizinhos(w) {
  const r = new Map() // candidato -> menor custo
  const poe = (c, custo) => { if (c && c !== w && (r.get(c) ?? 9) > custo) r.set(c, custo) }
  for (const [de, para, custo] of TROCAS) {
    let i = w.indexOf(de)
    while (i >= 0) { poe(w.slice(0, i) + para + w.slice(i + de.length), custo); i = w.indexOf(de, i + 1) }
  }
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) poe(w.slice(0, i) + w.slice(i + 1), 2)                       // letra a mais (sujeira)
    for (const l of LETRAS) {
      if (i < w.length) poe(w.slice(0, i) + l + w.slice(i + 1), 2.5)               // letra trocada qualquer
      poe(w.slice(0, i) + l + w.slice(i), 2.5)                                     // letra que sumiu
    }
  }
  return r
}

// ── segundo lote (06/10): CLASSES lidas nas dúvidas, cada uma com regra fechada ──
//   A. hífen de fim de linha que ficou no meio da palavra: "co-mo", "pro-víncia"
//      (nunca quando a segunda parte é pronome: "dar-te", "ei-lo");
//   B. o til lido como acento: "naó", "sáo", "entáo", "tinhâo" -> "-ão";
//   C. o s longo lido como "í": "íua" (sua), "eíta" (esta), e o "ſt" lido
//      "íl": "deíle" (deste), "poílo" (posto);
//   D. o "que" e o "qual" lidos torto ("jue", "qtie", "qne", "qaal", "porqae").
// A forma nova tem de existir em 5+ livros digitados; entre duas, a mais usada.
const CLITICOS = new Set('me te se nos vos lhe lhes o a os as lo la los las no na nas ia'.split(' '))
const MAO = { jue: 'que', qtie: 'que', cjue: 'que', qut: 'que', qus: 'que', qup: 'que', qud: 'que', qpe: 'que', qqe: 'que', qye: 'que', qaal: 'qual', qaem: 'quem', porqae: 'porque', qaaes: 'quaes', qoaes: 'quaes', aílim: 'assim', aífim: 'assim', aflim: 'assim', aílm: 'assim', doeste: 'deste', doesta: 'desta', doestes: 'destes', doestas: 'destas',
  // curtas, lidas à mão nas dúvidas (o s longo e o til, nas palavras que mais aparecem)
  'íua': 'sua', 'íuas': 'suas', 'íeu': 'seu', 'íeus': 'seus', 'íem': 'sem', 'íoi': 'foi', 'íe': 'se', 'faó': 'são', 'faô': 'são', 'fáo': 'são', 'taó': 'tão', 'taô': 'tão', 'táo': 'tão', 'naó': 'não', 'naô': 'não', 'náo': 'não',
  'co-mo': 'como', 'mui-to': 'muito', 'mes-mo': 'mesmo', 'me-nos': 'menos', 'an-nos': 'annos', 'hu-ma': 'huma', 'es-ta': 'esta', 'es-te': 'este', 'eíta': 'esta', 'eíte': 'este', 'eílá': 'está', 'eíle': 'este', 'eíles': 'estes' }
if (modo === 'regras') {
  const dig = new Map(readFileSync(arq('digitado.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => { const [w, n, lv] = l.split('\t'); return [w, [Number(n), Number(lv)]] }))
  const ja = JSON.parse(readFileSync(arq('correcoes.json'), 'utf8'))
  const vale = (c) => (dig.get(c)?.[1] ?? 0) >= 5
  const uso = (c) => dig.get(c)?.[0] ?? 0
  const novos = {}, porClasse = { A: 0, B: 0, C: 0, D: 0 }
  for (const l of readFileSync(arq('so-no-scan.tsv'), 'utf8').split('\n').filter(Boolean)) {
    const [w] = l.split('\t')
    if (ja[w] || w.length < 3) continue
    if (MAO[w]) { novos[w] = MAO[w]; porClasse.D++; continue }
    // A
    const h = w.match(/^([a-zà-ÿ]+)-([a-zà-ÿ]+)$/)
    if (h && h[1].length >= 2 && h[2].length >= 2 && (h[1] + h[2]).length >= 5 && !CLITICOS.has(h[2]) && vale(h[1] + h[2]) && !vale(w)) { novos[w] = h[1] + h[2]; porClasse.A++; continue }
    // B
    const b = w.replace(/(?:[aáâ][oóô]|aõ)$/, 'ão')
    if (b !== w && vale(b)) { novos[w] = b; porClasse.B++; continue }
    // C
    // (o s longo nunca fecha palavra: "andaí", "temí" são outra coisa)
    if (w.includes('í') && !w.endsWith('í') && w.length >= 5) {
      const cands = new Set()
      // "íl" é o ſt ou o ſſ: "poílo" (posto), "paílou" (passou); vence a mais usada
      const st = w.replace(/íl/g, 'st'), ss = w.replace(/íl/g, 'ss')
      for (const base of new Set([w, st, ss])) {
        cands.add(base.replace(/í/g, 's'))
        if (base.startsWith('í')) cands.add('f' + base.slice(1).replace(/í/g, 's'))
      }
      const melhor = [...cands].filter(vale).sort((x, y) => uso(y) - uso(x))[0]
      if (melhor && melhor !== w) { novos[w] = melhor; porClasse.C++ }
    }
  }
  writeFileSync(arq('regras.json'), JSON.stringify(novos))
  console.log(porClasse, Object.keys(novos).length)
  const e = Object.entries(novos)
  let s = 5; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [e[i], e[j]] = [e[j], e[i]] }
  console.log(e.slice(0, 260).map(([a, b]) => a + '>' + b).join(' '))
}

if (modo === 'propor') {
  const dig = new Map(readFileSync(arq('digitado.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => { const [w, n, lv] = l.split('\t'); return [w, [Number(n), Number(lv)]] }))
  const linhas = readFileSync(arq('so-no-scan.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
  const certas = [], duvidas = []
  for (const [w, n, livros] of linhas) {
    if (w.length < 3) continue
    const nota = []
    for (const [c, custo] of vizinhos(w)) {
      const u = dig.get(c)
      // a palavra certa tem de ser de verdade: em 3+ livros digitados
      if (!u || u[1] < 3) continue
      nota.push([c, Math.log(u[0] + 1) - 2.5 * custo, custo, u[0]])
    }
    // duas trocas típicas (ex.: "rommercio" -> "commercio" é uma; "cbamado" é uma)
    if (!nota.length) continue
    nota.sort((a, b) => b[1] - a[1])
    const [a, b] = nota
    const folga = b ? a[1] - b[1] : 99
    const linha = [w, a[0], n, livros, a[2], a[3], nota.slice(0, 3).map((x) => `${x[0]}:${x[3]}`).join(' ')]
    ;(folga >= 2 && a[2] <= 1 ? certas : duvidas).push(linha)
  }
  const ord = (x, y) => Number(y[2]) - Number(x[2])
  certas.sort(ord); duvidas.sort(ord)
  writeFileSync(arq('proposta.tsv'), certas.map((r) => r.join('\t')).join('\n') + '\n')
  writeFileSync(arq('duvidas.tsv'), duvidas.map((r) => r.join('\t')).join('\n') + '\n')
  const soma = (l) => l.reduce((s, r) => s + Number(r[2]), 0)
  console.log(`claras (uma troca típica, com folga): ${certas.length} palavras, ${soma(certas)} ocorrências · dúvidas: ${duvidas.length}, ${soma(duvidas)}`)
}
