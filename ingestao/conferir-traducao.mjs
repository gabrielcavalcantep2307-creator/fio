// O raio-x das traduções da esteira (20/09/2026).
//
//   node ingestao/conferir-traducao.mjs --banco /dados/catalogo.db
//   node ingestao/conferir-traducao.mjs --banco /dados/catalogo.db --livro 5057
//   node ingestao/conferir-traducao.mjs --banco /dados/catalogo.db --saida /dados/raio-x-traducao.json
//
// O dono abriu livros traduzidos por nós e achou "muitas palavras ainda na
// língua original". Este arquivo mede isso, e mede em cima do texto COMO ELE É
// SERVIDO (passa por servidor/diagramar.mjs), porque é esse que a pessoa lê.
//
// ─────────────────────────────────────────────────────────────
// COMO SE SEPARA "PALAVRA QUE FICOU EM INGLÊS" DE "NOME PRÓPRIO"
//
// O tradutor automático (MinT/NLLB) não erra de um jeito só. Ele deixa para
// trás três coisas diferentes, e só duas são defeito:
//
//   1. palavra comum não traduzida  — "eles tinham tantas QUEER ir em",
//      "apresentou-o com GINGERLY".  É defeito, e é o que ele viu.
//   2. nome próprio  — "Heathcliff", "Catherine", "Sedgemoor".  NÃO é defeito:
//      nome de gente e de lugar fica como está em qualquer tradução humana.
//   3. palavra inventada  — "gabaritas" (gibbets), "clodo" (clod).  É defeito,
//      e é o pior, porque PARECE português e nenhuma máquina desconfia dela.
//
// O corte entre 1 e 2 é a CAIXA da letra: nome próprio vem com maiúscula no
// meio da frase. Então só entram na conta palavras minúsculas — e, por isso,
// a medida é conservadora de propósito: erra para menos, nunca para mais.
//
// O corte entre "português que eu não conheço" e "inglês" é o vocabulário: as
// palavras dos livros LIMPOS do acervo (Gutenberg e Wikisource, texto digitado
// por gente, não escaneado), vistas ao menos duas vezes. É o mesmo vocabulário
// de ingestao/medir-ocr.mjs, e ele já tem a ortografia antiga dentro.
//
// Fora do vocabulário, a palavra é classificada pela FORMA. O português tem
// uma ortografia estreita, e isso ajuda:
//   - termina em consoante que não seja r, s, l, m, n, z, x  → não é português
//   - tem w, y, k no meio, ou th, sh, ck, gh, ee, oo, wh     → não é português
// O que sobra ("gabaritas") vai para uma terceira pilha, "estranhas", que é
// onde moram as invenções — elas precisam de olho humano, não de regra.
//
// PARÁGRAFO INTEIRO EM INGLÊS é outro bicho: o MinT às vezes devolve o trecho
// igualzinho ao que recebeu. Mede-se por palavra de função (the, and, of, to,
// was, that…), como em ingestao/conferir-idioma.mjs.
// ─────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { diagramar } from '../servidor/diagramar.mjs'

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome)
  return i > 0 ? process.argv[i + 1] : padrao
}

const caminho = arg('--banco', 'dados/catalogo.db')
const soLivro = arg('--livro', null)
const saida = arg('--saida', null)
const banco = new DatabaseSync(caminho, { readOnly: true })

const semTags = (s) => s.replace(/<[^>]+>/g, ' ')
const palavrasDe = (s) => semTags(s).toLowerCase().match(/[a-zà-ÿ]{2,}/g) ?? []
// As palavras como foram escritas: a CAIXA é o que separa "queer" (defeito) de
// "Heathcliff" (nome próprio, que fica em qualquer tradução humana). Medir em
// cima do texto já em minúsculas, como a primeira versão fazia, devolve uma
// lista de personagens — Natásha, Raskolnikov, Pencroft — e nenhum defeito.
// Palavra no começo da frase também vem com maiúscula e também sai da conta:
// a medida erra para MENOS de propósito.
const minusculasDe = (s) => (semTags(s).match(/[A-Za-zÀ-ÿ]{2,}/g) ?? []).filter((w) => w[0] === w[0].toLowerCase()).map((w) => w.toLowerCase())

// ── o vocabulário do português do acervo ────────────────────────────────
process.stderr.write('montando vocabulário...\n')
const vocab = new Map()
for (const c of banco.prepare(
  `SELECT c.corpo FROM capitulo c JOIN texto t ON t.id = c.texto_id
    WHERE t.fonte IN ('gutenberg','wikisource') AND t.normalizado = 1 AND t.revisao IS NULL`
).iterate()) {
  for (const w of palavrasDe(c.corpo)) vocab.set(w, (vocab.get(w) ?? 0) + 1)
}
for (const [w, n] of vocab) if (n < 2) vocab.delete(w)
process.stderr.write('vocabulário: ' + vocab.size + ' palavras\n')

// ── a forma da palavra ──────────────────────────────────────────────────
const FINAL_PT = new Set(['r', 's', 'l', 'm', 'n', 'z', 'x', 'a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ã', 'â', 'ê', 'ô', 'õ', 'à'])
const PARES_ESTRANGEIROS = ['th', 'sh', 'ck', 'gh', 'wh', 'ee', 'oo', 'ai' + 'ght']
const temLetraDeFora = (w) => w.includes('w') || w.includes('y') || w.includes('k')

function forma(w) {
  if (temLetraDeFora(w)) return 'estrangeira'
  for (const par of PARES_ESTRANGEIROS) if (w.includes(par)) return 'estrangeira'
  if (!FINAL_PT.has(w[w.length - 1])) return 'estrangeira'
  return 'estranha'
}

// ── parágrafo inteiro na língua de origem ───────────────────────────────
const FUNCAO_EN = new Set(['the', 'and', 'of', 'to', 'in', 'that', 'it', 'was', 'is', 'for', 'with', 'as', 'his', 'her', 'had', 'but', 'not', 'they', 'you', 'this', 'from', 'have', 'were', 'which', 'she', 'he', 'be', 'on', 'at', 'by', 'or', 'an', 'their', 'there', 'been', 'would', 'when', 'what', 'all', 'we', 'so', 'if', 'out', 'up', 'said', 'them', 'him', 'into', 'more', 'could', 'other', 'than', 'then', 'now', 'only', 'its', 'over', 'also', 'very', 'after', 'our', 'these', 'my'])
const FUNCAO_PT = new Set(['que', 'de', 'não', 'para', 'com', 'uma', 'dos', 'das', 'os', 'as', 'um', 'em', 'no', 'na', 'se', 'por', 'como', 'mais', 'ele', 'ela', 'era', 'foi', 'ao', 'do', 'da', 'seu', 'sua', 'mas', 'já', 'quando', 'muito', 'sem', 'sobre', 'entre', 'depois', 'ainda', 'são', 'tinha', 'este', 'esta', 'isso', 'pelo', 'pela', 'nos', 'nas', 'meu', 'minha', 'todo', 'toda'])

function ehDaOrigem(ws) {
  if (ws.length < 12) return false
  let en = 0
  let pt = 0
  for (const w of ws) {
    if (FUNCAO_EN.has(w)) en++
    if (FUNCAO_PT.has(w)) pt++
  }
  return en >= 3 && en > pt * 2
}

// ── a varredura ─────────────────────────────────────────────────────────
let sql = `SELECT t.id, t.obra_id, t.fonte_url, o.titulo, o.titulo_pt, o.idioma_original, t.palavras
  FROM texto t JOIN obra o ON o.id = t.obra_id
  WHERE t.revisao = 'automatica' ORDER BY t.obra_id`
if (soLivro) sql = sql.replace('WHERE t.revisao', 'WHERE t.id = ' + Number(soLivro) + ' AND t.revisao')
const textos = banco.prepare(sql).all()
const capsDe = banco.prepare('SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')

const global = { estrangeiras: new Map(), estranhas: new Map(), frase: new Map() }
const relatorio = []

for (const t of textos) {
  const caps = capsDe.all(t.id)
  let total = 0
  let estrangeiras = 0
  let estranhas = 0
  let paragrafos = 0
  let paragrafosOrigem = 0
  const minhas = new Map()
  const exemplos = []

  for (const c of diagramar(caps, { fonte: 'traducao' })) {
    for (const bruto of String(c.corpo).split('</p>')) {
      const todas = palavrasDe(bruto)
      if (!todas.length) continue
      paragrafos++
      if (ehDaOrigem(todas)) {
        paragrafosOrigem++
        if (exemplos.length < 3) exemplos.push({ capitulo: c.ordem, trecho: semTags(bruto).trim().slice(0, 200) })
      }
      for (const w of minusculasDe(bruto)) {
        total++
        if (vocab.has(w)) continue
        const f = forma(w)
        if (f === 'estrangeira') estrangeiras++
        else estranhas++
        minhas.set(w, (minhas.get(w) ?? 0) + 1)
        const alvo = f === 'estrangeira' ? global.estrangeiras : global.estranhas
        alvo.set(w, (alvo.get(w) ?? 0) + 1)
        // uma frase de exemplo por palavra: sem ela a lista é só uma lista, e
        // não dá para decidir se "sagte" é defeito ou nome de gente
        if (!global.frase.has(w)) {
          const limpo = semTags(bruto).replace(/[ ]+/g, ' ').trim()
          const onde = limpo.toLowerCase().indexOf(w)
          global.frase.set(w, limpo.slice(Math.max(0, onde - 70), onde + 90))
        }
      }
    }
  }

  const topo = [...minhas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  // O que a tela mostra é titulo_pt quando existe; só o que fica sem ele
  // aparece em inglês para o leitor.
  const naTela = t.titulo_pt || t.titulo || ''
  relatorio.push({
    texto: t.id,
    obra: t.obra_id,
    titulo: naTela,
    semTituloPt: !t.titulo_pt,
    tituloEmIngles: !t.titulo_pt && /(^| )(the|of|on|and|a) /i.test(' ' + (t.titulo || '')),
    capitulos: caps.length,
    capitulosSemTitulo: caps.filter((c) => !c.titulo).length,
    palavras: total,
    estrangeiras,
    estranhas,
    taxa: total ? +((estrangeiras + estranhas) / total).toFixed(4) : 0,
    taxaEstrangeira: total ? +(estrangeiras / total).toFixed(4) : 0,
    paragrafos,
    paragrafosOrigem,
    topo,
    exemplos,
  })
  process.stderr.write(relatorio.length + '/' + textos.length + ' ' + (t.titulo || '').slice(0, 40) + '\n')
}

relatorio.sort((a, b) => b.taxaEstrangeira - a.taxaEstrangeira)

const soma = (f) => relatorio.reduce((s, r) => s + f(r), 0)
console.log('')
console.log('=== ' + relatorio.length + ' livros traduzidos pela esteira ===')
console.log('palavras medidas: ' + soma((r) => r.palavras).toLocaleString('pt-BR'))
console.log('fora do vocabulário, com cara de estrangeira: ' + soma((r) => r.estrangeiras).toLocaleString('pt-BR'))
console.log('fora do vocabulário, com cara de português (invenções): ' + soma((r) => r.estranhas).toLocaleString('pt-BR'))
console.log('parágrafos inteiros na língua de origem: ' + soma((r) => r.paragrafosOrigem) + ' de ' + soma((r) => r.paragrafos))
console.log('livros com UM capítulo só: ' + relatorio.filter((r) => r.capitulos === 1).length)
console.log('livros com título ainda em inglês: ' + relatorio.filter((r) => r.tituloEmIngles).length)
console.log('')
console.log('--- piores (taxa de palavra estrangeira) ---')
for (const r of relatorio.slice(0, 20)) {
  console.log(
    (r.taxaEstrangeira * 100).toFixed(2).padStart(6) + '%  ' +
    String(r.obra).padStart(5) + '  ' + (r.titulo || '').slice(0, 44).padEnd(46) +
    r.capitulos + ' caps  ' + r.paragrafosOrigem + ' par. em inglês'
  )
}
console.log('')
console.log('--- as 60 estrangeiras mais repetidas no acervo inteiro ---')
for (const [w, n] of [...global.estrangeiras.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
  console.log(String(n).padStart(6) + '  ' + w.padEnd(18) + (global.frase.get(w) ?? '').slice(0, 120))
}
console.log('')
console.log('--- as 60 "invenções" mais repetidas ---')
for (const [w, n] of [...global.estranhas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
  console.log(String(n).padStart(6) + '  ' + w.padEnd(18) + (global.frase.get(w) ?? '').slice(0, 120))
}

if (saida) {
  writeFileSync(saida, JSON.stringify({
    medido_em: new Date().toISOString(),
    livros: relatorio,
    estrangeiras: [...global.estrangeiras.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2000),
    estranhas: [...global.estranhas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2000),
    frases: Object.fromEntries(global.frase),
  }, null, 1))
  console.log('\ngravado em ' + saida)
}
