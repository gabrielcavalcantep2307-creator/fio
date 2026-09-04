// Os autores que importam, mesmo os que não podemos hospedar.
//
// Uma biblioteca em que não existe Foucault, Dostoiévski nem Tartuce não é uma
// biblioteca — é o que sobrou do domínio público. Estes entram pelo TRILHO B:
// ficha completa, capa, o que é a obra e onde encontrá-la. Sem arquivo, e sem
// fingir que tem.
//
// A fonte é a Open Library (dados CC0) e as capas são servidas por ela, que é
// exatamente para isso que a API de capas existe — a gente não baixa em massa.
//
//   node ingestao/autores.mjs            # a lista inteira
//   node ingestao/autores.mjs --so 20    # os 20 primeiros, para testar

import { abrir, fechar } from '../servidor/banco/base.mjs'
import { LISTA, TEMAS_NOVOS } from './lista-de-autores.mjs'

const PAUSA = 1100 // a Open Library pede 1 requisição por segundo. Respeita-se.
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'
const POR_AUTOR = 8

// ─────────────────────────────────────────────────────────────
// "Isto está em português?"
//
// A busca com language=por devolve a OBRA que tem edição em português — e o
// título vem no idioma original. "Discipline and Punish" e "Vigiar e punir"
// são a mesma obra, e só a segunda serve num site em português.
// ─────────────────────────────────────────────────────────────

const PT_PALAVRAS = /\b(de|da|do|dos|das|em|uma|um|uns|sobre|para|como|não|nao|no|na|nos|nas|pelo|pela|entre|contra|ao|à|aos|às|que|seu|sua|com|por|é|ser|ou)\b/gi
const EN_PALAVRAS = /\b(the|of|and|with|from|their|his|her|its|what|why|how|into|about|through|being|other|between|against|toward)\b/gi
const PT_LETRAS = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/g

function pareceportugues(titulo) {
  const en = (titulo.match(EN_PALAVRAS) || []).length
  if (en >= 1) return false
  const pt = (titulo.match(PT_PALAVRAS) || []).length
  const letras = (titulo.match(PT_LETRAS) || []).length
  // título de uma palavra só não dá para julgar: aceita, porque errar para o
  // lado de mostrar uma obra real custa menos que esvaziar o catálogo
  const palavras = titulo.trim().split(/\s+/).length
  return pt >= 1 || letras >= 1 || palavras <= 2
}

async function buscar(autor) {
  const url = 'https://openlibrary.org/search.json?' + new URLSearchParams({
    author: autor,
    language: 'por',
    limit: '24',
    fields: 'key,title,author_name,first_publish_year,cover_i,edition_count,subject',
  })
  const r = await fetch(url, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`Open Library respondeu ${r.status}`)
  const j = await r.json()
  return (j.docs ?? [])
    .filter(d => d.title && pareceportugues(d.title))
    // mais edições = obra mais central na bibliografia do autor
    .sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0))
    .slice(0, POR_AUTOR)
}

// ─────────────────────────────────────────────────────────────

const banco = abrir()

const sql = {
  achaPessoa: banco.prepare('SELECT id FROM pessoa WHERE nome = ?'),
  poePessoa: banco.prepare('INSERT INTO pessoa (nome, nome_ordem, morte) VALUES (?,?,?)'),
  achaObra: banco.prepare('SELECT id FROM obra WHERE olid_work = ?'),
  poeObra: banco.prepare(
    `INSERT INTO obra (titulo, ano, idioma_original, olid_work, trilho, publicada, capa_externa, assuntos)
     VALUES (?,?,'pt',?,'B',1,?,?)`),
  liga: banco.prepare('INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,?)'),
  achaTema: banco.prepare('SELECT id FROM tema WHERE nome = ?'),
  poeTema: banco.prepare('INSERT OR REPLACE INTO obra_tema (obra_id, tema_id, peso) VALUES (?,?,?)'),
  poeDisp: banco.prepare(
    `INSERT INTO disponibilidade (obra_id, tipo, provedor, rotulo, url, idioma)
     VALUES (?,?,?,?,?,'pt')`),
  busca: banco.prepare(
    'INSERT INTO busca_obra (titulo, titulo_pt, autores, temas, resumo, conteudo_obra_id) VALUES (?,?,?,?,?,?)'),
}

// os temas que só existem por causa desta lista
const poeTemaNovo = banco.prepare('INSERT OR IGNORE INTO tema (nome, resumo) VALUES (?,?)')
for (const [nome, resumo] of Object.entries(TEMAS_NOVOS)) poeTemaNovo.run(nome, resumo)

const limite = process.argv.includes('--so') ? Number(process.argv[process.argv.indexOf('--so') + 1]) : LISTA.length
const fila = LISTA.slice(0, limite)

let novas = 0, repetidas = 0, vazios = []
for (const [k, { nome, tema }] of fila.entries()) {
  process.stdout.write(`[${String(k + 1).padStart(3)}/${fila.length}] ${nome.padEnd(34)}`)
  let achados = []
  try { achados = await buscar(nome) } catch (e) { console.log(`erro: ${e.message.slice(0, 30)}`); continue }
  if (!achados.length) { console.log('nada em português'); vazios.push(nome); await pausa(); continue }

  const pessoa = sql.achaPessoa.get(nome)
    ?? { id: sql.poePessoa.run(nome, nome, null).lastInsertRowid }
  const temaId = sql.achaTema.get(tema)?.id

  let entraram = 0
  banco.exec('BEGIN')
  for (const d of achados) {
    if (sql.achaObra.get(d.key)) { repetidas++; continue }
    const obraId = Number(sql.poeObra.run(
      d.title, d.first_publish_year ?? null, d.key,
      d.cover_i ? String(d.cover_i) : null,
      (d.subject ?? []).slice(0, 12).join('; '),
    ).lastInsertRowid)

    sql.liga.run(obraId, Number(pessoa.id), 'autor')
    if (temaId) sql.poeTema.run(obraId, Number(temaId), 1)

    sql.poeDisp.run(obraId, 'previa', 'Open Library', 'ficha e edições',
      `https://openlibrary.org${d.key}`)
    sql.poeDisp.run(obraId, 'compra', 'Estante Virtual', 'procurar usado e novo',
      `https://www.estantevirtual.com.br/busca?q=${encodeURIComponent(`${d.title} ${nome}`)}`)

    sql.busca.run(d.title, d.title, nome, `${tema} ${(d.subject ?? []).slice(0, 8).join(' ')}`, '', obraId)
    entraram++; novas++
  }
  banco.exec('COMMIT')
  console.log(`${String(entraram).padStart(2)} obras`)
  await pausa()
}

console.log(`\nobras novas ..... ${novas}`)
console.log(`já estavam ...... ${repetidas}`)
if (vazios.length) console.log(`sem nada em pt .. ${vazios.length}: ${vazios.slice(0, 12).join(', ')}${vazios.length > 12 ? '…' : ''}`)
fechar()

function pausa() { return new Promise(r => setTimeout(r, PAUSA)) }
