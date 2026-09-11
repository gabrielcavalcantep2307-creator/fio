// Conferir o plano antes de a esteira andar.
//
//   node ingestao/conferir-esteira.mjs [--corte 0.5]
//
// ─────────────────────────────────────────────────────────────
// POR QUE ISTO EXISTE, E É O ARQUIVO MAIS IMPORTANTE DA ESTEIRA
//
// `achar-fonte.mjs` casou 48 obras com um texto no Gutenberg. Olhando a lista
// com olho humano, um punhado está errado — e errado de um jeito específico
// que não dá erro em lugar nenhum:
//
//   "Aposta", de Tchekhov         → "Report of the Proceedings at the..."
//   "Poemas", de Poe              → "Lyrical Ballads"
//   "Salammbô", de Flaubert       → "The Brothers Karamazov"
//   "Metamorfose"                 → "The Pony Rider Boys in Louisiana"
//
// Deixar passar significa traduzir uma hora de texto errado, instalar no
// catálogo com o título certo na capa, e alguém abrir *Salammbô* e ler
// Dostoiévski. Nenhum teste pega isso depois; o catálogo simplesmente mente.
//
// A causa é a conferência de autor por ANO DE MORTE. Ela resolve a
// transliteração — Tolstói e Tolstoy morreram os dois em 1910 — e tem um
// defeito óbvio em retrospecto: Flaubert morreu em 1880 e Dostoiévski em
// 1881, um ano de diferença, dentro da tolerância. Ano de morte prova que
// PODE ser a mesma pessoa. Não prova que é.
//
// O conserto é o título, e ele precisa de um passo a mais: o nosso título
// está em português e o do Gutenberg em inglês, então compará-los direto não
// diz nada. Este arquivo traduz os 48 títulos — quarenta e oito chamadas,
// segundos — e só então mede a semelhança.
//
// É barato porque traduzir título é barato. E é a diferença entre uma esteira
// e uma máquina de estragar catálogo.
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { traduzir } from './motor-traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = join(RAIZ, 'dados', 'traducoes')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const corte = Number(arg('corte', 0.5))

const nu = (s) => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Palavras que aparecem em metade dos títulos do mundo e não distinguem nada.
const VAZIAS = new Set(['the', 'and', 'for', 'with', 'from', 'his', 'her',
  'its', 'being', 'other', 'vol', 'volume', 'complete', 'works', 'selected',
  'story', 'stories', 'book', 'part'])

const significativas = (t) => nu(t).split(' ').filter((p) => p.length > 3 && !VAZIAS.has(p))

/**
 * Quanto dois títulos se parecem, de 0 a 1.
 *
 * Conta quantas palavras significativas do nosso título aparecem no dele. Não
 * é simétrico de propósito: o Gutenberg costuma pôr subtítulo enorme
 * ("The Man Who Was Thursday: A Nightmare"), e o que importa é o nosso título
 * estar inteiro lá dentro, não o dele caber no nosso.
 */
function semelhanca(nosso, deles) {
  const meu = significativas(nosso)
  if (!meu.length) return 0
  const seu = nu(deles)
  // prefixo de 5 letras absorve plural e flexão: "brother" acha "brothers"
  const acertos = meu.filter((p) => seu.includes(p.slice(0, Math.max(5, p.length - 2)))).length
  return acertos / meu.length
}

const caminho = join(PASTA, 'esteira.json')
const dados = JSON.parse(readFileSync(caminho, 'utf8'))

console.log(`conferindo ${dados.plano.length} pares\n`)

const aprovados = []
const recusados = []

for (const [i, p] of dados.plano.entries()) {
  let emIngles = p.titulo
  try { emIngles = await traduzir(p.titulo, { de: 'pt', para: 'en' }) } catch { /* fica o original */ }

  const nota = Math.max(
    semelhanca(emIngles, p.tituloFonte),
    semelhanca(p.titulo, p.tituloFonte),   // título já em inglês ou em alfabeto igual
  )

  const linha = { ...p, tituloEmIngles: emIngles, nota: Number(nota.toFixed(2)) }
  if (nota >= corte) aprovados.push(linha)
  else recusados.push(linha)

  process.stdout.write(`\r  ${i + 1}/${dados.plano.length}  ${aprovados.length} aprovados, ${recusados.length} recusados   `)
}
console.log('\n')

writeFileSync(caminho, JSON.stringify({ ...dados, plano: aprovados, recusados }, null, 1), 'utf8')

console.log(`APROVADOS: ${aprovados.length}     RECUSADOS: ${recusados.length}\n`)
console.log('── aprovados ──')
for (const a of aprovados) {
  console.log(`  ${String(a.nota).padEnd(5)} ${String(a.autor).slice(0, 20).padEnd(20)} ${String(a.titulo).slice(0, 30).padEnd(30)} ← ${String(a.tituloFonte).slice(0, 34)}`)
}
console.log('\n── recusados, e é por isto que a conferência existe ──')
for (const r of recusados) {
  console.log(`  ${String(r.nota).padEnd(5)} ${String(r.autor).slice(0, 20).padEnd(20)} ${String(r.titulo).slice(0, 30).padEnd(30)} ← ${String(r.tituloFonte).slice(0, 34)}`)
}
