// A ORTOGRAFIA ANTIGA (05/10/2026).
//
// O dono: "em todos os livros eu não passei um capítulo sem uma palavra
// errada". Medido: 479 dos 644 livros do Gutenberg, 557 do Wikisource e 935
// escaneados estão na ortografia de antes de 1943 — "elle", "annos",
// "assucar", "hontem", "comprehender". Não é erro do livro, é a grafia da
// época; mas para quem lê hoje parece erro em toda página, e as edições
// modernas de Machado e Eça atualizam a grafia. É isso que fazemos.
//
// O método é o mesmo dos títulos: NADA é palpite.
//   1. exportar   — todas as palavras em minúscula do acervo em português,
//                   com quantas vezes e em quantos livros aparecem;
//   2. (hunspell pt_BR, no host, diz quais não existem no português de hoje)
//   3. candidatos — para cada palavra que não existe, as formas modernas que
//                   as regras da reforma de 1943 permitem (ll→l, ph→f, y→i,
//                   ct→t, h inicial, acento...);
//   4. (hunspell de novo: só sobra candidato que é palavra de verdade)
//   5. escolher   — uma forma só, ou a mais usada no próprio acervo; o que
//                   ficar ambíguo vai para a lista de dúvidas.
// Depois disso a lista é LIDA, por palavra, antes de valer (infra/ortografia.sh
// e servidor/ortografia-atualizada.json). O banco não muda: a troca acontece
// na entrega (servidor/diagramar.mjs), e desfazer é tirar a palavra da lista.
//
// Uso (no container da esteira, que tem memória para isso):
//   node ingestao/ortografia.mjs exportar  [pasta]
//   node ingestao/ortografia.mjs candidatos [pasta]
//   node ingestao/ortografia.mjs escolher  [pasta]

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [modo = 'exportar', pasta = '/dados/ortografia'] = process.argv.slice(2)
mkdirSync(pasta, { recursive: true })
const arq = (n) => join(pasta, n)
const linhas = (n) => readFileSync(arq(n), 'utf8').split('\n').filter(Boolean)

// letras do português (sem números, sem pontuação); hífen e apóstrofo ficam
// dentro da palavra: "soltal-o", "d'elle"
const SEPARA = /[^a-zà-öø-ÿA-ZÀ-ÖØ-Þ'’-]+/
const SO_MINUSCULA = /^[a-zà-öø-ÿ][a-zà-öø-ÿ'’-]*[a-zà-öø-ÿ]$|^[a-zà-öø-ÿ]$/

if (modo === 'exportar') {
  const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
  const textos = banco.prepare(`SELECT id, fonte FROM texto WHERE dono_id IS NULL AND idioma = 'pt'`).all()
  const caps = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?')
  const vezes = new Map() // palavra -> [ocorrências, livros, último livro, ocorrências em texto moderno]
  for (const t of textos) {
    const moderno = t.fonte === 'fio_traducao' || t.fonte === 'planalto'
    for (const c of caps.iterate(t.id)) {
      const limpo = c.corpo.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
      for (const crua of limpo.split(SEPARA)) {
        const p = crua.replace(/^['’-]+|['’-]+$/g, '').replace(/’/g, "'")
        if (!p || !SO_MINUSCULA.test(p) || p.length > 30) continue
        let v = vezes.get(p)
        // chave copiada: o pedaço fatiado prenderia o capítulo inteiro na memória
        if (!v) { v = [0, 0, 0, 0]; vezes.set(JSON.parse(JSON.stringify(p)), v) }
        v[0]++
        if (moderno) v[3]++
        if (v[2] !== t.id) { v[1]++; v[2] = t.id }
      }
    }
  }
  const saida = [...vezes].filter(([, v]) => v[0] >= 2).sort((a, b) => b[1][0] - a[1][0])
  writeFileSync(arq('palavras.tsv'), saida.map(([p, v]) => `${p}\t${v[0]}\t${v[1]}\t${v[3]}`).join('\n') + '\n')
  // para o hunspell: o hífen separa ("soltal-o" vira duas), então vai a palavra inteira e as partes
  writeFileSync(arq('palavras.txt'), saida.map(([p]) => p).join('\n') + '\n')
  console.log(`${vezes.size} palavras distintas; ${saida.length} com 2+ ocorrências -> ${arq('palavras.tsv')}`)
}

// ─────────────────────────────────────────────────────────────
// As regras da reforma. Cada uma é OPCIONAL: o candidato é toda combinação
// delas, e o dicionário decide qual combinação dá palavra de verdade.
// ─────────────────────────────────────────────────────────────
const REGRAS = [
  [/ph/g, 'f'], [/th/g, 't'], [/rh/g, 'r'], [/y/g, 'i'],
  [/ll/g, 'l'], [/mm/g, 'm'], [/nn/g, 'n'], [/tt/g, 't'], [/ff/g, 'f'], [/pp/g, 'p'],
  [/dd/g, 'd'], [/gg/g, 'g'], [/bb/g, 'b'], [/cc(?=[ei])/g, 'c'],
  [/chr/g, 'cr'], [/chl/g, 'cl'], [/ch(?=[ei])/g, 'qu'], [/ch(?=[aou])/g, 'c'],
  [/mpt/g, 'nt'], [/mpç/g, 'nç'], [/([aeiouáéíóú])ct/g, '$1t'], [/([aeiouáéíóú])cç/g, '$1ç'], [/([aeiou])pt/g, '$1t'], [/pç/g, 'ç'],
  [/mn/g, 'n'], [/gn(?=[aeiou])/g, 'n'], [/sc(?=[ei])/g, 'c'],
  [/^h/, ''], [/z$/, 's'], [/zes$/, 'ses'], [/éa$/, 'eia'], [/êa$/, 'eia'], [/éas$/, 'eias'], [/ae$/, 'ai'], [/aes$/, 'ais'],
  [/ão$/, 'am'], [/ou/, 'oi'], [/ei/, 'e'], [/^e/, 'i'], [/ea/, 'ia'], [/eo/, 'io'], [/s(?=[aeiou])/, 'z'], [/z(?=[aeiou])/, 's'],
  [/ss/, 'ç'], [/x/, 'ch'], [/ch/, 'x'], [/iu$/, 'io'],
  // verbo da época: "nasceo", "dirigio", "tinhaõ", "erâo"
  [/eo$/, 'eu'], [/io$/, 'iu'], [/(aõ|âo|ao|ão)$/, 'am'], [/(aõ|âo)$/, 'ão'],
  // u por v ("noua"), "beens", s longo lido como f no scan ("coufa", "fenão")
  [/u(?=[aeiou])/, 'v'], [/ee/, 'e'], [/f/, 's'],
]
const VOGAL_ACENTO = { a: 'áâã', e: 'éê', i: 'í', o: 'óôõ', u: 'ú' }
const SEM_ACENTO = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u' }

function variantes(p) {
  let s = new Set([p])
  for (const [re, por] of REGRAS) {
    for (const x of [...s]) { const y = x.replace(re, por); if (y !== x && y) s.add(y) }
    if (s.size > 48) break
  }
  // acento: tirar os que tem, e pôr um (só um) em qualquer vogal
  const comAcento = new Set(s)
  for (const x of s) {
    const nu = [...x].map((c) => SEM_ACENTO[c] ?? c).join('')
    comAcento.add(nu)
    for (const base of new Set([x, nu])) {
      ;[...base].forEach((c, i) => {
        for (const a of VOGAL_ACENTO[c] ?? '') comAcento.add(base.slice(0, i) + a + base.slice(i + 1))
      })
    }
  }
  comAcento.delete(p)
  return comAcento
}

// "soltal-o" -> "soltá-lo": o pronome da época colado ao infinitivo sem o r
const PRONOME = /^([a-zà-ÿ]+?)([aeio])l-(o|a|os|as)$/
const PRONOME_ACENTO = { a: 'á', e: 'ê', i: 'i', o: 'ô' }

if (modo === 'candidatos') {
  const desconhecidas = new Set(linhas('desconhecidas.txt'))
  const freq = new Map(linhas('palavras.tsv').map((l) => { const [p, n] = l.split('\t'); return [p, Number(n)] }))
  const todos = new Set()
  const por = {}
  let n = 0
  for (const [p, oc] of freq) {
    // o hunspell separa no hífen e devolve a parte ("soltal-o" -> "soltal")
    const desconhecida = desconhecidas.has(p) || (p.includes('-') && p.split('-').some((x) => desconhecidas.has(x)))
    if (oc < 3 || !desconhecida) continue
    n++
    const m = p.match(PRONOME)
    const vs = m ? new Set([m[1] + m[2] + 'r']) : variantes(p)
    por[p] = [...vs]
    for (const v of vs) todos.add(v)
  }
  writeFileSync(arq('candidatos.json'), JSON.stringify(por))
  writeFileSync(arq('candidatos.txt'), [...todos].join('\n') + '\n')
  console.log(`${n} palavras desconhecidas com 3+ ocorrências; ${todos.size} candidatos para o dicionário`)
}

if (modo === 'escolher') {
  const por = JSON.parse(readFileSync(arq('candidatos.json'), 'utf8'))
  const invalidos = new Set(linhas('candidatos-invalidos.txt'))
  const tsv = new Map(linhas('palavras.tsv').map((l) => { const [p, n, l2, mod] = l.split('\t'); return [p, { n: Number(n), livros: Number(l2), mod: Number(mod) }] }))
  const certas = [], duvidas = [], sem = []
  for (const [p, vs] of Object.entries(por)) {
    const f = tsv.get(p)
    const m = p.match(PRONOME)
    let validos = vs.filter((v) => !invalidos.has(v))
    if (m && validos.length) validos = [m[1] + PRONOME_ACENTO[m[2]] + '-l' + m[3]]
    if (!validos.length) { sem.push([p, f.n, f.livros]); continue }
    // a forma mais usada no acervo, pagando 2 pontos (log) por letra mudada
    const uso = (v) => tsv.get(v)?.n ?? 0
    const nota = (v) => Math.log(uso(v) + 1) - 2 * dist(p, v)
    validos.sort((a, b) => nota(b) - nota(a))
    const [a, b] = validos
    const claro = validos.length === 1 || nota(a) - nota(b) >= 2
    ;(claro ? certas : duvidas).push([p, a, f.n, f.livros, validos.slice(0, 4).map((v) => `${v}:${uso(v)}`).join(' ')])
  }
  const ordem = (x, y) => y[2] - x[2]
  certas.sort(ordem); duvidas.sort(ordem); sem.sort((x, y) => y[1] - x[1])
  // Dois sinais de que a palavra não é português antigo, e sim outra língua
  // no meio do livro ("the", "en", "des", "by"): ela existe no dicionário de
  // inglês/francês/espanhol/italiano/alemão, ou os vizinhos dela não são
  // português. Essas vão para a leitura, nunca para a lista segura.
  const estrangeiras = existsSync(arq('estrangeiras.txt')) ? new Set(linhas('estrangeiras.txt')) : new Set()
  const ctx = existsSync(arq('contexto.json')) ? JSON.parse(readFileSync(arq('contexto.json'), 'utf8')) : {}
  const segura = [], revisar = []
  for (const r of certas) {
    const [p] = r
    const pt = ctx[p] ? ctx[p][1] / ctx[p][0] : 0
    const fora = estrangeiras.has(p)
    r.push(pt.toFixed(2), fora ? 'estrangeira' : '')
    ;(p.length >= 4 && pt >= 0.45 && (!fora || pt >= 0.55) ? segura : revisar).push(r)
  }
  writeFileSync(arq('proposta-segura.tsv'), segura.map((r) => r.join('\t')).join('\n') + '\n')
  writeFileSync(arq('proposta-revisar.tsv'), revisar.map((r) => r.join('\t')).join('\n') + '\n')
  console.log(`segura ${segura.length} (${segura.reduce((s, r) => s + r[2], 0)}) · revisar ${revisar.length} (${revisar.reduce((s, r) => s + r[2], 0)})`)
  writeFileSync(arq('proposta.tsv'), certas.map((r) => r.join('\t')).join('\n') + '\n')
  writeFileSync(arq('duvidas.tsv'), duvidas.map((r) => r.join('\t')).join('\n') + '\n')
  writeFileSync(arq('sem-candidato.tsv'), sem.map((r) => r.join('\t')).join('\n') + '\n')
  const soma = (l, i) => l.reduce((s, r) => s + r[i], 0)
  console.log(`claras ${certas.length} (${soma(certas, 2)} ocorrências) · dúvidas ${duvidas.length} (${soma(duvidas, 2)}) · sem candidato ${sem.length} (${soma(sem, 1)})`)
}

// A SEGUNDA FAMÍLIA: palavras que o dicionário aceita porque existem como
// OUTRA palavra — "noticia" (do verbo noticiar), "seculo", "papeis",
// "ultimas", "premio", "assucar". No texto antigo são o substantivo sem o
// acento. O sinal é o uso: o texto moderno do próprio acervo (traduções e
// leis) nunca escreve "noticia" e escreve "notícia" milhares de vezes.
const CONTRACAO = [[/^d'e/, 'de'], [/^d'a/, 'da'], [/^d'o/, 'do'], [/^d'i/, 'di'], [/^d'u/, 'du'], [/^n'e/, 'ne'], [/^n'a/, 'na'], [/^n'o/, 'no'], [/^n'u/, 'nu'],
  [/^d'um/, 'de um'], [/^d'uma/, 'de uma'], [/^d'uns/, 'de uns'], [/^d'umas/, 'de umas'], [/^n'um/, 'num'], [/^n'uma/, 'numa']]
if (modo === 'acentos') {
  const tsv = new Map(linhas('palavras.tsv').map((l) => { const [p, n, l2, mod] = l.split('\t'); return [p, { n: Number(n), livros: Number(l2), mod: Number(mod) }] }))
  const saida = []
  for (const [p, f] of tsv) {
    if (f.n < 30 || f.mod > 0) continue
    const vs = new Set()
    const nu = [...p].map((c) => SEM_ACENTO[c] ?? c).join('')
    for (const base of new Set([p, nu])) {
      vs.add(base)
      ;[...base].forEach((c, i) => { for (const a of VOGAL_ACENTO[c] ?? '') vs.add(base.slice(0, i) + a + base.slice(i + 1)) })
    }
    for (const [re, por] of CONTRACAO) if (re.test(p)) {
      const y = p.replace(re, por)
      vs.add(y)
      // "d'ellas" -> "delas": a contração e as regras da reforma juntas
      for (const v of variantes(y)) if (!v.includes("'")) vs.add(v)
    }
    for (const v of variantes(p)) vs.add(v)
    vs.delete(p)
    const bons = [...vs].map((v) => [v, tsv.get(v)?.mod ?? 0]).filter(([, m]) => m >= 20).sort((a, b) => b[1] - a[1])
    if (!bons.length) continue
    const [[v, m], seg] = bons
    const claro = !seg || m >= 10 * seg[1]
    saida.push([p, v, f.n, f.livros, m, claro ? '' : 'dúvida: ' + bons.slice(0, 3).map((x) => x.join(':')).join(' ')])
  }
  saida.sort((a, b) => b[2] - a[2])
  writeFileSync(arq('acentos.tsv'), saida.map((r) => r.join('\t')).join('\n') + '\n')
  console.log(`${saida.length} palavras da segunda família (${saida.reduce((s, r) => s + r[2], 0)} ocorrências)`)
}

// A lista que vale: as N primeiras da proposta segura (lidas), as aceitas da
// lista de revisar (lidas), menos as excluídas, mais as trocas escritas à mão.
//   node ingestao/ortografia.mjs final <pasta> <decisoes.json> <N> > servidor/ortografia-atualizada.json
if (modo === 'final') {
  const [, , , , decisoes, n = '4000'] = process.argv
  const d = JSON.parse(readFileSync(decisoes, 'utf8'))
  const fora = new Set(d.excluir), aceitas = new Set(d.aceitar)
  const mapa = {}
  // segunda família primeiro: a primeira, lida com mais cuidado, passa por cima
  const foraAcento = new Set(d.excluir_acentos ?? [])
  if (existsSync(arq('acentos.tsv'))) for (const l of linhas('acentos.tsv').slice(0, Number(d.acentos_lidas ?? 700))) {
    const [a, b, , , , duvida] = l.split('\t')
    // "ouvira", "perdera": mais-que-perfeito, que hoje se escreve igual; nunca o futuro "-rá"
    if (duvida || foraAcento.has(a) || fora.has(a) || (a.endsWith('ra') && b === a.slice(0, -1) + 'á')) continue
    mapa[a] = b
  }
  for (const l of linhas('proposta-segura.tsv').slice(0, Number(n))) { const [a, b] = l.split('\t'); if (!fora.has(a)) mapa[a] = b }
  for (const l of linhas('proposta-revisar.tsv')) { const [a, b] = l.split('\t'); if (aceitas.has(a) && !fora.has(a)) mapa[a] = b }
  // A CAUDA (o que não foi lido palavra por palavra): só entra a troca que é
  // ESTRUTURALMENTE segura — a forma nova é a antiga com letra dobrada
  // desfeita, ph/th/rh/y, ct/pt mudos, ch de "chimica", e acento posto ou
  // tirado; ou o pronome da época ("soltal-o" -> "soltá-lo"). Troca que muda
  // vogal, s/z, f/s ou -ão/-am fica de fora: foi onde a lista lida mais
  // achou erro ("sinco" -> "zinco", "veiu" -> "véu", "lampeão" -> "lampiam").
  // Medido por amostra antes de valer (ver infra/conserto-0510/ortografia-decisoes.json).
  if (process.argv.includes('--cauda')) {
    const foraLingua = existsSync(arq('estrangeiras.txt')) ? new Set(linhas('estrangeiras.txt')) : new Set()
    const nu = (s) => [...s].map((c) => SEM_ACENTO[c] ?? c).join('')
    const esqueleto = (s) => nu(s).replace(/([bcdfglmnprt])\1/g, '$1').replace(/ph/g, 'f').replace(/th/g, 't').replace(/rh/g, 'r').replace(/y/g, 'i')
      .replace(/chr/g, 'cr').replace(/chl/g, 'cl').replace(/ch(?=[ei])/g, 'qu').replace(/mpt/g, 'nt').replace(/([aeiou])[cp]t/g, '$1t').replace(/[cp]ç/g, 'ç')
      .replace(/sc(?=[ei])/g, 'c').replace(/mn/g, 'n').replace(/gn(?=[aeiou])/g, 'n')
    let entrou = 0
    // a primeira amostra (400, semente fixa) deu 11% de erro: lixo de scan
    // ("almnnos" -> "alnos"), palavra tupi ("ybyrá" -> "ibira") e o pretérito
    // "acordárão" virando o futuro "acordarão". Daí as travas abaixo.
    const usos = new Map(linhas('palavras.tsv').map((l) => { const [p, q, lv, mod] = l.split('\t'); return [p, [Number(q), Number(lv), Number(mod)]] }))
    const tentar = (a, b) => {
      // (o pronome escapa da lista de estrangeiras: o hunspell separa no hífen e "o" existe em italiano)
      if (mapa[a] || fora.has(a) || foraAcento.has(a) || aceitas.has(a) || a.length < 4 || (foraLingua.has(a) && !PRONOME.test(a))) return
      if (a.endsWith('ra') && b === a.slice(0, -1) + 'á') return
      // "-árão" é pretérito (acordaram), nunca o futuro sem acento
      if (/[áâéêí]r[ãa][oõ]$/.test(a)) return
      // a antiga em 2 livros ou mais (lixo de scan mora num livro só), e a
      // nova usada pelo acervo de verdade
      const [qa = 0, la = 0] = usos.get(a) ?? [], [qb = 0] = usos.get(b) ?? []
      // o pronome ("soltal-o") já foi provado pelo infinitivo no dicionário: basta aparecer em 2 livros
      const ehPronome = PRONOME.test(a)
      if (ehPronome ? la < 2 : (qa < 10 || la < 3 || qb < 30)) return
      // quarta amostra (1,5%): "fillio" -> "filio" era "filho" lido errado. A
      // nova tem de existir no texto MODERNO do acervo (traduções e leis).
      if (!ehPronome && (usos.get(b)?.[2] ?? 0) < 2) return
      // segunda amostra (4%): o fim em "-ão" ("amaó" -> "amão", "mandaó" ->
      // "mandão" eram "amam", "mandam"). Só passa o substantivo em "-ção".
      if (/([aáâàã][oóôõ]|[aáâàã]m)$/.test(a) && !/ç[aáâàã][oóôõ]$/.test(a)) return
      // acento novo na última sílaba ("desvê", "encadeá", "remoê"): fora
      if (/[áéêíóôú]s?$/.test(b) && !/[áéêíóôú]s?$/.test(a)) return
      const pron = a.match(PRONOME)
      // terceira amostra (3%): a regra larga ainda deixava lixo de scan
      // ("cllas", "nnais", "igno"). Ficam só CLASSES conhecidas, cada uma
      // com a forma nova inteira prevista — nada de "parece com".
      const seguro = pron ? b === pron[1] + PRONOME_ACENTO[pron[2]] + '-l' + pron[3] : classeSegura(a, b)
      if (seguro) { mapa[a] = b; entrou++ }
    }
    for (const l of linhas('proposta-segura.tsv').slice(Number(n))) { const [a, b] = l.split('\t'); tentar(a, b) }
    for (const l of linhas('acentos.tsv').slice(Number(d.acentos_lidas ?? 700))) { const [a, b, , , , duvida] = l.split('\t'); if (!duvida) tentar(a, b) }
    console.error(`cauda: ${entrou} trocas estruturalmente seguras`)
  }
  Object.assign(mapa, d.trocar)
  const faltou = [...aceitas].filter((a) => !mapa[a] && !fora.has(a))
  if (faltou.length) console.error('aceitas que não estão na lista de revisar:', faltou.join(' '))
  process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b, 'pt'))), null, 0) + '\n')
  console.error(`${Object.keys(mapa).length} palavras na lista`)
}

// Quais palavras da lista também são NOME: aparecem com maiúscula no meio da
// frase ("o Mattos", "D. Bella", "a Villa Rica"). Com maiúscula, essas nunca
// são trocadas — nem no começo da frase, onde não dá para saber.
//   node ingestao/ortografia.mjs nomes <pasta> <ortografia-atualizada.json>
if (modo === 'nomes') {
  const caminho = process.argv[4]
  const mapa = JSON.parse(readFileSync(caminho, 'utf8'))
  const trocas = mapa.trocas ?? mapa
  const chaves = new Set(Object.keys(trocas))
  const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
  const textos = banco.prepare(`SELECT id FROM texto WHERE dono_id IS NULL AND idioma = 'pt' AND fonte <> 'fio_traducao'`).all()
  const caps = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?')
  const meio = new Map(), minus = new Map()
  const PAL = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g
  for (const t of textos) for (const c of caps.iterate(t.id)) {
    const s = c.corpo.replace(/<[^>]+>/g, ' ')
    for (const m of s.matchAll(PAL)) {
      const w = m[0], k = w.toLowerCase().replace(/’/g, "'")
      if (!chaves.has(k)) continue
      if (w === k) { minus.set(k, (minus.get(k) ?? 0) + 1); continue }
      if (!/^[A-ZÀ-ÖØ-Þ][a-zß-öø-ÿ'’-]*$/.test(w)) continue
      // maiúscula logo depois de palavra minúscula (com ou sem vírgula): é nome
      const antes = s.slice(Math.max(0, m.index - 3), m.index)
      if (/[a-zà-ÿ,] $/.test(antes)) meio.set(k, (meio.get(k) ?? 0) + 1)
    }
  }
  const nomes = [...meio].filter(([k, n]) => n >= 3 && n >= 0.02 * (minus.get(k) ?? 0)).map(([k]) => k).sort()
  writeFileSync(caminho, JSON.stringify({ trocas, nomes }) + '\n')
  console.log(`${nomes.length} nomes: ${nomes.slice(0, 80).join(' ')}`)
}

// Para cada palavra da proposta: em quantas ocorrências há, a até 3 palavras
// de distância, uma palavra que só o português usa. "the" no meio de citação
// inglesa tem vizinhos ingleses; "elle" de Machado tem "que", "não", "uma".
const SO_PORTUGUES = new Set(('não nao uma um para com do da dos das ao aos pelo pela pelos pelas seu sua seus suas muito quando ' +
  'também tambem foi são ser está estava era tinha porque então isto isso mesmo ainda depois entre sobre sem até onde cada outro ' +
  'outra há ha vez lhe lhes nem já ja ele ela eles elas elle ella elles ellas aquelle aquella quaes taes annos anno mais pelo seja ' +
  'tudo nada tem têm ter sido fazer disse como num numa neste nesta deste desta nosso nossa você senhor coisa cousa dous dois').split(' '))
if (modo === 'contexto') {
  const alvo = new Set([...linhas('proposta.tsv'), ...linhas('duvidas.tsv')].map((l) => l.split('\t')[0]))
  const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
  const textos = banco.prepare(`SELECT id FROM texto WHERE dono_id IS NULL AND idioma = 'pt' AND fonte <> 'fio_traducao'`).all()
  const caps = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?')
  const ctx = {}
  for (const t of textos) for (const c of caps.iterate(t.id)) {
    for (const par of c.corpo.split('</p>')) {
      const ws = par.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').toLowerCase().split(SEPARA).filter(Boolean)
      ws.forEach((w, i) => {
        if (!alvo.has(w)) return
        const k = ctx[w] ??= [0, 0]
        k[0]++
        for (let j = Math.max(0, i - 3); j <= Math.min(ws.length - 1, i + 3); j++) if (j !== i && SO_PORTUGUES.has(ws[j])) { k[1]++; break }
      })
    }
  }
  writeFileSync(arq('contexto.json'), JSON.stringify(ctx))
  console.log(`contexto de ${Object.keys(ctx).length} palavras`)
}

// As classes da cauda: a forma nova é a antiga com UMA mudança conhecida.
// (funções declaradas: o modo "final" roda lá em cima, antes de uma const daqui existir)
function desdobrar(s) { return s.replace(/([bcdfglmnprt])\1/g, '$1') }
function classeSegura(a, b) {
  const ACENTO_DE = { a: 'á', e: 'ê', i: 'í', o: 'ó', u: 'ú' }
  if (a.length < 6 || /^([bcdfglmnprst])\1|^gn|^[^a-zà-ÿ]/.test(a)) return false
  const sem = (s) => [...s].map((c) => SEM_ACENTO[c] ?? c).join('')
  // letra dobrada desfeita, e nada mais: "martellos", "appoiar", "singellos"
  if (b === desdobrar(a) && sem(a) === a) return true
  // ph/th/rh/y, só: "diaphana" não ("diáfana" põe acento), "rythmo" sim
  if (b === a.replace(/ph/g, 'f').replace(/th/g, 't').replace(/rh/g, 'r').replace(/y/g, 'i')) return true
  const base = desdobrar(a.replace(/ph/g, 'f').replace(/th/g, 't').replace(/y/g, 'i'))
  // "-ára", "-êra", "-íra" do mais-que-perfeito: pintára -> pintara
  if (/[áêéí]ra(-se|-me|-lhe)?$/.test(a) && b === sem(a)) return true
  // "-ámos", "-émos" do pretérito: precisámos -> precisamos
  if (/[áé]mos$/.test(a) && b === sem(a)) return true
  // "-çaõ", "-çâo", "-çào", "-çáo", "-çaô" -> "-ção"
  if (/ç[aâàá][oõô]$|çaõ$/.test(a) && b === a.replace(/ç[aâàáã][oõô]$/, 'ção')) return true
  // "-avel", "-ivel", "-aveis", "-iveis" -> "-ável"...; "-issimo" -> "-íssimo";
  // "-encia", "-ancia", "-orio", "-ario", "-icos" com o acento que falta
  for (const [re, f] of [
    [/avel$/, 'ável'], [/aveis$/, 'áveis'], [/ivel$/, 'ível'], [/iveis$/, 'íveis'],
    [/issim(o|a|os|as)$/, (m) => 'íssim' + m.slice(6)], [/encia(s?)$/, (m) => 'ência' + m.slice(5)], [/ancia(s?)$/, (m) => 'ância' + m.slice(5)],
    [/orio(s?)$/, (m) => 'ório' + m.slice(4)], [/oria(s?)$/, (m) => 'ória' + m.slice(4)], [/ario(s?)$/, (m) => 'ário' + m.slice(4)], [/aria(s)$/, 'árias'],
  ]) if (re.test(base) && b === base.replace(re, f)) return true
  // "-ico(s)", "-ica(s)" proparoxítono: harmonico -> harmônico (a vogal antes do "ico" ganha o acento)
  const m = base.match(/^(.*?)([aeiou])([^aeiou]+)(ic[oa]s?)$/)
  if (m && !/[áéíóúâêô]/.test(base)) {
    const v = m[2]
    for (const ac of [ACENTO_DE[v], { a: 'â', e: 'ê', o: 'ô' }[v]].filter(Boolean)) if (b === m[1] + ac + m[3] + m[4]) return true
  }
  return false
}

function dist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

if (!['exportar', 'candidatos', 'escolher', 'contexto', 'final', 'acentos', 'nomes'].includes(modo)) { console.error('modo: exportar | candidatos | escolher'); process.exit(1) }
void existsSync
