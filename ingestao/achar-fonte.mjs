// Achar, para cada obra da fila, ONDE está o original que dá para traduzir.
//
//   node ingestao/achar-fonte.mjs --banco dados/catalogo.db [--quantas 60]
//
// A fila (`fila-de-traducao.mjs`) diz QUAIS obras podem ser traduzidas. Este
// diz ONDE está o texto de partida de cada uma. Sem ele, cada livro custa uma
// pesquisa manual, e cento e cinquenta e sete pesquisas manuais não é esteira,
// é artesanato.
//
// ─────────────────────────────────────────────────────────────
// O PROBLEMA DE NOME, que é o motivo de isto ter dois passos
//
// O nosso catálogo diz "A metamorfose". O Gutenberg tem "Metamorphosis" e
// "Die Verwandlung". Procurar "A metamorfose" lá não acha nada, e procurar só
// por "Kafka" acha catorze livros sem dizer qual é qual.
//
// A ponte é a Open Library: 433 obras do acervo já trazem o `olid_work`, e a
// ficha de lá tem o título como o mundo o conhece. Com esse título e o
// sobrenome do autor, o Gutenberg responde.
//
// Quem não tem `olid_work` cai no plano B — o próprio título, que funciona
// para autor de língua portuguesa e falha para o resto. Falhar aqui é barato:
// a obra fica sem fonte e aparece no relatório, para alguém apontar à mão.
// ─────────────────────────────────────────────────────────────
//
// A CONFERÊNCIA DE AUTOR, que não é opcional
//
// Busca por texto livre traz lixo — neste projeto já trouxe a capa de
// "Desenhos Astrais" para o Frankl. Aqui o estrago seria pior: traduzir e
// publicar o livro errado com o nome certo na capa.
//
// Então todo resultado passa por duas provas. O SOBRENOME tem que bater, sem
// acento e sem caixa. E o ANO DE MORTE que o Gutenberg informa tem que bater
// com o que o nosso banco tem, quando os dois souberem — é a prova mais forte
// que existe de graça, porque dois autores homônimos raramente morrem no
// mesmo ano.

import { DatabaseSync } from 'node:sqlite'
import { traduzir } from './motor-traducao.mjs'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const banco = arg('banco', join(RAIZ, 'dados', 'catalogo.db'))
const quantas = Number(arg('quantas', 200))
const ANO = new Date().getFullYear()
const db = new DatabaseSync(banco)

const nu = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function json(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!r.ok) throw new Error(`${r.status} em ${url}`)
  return r.json()
}

/** O sobrenome, que é a parte do nome que sobrevive à tradução do resto. */
function sobrenome(nome) {
  const partes = nu(nome).replace(/[.,]/g, ' ').split(/\s+/).filter((p) => p.length > 2)
  return partes.at(-1) ?? ''
}

// ─────────────────────────────────────────────────────────────

/**
 * O título como o Gutenberg o chama — e como se descobre isso.
 *
 * Tentei duas coisas antes desta, e as duas falharam por motivos que valem
 * ficar escritos:
 *
 *   A OPEN LIBRARY não serve. `olid_work` aponta para a ficha que a nossa
 *   ingestão escolheu, e ela costuma ser a EDIÇÃO PORTUGUESA: OL16983847W
 *   devolve "A metamorfose", que é exatamente o título que não ajuda.
 *
 *   O WIKIDATA não serve por rótulo exato. "A metamorfose" não bate com o
 *   rótulo que eles guardam, e casar por semelhança abre a porta que este
 *   projeto já aprendeu a manter fechada.
 *
 * O que serve é o tradutor que já está aqui. "A metamorfose" vira
 * "The metamorphosis", e o Gutenberg responde. Usar a nossa própria máquina
 * de tradução para achar o que traduzir tem uma simetria que agrada, e não
 * custa nada: um título são cinco palavras.
 */
async function tituloEmIngles(titulo) {
  try { return await traduzir(titulo, { de: 'pt', para: 'en' }) }
  catch { return titulo }
}

/**
 * O melhor exemplar do Gutenberg para esta obra, ou nada.
 *
 * "Melhor" é, em ordem: a língua original da obra, porque traduzir do original
 * é o ponto; depois o inglês, que é o que mais existe lá. Traduzir de uma
 * TRADUÇÃO do Gutenberg é legítimo — tudo que ele hospeda já caiu em domínio
 * público, tradutor incluído — e fica registrado na ficha de onde veio.
 */
async function noGutenberg(titulo, autor, morte, idiomaOriginal) {
  const alvo = sobrenome(autor)
  if (!alvo) return null

  // A busca é pelo TÍTULO SÓ, e não por título mais sobrenome.
  //
  // Sobrenome não sobrevive à travessia de alfabeto: nós escrevemos "Tolstói"
  // e o Gutenberg escreve "Tolstoy"; "Dostoiévski" lá é "Dostoyevsky". Pôr o
  // sobrenome na busca fazia "War and Peace" não achar Guerra e Paz.
  const busca = encodeURIComponent(titulo)
  let achados
  try { achados = (await json(`https://gutendex.com/books?search=${busca}`)).results ?? [] }
  catch { return null }

  const bons = achados.filter((b) => {
    // O ANO DE MORTE é a prova que atravessa qualquer alfabeto: Tolstói e
    // Tolstoy morreram os dois em 1910. O sobrenome vira o plano B, e ainda
    // assim só pelo começo, porque é o fim que as transliterações mudam.
    const casaAutor = (b.authors ?? []).some((a) => {
      if (morte && a.death_year) return Math.abs(a.death_year - morte) <= 1
      return nu(a.name).includes(alvo.slice(0, 5))
    })
    if (!casaAutor) return false
    // título tem que ter alguma palavra grande em comum, senão é outro livro
    const nossas = nu(titulo).split(/\s+/).filter((p) => p.length > 3)
    const deles = nu(b.title)
    return nossas.length === 0 || nossas.some((p) => deles.includes(p))
  })
  if (!bons.length) return null

  const ordem = [idiomaOriginal, 'en', 'fr', 'de', 'it', 'es'].filter(Boolean)
  bons.sort((a, b) => {
    const pa = ordem.indexOf(a.languages?.[0]) < 0 ? 99 : ordem.indexOf(a.languages[0])
    const pb = ordem.indexOf(b.languages?.[0]) < 0 ? 99 : ordem.indexOf(b.languages[0])
    return pa - pb || (b.download_count ?? 0) - (a.download_count ?? 0)
  })

  const b = bons[0]
  const url = b.formats['text/plain; charset=utf-8']
    ?? b.formats['text/plain']
    ?? b.formats['text/html']
  if (!url || /\.zip$/i.test(url)) return null

  return {
    fonte: url,
    de: b.languages?.[0] ?? 'en',
    tituloFonte: b.title,
    gutenberg: b.id,
    morteDaFonte: b.authors?.[0]?.death_year ?? null,
  }
}

// ─────────────────────────────────────────────────────────────

const fila = db.prepare(`
  SELECT o.id, o.titulo, o.idioma_original, o.olid_work,
         p.id autor_id, p.nome autor, p.morte,
         (SELECT COUNT(*) FROM trilha_item ti WHERE ti.obra_id = o.id) em_trilha
    FROM obra o
    LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
    LEFT JOIN pessoa p ON p.id = op.pessoa_id
   WHERE o.publicada = 1
     AND p.morte IS NOT NULL AND p.morte + 71 <= ?
     AND NOT EXISTS (SELECT 1 FROM texto t WHERE t.obra_id = o.id AND t.normalizado = 1)
   ORDER BY em_trilha DESC, p.nome
   LIMIT ?`).all(ANO, quantas)

console.log(`${fila.length} obras na fila\n`)

const plano = []
const semFonte = []
const gravaMorte = db.prepare('UPDATE pessoa SET morte = ? WHERE id = ? AND morte IS NULL')

for (const [i, o] of fila.entries()) {
  const titulo = await tituloEmIngles(o.titulo)

  const achado = await noGutenberg(titulo, o.autor, o.morte, o.idioma_original)
  if (achado) {
    plano.push({
      obra: o.id, titulo: o.titulo, autor: o.autor, morte: o.morte,
      emTrilha: o.em_trilha, ...achado,
      saida: `obra${o.id}`,
    })
    // o Gutenberg sabe o ano de morte, e ele é de graça
    if (!o.morte && achado.morteDaFonte) gravaMorte.run(achado.morteDaFonte, o.autor_id)
  } else {
    semFonte.push({ obra: o.id, titulo: o.titulo, autor: o.autor, tentou: titulo })
  }

  process.stdout.write(`\r  ${i + 1}/${fila.length}  ${plano.length} com fonte, ${semFonte.length} sem   `)
  await dormir(350)   // gutendex e openlibrary são gratuitos
}
console.log('\n')

const caminho = join(RAIZ, 'dados', 'traducoes', 'esteira.json')
writeFileSync(caminho, JSON.stringify({ feito_em: new Date().toISOString(), plano, semFonte }, null, 1), 'utf8')

console.log(`COM FONTE: ${plano.length}     SEM: ${semFonte.length}`)
console.log(`plano em ${caminho}\n`)

console.log('── as que estão em prateleira e têm fonte ──')
for (const p of plano.filter((x) => x.emTrilha).slice(0, 40)) {
  console.log(`  ${String(p.obra).padStart(5)} ${p.de}  ${String(p.autor).slice(0, 22).padEnd(22)} ${String(p.titulo).slice(0, 32).padEnd(32)} ← ${p.tituloFonte.slice(0, 30)}`)
}

if (semFonte.filter((x) => x.tentou).length) {
  console.log('\n── em prateleira e sem fonte achada ──')
  for (const s of semFonte.slice(0, 15)) {
    console.log(`  ${String(s.obra).padStart(5)} ${String(s.autor).slice(0, 22).padEnd(22)} ${String(s.titulo).slice(0, 34)}`)
  }
}
