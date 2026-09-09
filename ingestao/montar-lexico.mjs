// Montar o dicionário de grafia antiga → grafia de hoje, sozinho.
//
//   node ingestao/montar-lexico.mjs --palavras <lista.txt> --corpus <banco.db>
//
// ─────────────────────────────────────────────────────────────
// A IDEIA, que é a parte que importa
//
// Escrever à mão a lista de palavras que mudaram de grafia é trabalho de
// dicionarista, e eu tinha escrito cento e cinquenta. O acervo tem milhões.
//
// Mas a lista não precisa ser escrita: ela pode ser DEDUZIDA, porque temos os
// dois lados. De um lado, todas as palavras que o acervo usa. Do outro, um
// dicionário do português de hoje. A palavra do acervo que não está no
// dicionário é candidata; e a transformação certa é a que produz uma palavra
// que ESTÁ no dicionário.
//
//   "manuscripto" não existe hoje. Tirando o "p" mudo dá "manuscrito", que
//   existe. Então "manuscripto" → "manuscrito", e ninguém precisou digitar
//   esse par.
//
// Isso resolve de graça o que a regra não resolvia:
//
//   ACENTO. "seculos" não existe; "séculos" existe e é a única palavra do
//   dicionário cuja forma sem acento é "seculos". Então o acento se descobre
//   por eliminação, sem saber uma linha de regra de acentuação.
//
//   CONSOANTE MUDA. Regra pura não serve: "facto" → "fato" está certo e
//   "pacto" → "pato" está errado, e nenhuma regra distingue os dois. O
//   dicionário distingue, porque "pacto" ESTÁ nele e por isso nunca é
//   candidato.
//
// ─────────────────────────────────────────────────────────────
// AS TRÊS TRAVAS, porque um dicionário errado estraga o acervo inteiro
//
//   1. Palavra que já existe hoje nunca é tocada. É o que salva "pacto".
//   2. Ambiguidade não decide: se a transformação achar mais de uma palavra
//      moderna possível, o par é descartado e a palavra fica como está.
//   3. Só entra o par cuja mudança é pequena. Uma "correção" que reescreve
//      metade da palavra não é reforma ortográfica, é outra palavra.

import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * As transformações que a ortografia portuguesa de fato sofreu.
 *
 * Nenhuma delas é aplicada por si: cada uma é um PALPITE, que só vira par se
 * o resultado existir no dicionário de hoje. Por isso a lista pode ser
 * generosa — errar aqui não estraga nada, só não produz par.
 */
const PALPITES = [
  (p) => p.replace(/ph/g, 'f'),
  (p) => p.replace(/th/g, 't'),
  (p) => p.replace(/y/g, 'i'),
  // consoante dobrada que caiu
  (p) => p.replace(/([bcdfgjklmnpqtvxz])\1/g, '$1'),
  // consoante muda antes de outra
  (p) => p.replace(/ct/g, 't'),
  (p) => p.replace(/pt/g, 't'),
  (p) => p.replace(/cç/g, 'ç'),
  (p) => p.replace(/pç/g, 'ç'),
  (p) => p.replace(/mn/g, 'n'),
  (p) => p.replace(/bt/g, 't'),
  (p) => p.replace(/sc/g, 'c'),
  // o "s" que virou "z" nos sufixos
  (p) => p.replace(/isa(ção|ções|r|do|da)/g, 'iza$1'),
  // ditongo que mudou de escrita: "idéa" → "ideia"
  (p) => p.replace(/éa\b/g, 'eia'),
  (p) => p.replace(/ôa\b/g, 'oa'),
  // trema, que saiu em 2009
  (p) => p.replace(/ü/g, 'u'),
  // vogal inicial que mudou: "egreja" → "igreja", "imprestavel" → "emprestável"
  (p) => p.replace(/^e/, 'i'),
  (p) => p.replace(/^i/, 'e'),
]

/** Todas as combinações de até três palpites. Mais que isso é outra palavra. */
function candidatas(palavra) {
  let atual = new Set([palavra])
  const todas = new Set()
  for (let volta = 0; volta < 3; volta++) {
    const proxima = new Set()
    for (const p of atual) {
      for (const palpite of PALPITES) {
        const novo = palpite(p)
        if (novo !== p && !todas.has(novo)) { proxima.add(novo); todas.add(novo) }
      }
    }
    if (!proxima.size) break
    atual = proxima
  }
  return todas
}

/** Quantas letras mudaram, para recusar par que é outra palavra. */
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    }
  }
  return d[a.length][b.length]
}

// ─────────────────────────────────────────────────────────────

function lerDicionario(caminhos) {
  const moderno = new Set()
  for (const c of caminhos) {
    for (let linha of readFileSync(c, 'utf8').split('\n')) {
      linha = linha.split('/')[0].trim().replace(/^﻿/, '')   // tira flag do hunspell
      if (!linha || /[^\p{L}-]/u.test(linha) || linha.length < 2) continue
      moderno.add(linha.toLowerCase())
    }
  }

  // Índice pela forma SEM acento. Só entra quem é único: se "e" e "é" caem no
  // mesmo lugar, nenhuma das duas serve para adivinhar acento.
  const contagem = new Map()
  for (const p of moderno) {
    const chave = semAcento(p)
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  const porFormaNua = new Map()
  for (const p of moderno) {
    const chave = semAcento(p)
    if (contagem.get(chave) === 1) porFormaNua.set(chave, p)
  }
  return { moderno, porFormaNua }
}

/**
 * Conta TODAS as palavras do acervo, e não só as desconhecidas.
 *
 * A primeira versão contava só as que faltavam no dicionário, e produziu
 * "aos" → "aós", "disse" → "dissê", "deu" → "déu". A causa é que o dicionário
 * disponível tem 320 mil formas e o português tem muito mais: faltam
 * conjugações inteiras. "disse" não estava lá, virou candidata, e o índice
 * sem acento ofereceu uma palavra rara que por acaso existia.
 *
 * O conserto não é achar dicionário melhor. É usar o acervo como PROVA: se
 * "dissê" fosse a forma certa, ela apareceria em algum lugar dos cento e
 * cinco milhões de palavras. Ela aparece zero vezes. "ele", "também", "anos"
 * e "história" aparecem aos milhares.
 *
 * Contar tudo custa memória e devolve a única evidência que não depende de
 * dicionário nenhum: o uso.
 */
function contarOAcervo(banco) {
  const db = new DatabaseSync(banco, { readOnly: true })
  const freq = new Map()
  let lidos = 0
  let podas = 0

  for (const { corpo } of db.prepare('SELECT corpo FROM capitulo').iterate()) {
    lidos++
    const texto = corpo.replace(/<[^>]*>/g, ' ')
    for (const bruta of texto.toLowerCase().match(/\p{Ll}[\p{Ll}'-]*/gu) ?? []) {
      const p = bruta.replace(/^['-]+|['-]+$/g, '')
      if (p.length < 3) continue
      freq.set(p, (freq.get(p) ?? 0) + 1)
    }

    // ── a poda, sem a qual isto não roda ──
    //
    // O acervo tem mais de dois milhões de palavras distintas, e guardar
    // todas estourou a memória da VPS, que tem 2 GB e divide com o Wallt.
    //
    // Mas a distribuição é de Zipf: a maior parte das distintas aparece UMA
    // vez, e nesse acervo "uma vez" é quase sempre erro de OCR — "manuscrlpto",
    // "elie", "aeeim". Nada disso vira par: o corte de frequência já as
    // descarta no fim.
    //
    // Então some com elas na hora. O que se perde é exatidão em palavra
    // rara, e rara é justamente o que não interessa aqui.
    if (lidos % 4000 === 0) {
      if (freq.size > 700_000) {
        for (const [p, n] of freq) if (n === 1) freq.delete(p)
        podas++
      }
      process.stdout.write(`\r  ${lidos} capítulos, ${freq.size} palavras distintas, ${podas} podas   `)
    }
  }
  console.log()
  return freq
}

/**
 * TRAVA 5: a palavra tem plural moderno? Então ela é moderna.
 *
 * O dicionário disponível tem 323 mil formas e o português tem muito mais.
 * "pacto" e "rapto" simplesmente não estão nele, viraram candidatas, e
 * `ct → t` ofereceu "pato" e "rato" — que existem, são frequentes, e passam
 * por todas as travas anteriores. Seria o pior estrago possível: trocar uma
 * palavra certa por outra palavra certa, no meio do livro, sem deixar rastro.
 *
 * A saída é perguntar de outro jeito. O dicionário não tem "pacto", mas tem
 * "pactos". Não tem "rapto", mas tem "raptos". Não tem "acto" nem "actos",
 * porque essa nunca foi palavra do português brasileiro — foi grafia dele.
 *
 * Um substantivo de verdade deixa o plural para trás mesmo quando o singular
 * escapa da lista.
 */
/**
 * TRAVA 6: as palavras cujo acento SOBREVIVEU, e que o dicionário não tem.
 *
 * A reforma de 1971 varreu o acento diferencial, e por isso "vêr → ver",
 * "côr → cor", "sôbre → sobre" e "pêso → peso" estão certos — foram 866 pares
 * assim, quase todos bons.
 *
 * Quase. Um punhado de circunflexos ficou de pé justamente porque distingue
 * palavras que ainda se distinguem, e nenhum deles está na lista de 320 mil:
 *
 *   "ele pôde" é passado; "ele pode" é presente.
 *   "eles têm" é plural; "ele tem" é singular. Idem "vêm" e "vem".
 *   "pôr" é o verbo; "por" é a preposição.
 *
 * Trocar esses seria o pior tipo de estrago: uma palavra certa virando outra
 * palavra certa, no meio da frase, mudando o tempo verbal sem deixar rastro.
 * A lista é curta e fechada, então cabe escrevê-la.
 */
const PROTEGIDAS = new Set([
  'pôde', 'pôr', 'pôs', 'têm', 'vêm', 'vê', 'vês', 'lê', 'lês', 'crê', 'dê',
  'contêm', 'mantêm', 'obtêm', 'detêm', 'retêm', 'provêm', 'convêm',
  'intervêm', 'sobrevêm', 'abstêm', 'advêm', 'antevêm', 'descrê', 'relê',
])

const ehPalavraDeHoje = (p, moderno) =>
  PROTEGIDAS.has(p) || moderno.has(p) || moderno.has(`${p}s`) || moderno.has(`${p}es`)

function resolver(palavra, { moderno, porFormaNua }, freq) {
  if (ehPalavraDeHoje(palavra, moderno)) return null
  const achados = new Set()
  for (const c of candidatas(palavra)) {
    if (moderno.has(c)) { achados.add(c); continue }
    const comAcento = porFormaNua.get(semAcento(c))
    if (comAcento) achados.add(comAcento)
  }
  // e o caso mais simples de todos: só falta o acento
  const soAcento = porFormaNua.get(semAcento(palavra))
  if (soAcento && soAcento !== palavra) achados.add(soAcento)

  const daPalavra = freq.get(palavra) ?? 0
  const bons = [...achados].filter((a) => {
    // TRAVA 3: a mudança tem que ser pequena.
    if (distancia(palavra, a) > 3) return false

    // TRAVA 4, a que o acervo dá: a forma moderna tem que EXISTIR no acervo,
    // e não pode ser rara perto da antiga. É o que derruba "aós", "dissê" e
    // "déu", que aparecem zero vezes em cento e cinco milhões de palavras —
    // e é o que aprova "ele", "também" e "história", que aparecem aos
    // milhares ao lado das formas velhas.
    //
    // O corte é ABSOLUTO, e não uma proporção. A primeira versão exigia que a
    // forma moderna fosse pelo menos 1/50 da antiga, e isso derrubava pares
    // bons: num acervo feito de textos do século XIX, "seculos" aparece mais
    // que "séculos" por motivo histórico, não por estar certo. O que se quer
    // saber é só se a forma moderna EXISTE de verdade em algum lugar — dez
    // ocorrências em cento e cinco milhões de palavras já separa palavra de
    // ruído, e "aós" e "dissê" continuam em zero.
    // Os DOIS juntos, porque cada um sozinho falha para um lado.
    //
    // Só a proporção (1/50) derrubava par bom: num acervo do século XIX,
    // "seculos" aparece muito mais que "séculos" por motivo histórico, e não
    // por estar certo.
    //
    // Só o piso absoluto trazia de volta "aos → aós" e "teve → tevê": ambos
    // existem em algum canto do acervo, uns poucos por OCR e outros de
    // verdade ("tevê" é aparelho de televisão), e dez ocorrências bastavam.
    //
    // Juntos eles se cobrem. O piso exige que a forma moderna exista mesmo; a
    // proporção folgada exige que a antiga não seja avassaladoramente mais
    // comum — porque quando ela é, quem está errado é o palpite, não o acervo.
    const daModerna = freq.get(a) ?? 0
    return daModerna >= 10 && daModerna * 500 >= daPalavra
  })

  // TRAVA 2: mais de um destino é nenhum destino.
  return bons.length === 1 ? bons[0] : null
}

// ─────────────────────────────────────────────────────────────

const palavras = (arg('palavras') ?? '').split(',').filter(Boolean)
const corpus = arg('corpus')
const saida = arg('saida', 'ingestao/lexico-antigo.json')
const minimo = Number(arg('minimo', 3))   // frequência: uma vez só costuma ser erro de OCR

if (!palavras.length || !corpus) {
  console.error('uso: --palavras a.txt,b.dic --corpus dados/catalogo.db [--minimo 3]')
  process.exit(1)
}

console.log('lendo o dicionário de hoje')
const dicionario = lerDicionario(palavras)
console.log(`  ${dicionario.moderno.size} palavras, ${dicionario.porFormaNua.size} com forma sem acento única`)

console.log('varrendo o acervo')
const freq = contarOAcervo(corpus)

console.log('deduzindo os pares')
const lexico = {}
let vistas = 0
for (const [p, quantas] of [...freq].sort((a, b) => b[1] - a[1])) {
  // TRAVA 1: palavra que já existe hoje nunca é tocada. É o que salva "pacto".
  if (quantas < minimo || dicionario.moderno.has(p)) continue
  vistas++
  const moderna = resolver(p, dicionario, freq)
  if (moderna) lexico[p] = moderna
}

writeFileSync(saida, JSON.stringify(lexico, null, 0), 'utf8')
console.log(`\n${Object.keys(lexico).length} pares deduzidos, de ${vistas} palavras candidatas`)
console.log(`gravado em ${saida}`)
console.log('\namostra:')
for (const [de, para] of Object.entries(lexico).slice(0, 25)) console.log(`  ${de} → ${para}`)
