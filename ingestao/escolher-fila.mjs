// A fila grande da esteira (05/10/2026): os ~1.000 livros mais lidos do
// Gutenberg que podemos traduzir, escolhidos por REGRA, não um a um.
//
//   node ingestao/escolher-fila.mjs --rdf /dados/gutenberg-rdf/cache/epub --saida /dados/achados/fila-1000.json
//
// Só lê o banco do site. As regras, cada uma com o motivo:
//   - domínio público NO BRASIL: todo autor morto até 1955 (70 anos, art. 41
//     da Lei 9.610); autor sem data de morte fica de fora — sem prova, não entra;
//   - o ORIGINAL do autor: livro com tradutor (marcrel:trl) fica de fora.
//     Foi assim que "Crime e Castigo" entrou em 29/09 traduzido do inglês;
//   - uma língua só, e uma que o motor traduz para o português;
//   - nada de poesia (combinado com o dono: tradução automática estraga verso);
//   - nada de revista, coletânea "Complete Works", dicionário, catálogo,
//     relatório, livro de receitas — não é o que alguém procura numa biblioteca;
//   - nada que já esteja no acervo ou na fila (pelo número do Gutenberg E pelo
//     título do mesmo autor, para não trazer outra edição do mesmo livro);
//   - a mesma obra em duas edições: fica a mais baixada.
// Ordem: downloads dos últimos 30 dias no Gutenberg (o que as pessoas leem).

import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : p }
const RDF = arg('rdf', '/dados/gutenberg-rdf/cache/epub')
const SAIDA = arg('saida', '/dados/achados/fila-1000.json')
const QUANTOS = Number(arg('quantos', 1100))
// as línguas dos clássicos que o leitor procura (finlandês e holandês entravam
// pelo download inflado de lançamento, não por fama)
const LINGUAS = new Set(['en', 'fr', 'de', 'it', 'es', 'ru'])
const ATE_MORTE = 1955

// A LÍNGUA DO AUTOR. O Gutenberg nem sempre marca o tradutor: "La guerre et
// la paix" (Tolstói em francês), "Die Schatzinsel" (Stevenson em alemão),
// "Pinocchio" em inglês entravam como originais. Para os autores que mais
// aparecem, a língua em que ESCREVERAM; livro deles em outra língua é tradução.
const LINGUA_DO_AUTOR = Object.entries({
  en: 'dickens twain austen stevenson defoe swift conrad hardy eliot thackeray scott trollope wells kipling doyle james hawthorne melville poe london cooper irving wilde shaw joyce woolf lawrence burnett montgomery alcott carroll grahame sewell bunyan bacon locke hume mill darwin emerson franklin sterne richardson fielding smollett goldsmith gaskell bronte collins stoker shelley kingsley wallace dreiser crane chopin wharton jerome lytton galsworthy bennett chesterton saki potter barrie nesbit baum burroughs haggard blackmore reade marryat ballantyne henty',
  fr: 'dumas hugo verne zola balzac flaubert maupassant stendhal voltaire rousseau moliere racine corneille diderot montesquieu descartes pascal laclos gautier sand daudet leblanc leroux feval fenelon prevost lesage chateaubriand renan anatole france huysmans',
  de: 'goethe schiller kafka mann hesse lessing heine hoffmann kleist eichendorff storm fontane nietzsche kant schopenhauer marx engels freud zweig schnitzler grimm',
  ru: 'tolstoy dostoyevsky dostoevsky chekhov turgenev gogol pushkin gorky lermontov goncharov',
  es: 'cervantes quevedo galdos valera pardo alarcon blasco unamuno rojas calderon',
  it: 'collodi dannunzio verga manzoni boccaccio dante machiavelli amicis pirandello deledda',
}).flatMap(([l, nomes]) => nomes.split(' ').map((n) => [n, l]))
const linguaDoAutor = new Map(LINGUA_DO_AUTOR)
// teatro em verso: o motor estraga verso, e poesia ficou fora por combinação
const VERSO = /^(shakespeare|marlowe|jonson|dryden|beaumont|fletcher|swinburne|browning|tennyson|byron|milton|addison|webster|kyd)$/
// edição repetida ou pedaço de outra edição do mesmo livro
const EDICAO = /\b(chapters?|illustrated|html edition|retold|young folks|every child can read|junior deluxe|words of one syllable|arranged for representation|a study with the text|original manuscript|facsimile|abridged|selections|condensed|part \d+\.?$|edited for boys|for children|in english)\b/i

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const sobrenome = (nome) => norm(String(nome).split(',')[0])
const NAO_E_LIVRO = /\b(magazine|journal|punch|periodical|review|gazette|almanac|index of|the works of|complete works|collected works|works of|anthology|bibliography|catalogue|catalog|dictionary|encyclop|report|proceedings|transactions|cookbook|cook book|recipes|cookery|handbook|manual of|grammar|vocabulary|reader for|primer|lessons in|census|directory|minutes|register)\b/i
const POESIA = /\b(poetry|poems?|verses?|sonnets?|ballads?|odes?|lyrics|rhymes|hymns?)\b/i

const db = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
const jaTemosId = new Set()
for (const r of db.prepare(`SELECT fonte_url FROM texto WHERE fonte_url LIKE '%gutenberg%'`).all()) {
  const n = /(?:ebooks|epub|files)\/(\d+)/.exec(r.fonte_url ?? '')?.[1]
  if (n) jaTemosId.add(n)
}
for (const r of db.prepare(`SELECT fonte FROM fila_traducao`).all()) {
  const n = /(?:ebooks|epub|files)\/(\d+)/.exec(r.fonte ?? '')?.[1]
  if (n) jaTemosId.add(n)
}
// título normalizado + sobrenome do autor, do acervo e da fila
const jaTemosObra = new Set()
for (const r of db.prepare(`SELECT o.titulo, o.titulo_pt, p.nome FROM obra o
  JOIN obra_pessoa op ON op.obra_id = o.id JOIN pessoa p ON p.id = op.pessoa_id`).all()) {
  const s = norm(r.nome).split(' ').pop()
  jaTemosObra.add(norm(r.titulo) + '|' + s)
  if (r.titulo_pt) jaTemosObra.add(norm(r.titulo_pt) + '|' + s)
}
for (const r of db.prepare(`SELECT titulo, autor FROM fila_traducao`).all()) jaTemosObra.add(norm(r.titulo) + '|' + norm(r.autor).split(' ').pop())

const pega = (xml, re) => re.exec(xml)?.[1]
const todos = (xml, re) => [...xml.matchAll(re)].map((m) => m[1])
const motivo = {}
const fora = (m) => { motivo[m] = (motivo[m] ?? 0) + 1; return null }

function ler(id) {
  const arq = join(RDF, id, `pg${id}.rdf`)
  if (!existsSync(arq)) return null
  const x = readFileSync(arq, 'utf8')
  if (!/<rdf:value>Text<\/rdf:value>/.test(x)) return fora('não é texto')
  if (jaTemosId.has(id)) return fora('já no acervo ou na fila')
  if (/<marcrel:trl/.test(x)) return fora('é tradução')
  const linguas = todos(x, /<dcterms:language>[\s\S]*?<rdf:value[^>]*>([a-z]{2,3})<\/rdf:value>/g)
  if (linguas.length !== 1 || !LINGUAS.has(linguas[0])) return fora('língua')
  const titulo = (pega(x, /<dcterms:title>([\s\S]*?)<\/dcterms:title>/) ?? '').replace(/\s+/g, ' ').trim()
  const autores = [...x.matchAll(/<dcterms:creator>([\s\S]*?)<\/dcterms:creator>/g)].map((m) => ({
    nome: pega(m[1], /<pgterms:name>([\s\S]*?)<\/pgterms:name>/),
    morte: Number(pega(m[1], /<pgterms:deathdate[^>]*>(\d+)</) ?? NaN),
  }))
  if (!autores.length || autores.some((a) => !a.nome)) return fora('sem autor')
  if (autores.some((a) => !(a.morte <= ATE_MORTE))) return fora('autor vivo depois de 1955 ou sem data')
  if (/anonymous|various|unknown/i.test(autores.map((a) => a.nome).join(' '))) return fora('autor anônimo/vários')
  const temas = todos(x, /<rdf:value>([^<]*)<\/rdf:value>/g).join(' | ')
  if (POESIA.test(titulo) || /poetry|poems|verse/i.test(temas)) return fora('poesia')
  if (NAO_E_LIVRO.test(titulo) || /periodicals|reference/i.test(temas)) return fora('não é livro de ler')
  if (EDICAO.test(titulo)) return fora('edição repetida ou adaptada')
  const sob = norm(String(autores[0].nome).split(',')[0]).split(' ').pop()
  if (VERSO.test(sob)) return fora('teatro em verso')
  const original = linguaDoAutor.get(sob)
  if (original && original !== linguas[0]) return fora('tradução não marcada (língua do autor)')
  if (/\bliterature\b/i.test(titulo)) return fora('história da literatura')
  // volume solto de obra maior: o leitor quer a obra, não o tomo 3 de 6
  if (/\b(vol(ume)?\.?|tome|band|part)\s*([2-9]|[1-9]\d|ii|iii|iv|v|vi)\b|\(of \d+\)/i.test(titulo)) return fora('volume solto')
  if (/\bv\.\s*\d+\s*\/\s*\d+/i.test(titulo)) return fora('volume solto')
  const downloads = Number(pega(x, /<pgterms:downloads[^>]*>(\d+)</) ?? 0)
  const s = sobrenome(autores[0].nome).split(' ').pop()
  const tituloCurto = norm(titulo.split(/[:;]/)[0]).replace(/^(the|a|an|le|la|les|der|die|das|el|il|lo) /, '').split(' ').slice(0, 3).join(' ')
  if (jaTemosObra.has(norm(titulo) + '|' + s) || jaTemosObra.has(tituloCurto + '|' + s)) return fora('mesma obra já no acervo')
  // JSON ida e volta: recorte de string no V8 segura o ARQUIVO inteiro de
  // onde saiu, e 79 mil arquivos estouraram 1 GB na primeira tentativa
  return JSON.parse(JSON.stringify({ gid: Number(id), titulo, autor: autores.map((a) => a.nome).join('; '),
    morte: Math.max(...autores.map((a) => a.morte)), idioma: linguas[0], downloads,
    chave: tituloCurto + '|' + s, temas: temas.slice(0, 600) }))
}

const lista = []
for (const id of readdirSync(RDF)) { const r = /^\d+$/.test(id) && ler(id); if (r) lista.push(r) }
// LANÇAMENTO recente (número alto) tem download inflado no primeiro mês:
// conta um décimo, para o clássico lido há anos vir antes da novidade
// FAMA: livro numa estante curada do próprio Gutenberg vem antes de tudo
const CURADAS = /Best Books Ever|Harvard Classics|Banned Books|Classics of Literature|Category: Classics/i
const peso = (r) => (CURADAS.test(r.temas) ? 1e9 : 0) + (r.gid >= 74000 ? r.downloads / 10 : r.downloads)
lista.sort((a, b) => peso(b) - peso(a))
const vistas = new Set()
const escolhidos = []
for (const r of lista) {
  if (vistas.has(r.chave)) { fora('outra edição da mesma obra'); continue }
  vistas.add(r.chave)
  escolhidos.push(r)
  if (escolhidos.length >= QUANTOS) break
}
writeFileSync(SAIDA, JSON.stringify(escolhidos, null, 1))
console.log(`${lista.length} candidatos passaram nas regras; ${escolhidos.length} escolhidos em ${SAIDA}`)
console.log('fora, por motivo:', JSON.stringify(motivo))
console.log('por língua:', JSON.stringify(escolhidos.reduce((m, r) => (m[r.idioma] = (m[r.idioma] ?? 0) + 1, m), {})))
console.log('em estante curada:', escolhidos.filter((r) => CURADAS.test(r.temas)).length, 'de', lista.filter((r) => CURADAS.test(r.temas)).length, 'possíveis')
console.log('downloads do 1º, do 500º e do último:', escolhidos[0]?.downloads, escolhidos[499]?.downloads, escolhidos.at(-1)?.downloads)
