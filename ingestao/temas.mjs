// Categorias de verdade.
//
// O catálogo do Gutenberg traz duas colunas que a primeira ingestão jogou
// fora: `Bookshelves` (estantes, já curadas por gente) e `Subjects` (assunto
// no padrão da Biblioteca do Congresso). São elas que viram as prateleiras
// do site.
//
//   node ingestao/temas.mjs

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, fechar, RAIZ } from '../servidor/banco/base.mjs'
import { lerCSV } from './csv.mjs'

// A taxonomia é em português e é NOSSA — não a do Gutenberg, que mistura
// idioma, século e gênero na mesma lista. Cada linha: o tema, e o que o
// puxa. A ordem importa: o primeiro que casar define o tema principal.
const TAXONOMIA = [
  ['Romance',              ['category: novels', 'historical novels', 'pt romance', 'category: romance', 'fiction --', 'portuguese fiction', 'brazilian fiction']],
  ['Contos',               ['short stories', 'pt contos', 'category: short stories']],
  ['Poesia',               ['category: poetry', 'pt poesia', 'poetry', 'portuguese poetry', 'brazilian poetry']],
  ['Teatro',               ['plays/films/dramas', 'pt teatro', 'drama']],
  ['História',             ['category: history', 'pt história', 'history --', '-- history']],
  ['Política e sociedade', ['category: politics', 'pt política e sociedade', 'politics and government', 'sociology', 'social']],
  ['Filosofia',            ['philosophy & ethics', 'philosophy', 'ethics']],
  ['Biografia e memórias', ['category: biographies', 'pt biografia', 'biography', 'autobiography', 'correspondence', 'diaries']],
  ['Crônica e ensaio',     ['essays, letters & speeches', 'essays', 'speeches', 'periodicals']],
  ['Viagem',               ['travel writing', 'voyages and travels', 'description and travel']],
  ['Religião e mito',      ['religion/spirituality', 'mythology, legends & folklore', 'religion', 'mythology', 'folklore', 'bible']],
  ['Humor',                ['category: humour', 'humor', 'satire']],
  ['Ficção científica',    ['science fiction', 'category: science fiction']],
  ['Mistério e policial',  ['detective and mystery', 'crime', 'category: crime']],
  ['Aventura',             ['adventure', 'category: adventure']],
  ['Direito',              ['law', 'constitutional', 'jurisprudence', 'legislation']],
  ['Ciência',              ['category: science', 'natural history', 'medicine', 'astronomy', 'agricultur']],
  ['Arte',                 ['category: art', 'art --', 'music', 'architecture', 'painting']],
  ['Infantojuvenil',       ['children', 'juvenile', 'fairy tales']],
  ['Crítica literária',    ['history and criticism', 'literature --']],
]

const RESUMOS = {
  'Romance': 'Histórias longas, com personagens que mudam do começo ao fim.',
  'Contos': 'Histórias curtas — dá para ler uma por noite.',
  'Poesia': 'Verso. Nem sempre para ler do começo ao fim.',
  'Teatro': 'Escrito para ser dito em voz alta.',
  'História': 'O que aconteceu, contado por quem estudou.',
  'Política e sociedade': 'Como o poder se organiza, e o que ele faz com as pessoas.',
  'Filosofia': 'As perguntas que não têm resposta pronta.',
  'Biografia e memórias': 'Uma vida contada — pelo próprio ou por outro.',
  'Crônica e ensaio': 'Texto curto sobre o mundo, com opinião assumida.',
  'Viagem': 'Quem foi, viu e escreveu.',
  'Religião e mito': 'As histórias que as sociedades contam sobre si mesmas.',
  'Humor': 'Feito para rir — e, às vezes, para cutucar.',
  'Ficção científica': 'O futuro como jeito de falar do presente.',
  'Mistério e policial': 'Alguém escondeu alguma coisa.',
  'Aventura': 'Movimento, risco e mundo grande.',
  'Direito': 'A norma, e o argumento sobre ela.',
  'Ciência': 'O mundo explicado por quem mediu.',
  'Arte': 'Sobre o que se olha e se ouve.',
  'Infantojuvenil': 'Escrito para os novos, e não só para eles.',
  'Crítica literária': 'Livros sobre livros.',
}

const banco = abrir()
const csv = lerCSV(readFileSync(join(RAIZ, 'dados', 'pg_catalog.csv'), 'utf8'))
const porGutenberg = new Map(csv.map(r => [r['Text#'], r]))

const poeTema = banco.prepare('INSERT OR IGNORE INTO tema (nome, resumo) VALUES (?,?)')
const achaTema = banco.prepare('SELECT id FROM tema WHERE nome = ?')
for (const [nome] of TAXONOMIA) poeTema.run(nome, RESUMOS[nome] ?? null)
const idTema = new Map(TAXONOMIA.map(([nome]) => [nome, Number(achaTema.get(nome).id)]))

const obras = banco.prepare(
  `SELECT o.id, t.fonte_id FROM obra o JOIN texto t ON t.obra_id = o.id
    WHERE t.fonte = 'gutenberg'`).all()

const guardaCru = banco.prepare('UPDATE obra SET assuntos = ?, estantes = ? WHERE id = ?')
const ligaTema = banco.prepare('INSERT OR REPLACE INTO obra_tema (obra_id, tema_id, peso) VALUES (?,?,?)')
const limpaTemas = banco.prepare('DELETE FROM obra_tema WHERE obra_id = ?')

let classificadas = 0
let semTema = 0
const conta = new Map()

banco.exec('BEGIN')
for (const o of obras) {
  const r = porGutenberg.get(o.fonte_id)
  if (!r) continue
  guardaCru.run(r.Subjects, r.Bookshelves, o.id)

  const pista = `${r.Bookshelves} ; ${r.Subjects}`.toLowerCase()
  limpaTemas.run(o.id)

  // O peso é o que ordena a prateleira: o primeiro tema que casa é o
  // principal (peso 1), os outros entram como secundários.
  let posicao = 0
  for (const [nome, chaves] of TAXONOMIA) {
    if (!chaves.some(c => pista.includes(c))) continue
    ligaTema.run(o.id, idTema.get(nome), posicao === 0 ? 1 : 0.5)
    conta.set(nome, (conta.get(nome) ?? 0) + 1)
    posicao++
    if (posicao >= 3) break
  }
  if (posicao) classificadas++
  else semTema++
}
banco.exec('COMMIT')

console.log(`classificadas ... ${classificadas}`)
console.log(`sem tema ........ ${semTema}`)
console.log('\nprateleiras:')
for (const [nome, n] of [...conta].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${nome}`)
}
fechar()
