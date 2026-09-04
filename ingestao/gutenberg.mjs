// Ingestão do Project Gutenberg.
//
// Pelo catálogo em massa (21 MB de CSV), nunca pela API pública — martelar a
// API de um projeto sem fins lucrativos para pegar 60 mil registros é falta de
// educação, e leva a bloqueio.
//
//   node ingestao/gutenberg.mjs           # português + a trilha em inglês
//   node ingestao/gutenberg.mjs --tudo    # tudo, para ver o tamanho do bicho
//
// Roda fora do site. Pode demorar. É essa a ideia.

import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, fechar, RAIZ, direitoBR, direitoUS, trilhoDe } from '../servidor/banco/base.mjs'
import { lerCSV, lerAutor } from './csv.mjs'

const CATALOGO = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv'
const CACHE = join(RAIZ, 'dados', 'pg_catalog.csv')
const VALIDADE = 7 * 24 * 3600 * 1000

// A trilha "Poder e sociedade" — o cânone que a proposta pede.
// Medido: TODO ele existe no Gutenberg em inglês, e NENHUM em português.
// Está em docs/ACERVO.md; esta lista é a prova executável daquela tabela.
const TRILHA_PODER = [
  { autor: 'Machiavelli', titulo: 'The Prince' },
  { autor: 'Hobbes', titulo: 'Leviathan' },
  { autor: 'Rousseau', titulo: 'The Social Contract' },
  { autor: 'Mill, John Stuart', titulo: 'On Liberty' },
  { autor: 'Plato', titulo: 'The Republic' },
  { autor: 'Tocqueville', titulo: 'Democracy in America' },
  { autor: 'Thoreau', titulo: 'Civil Disobedience' },
  { autor: 'Le Bon', titulo: 'The Crowd' },
  { autor: 'London, Jack', titulo: 'The Iron Heel' },
  { autor: 'Kafka', titulo: 'The Trial' },
  { autor: 'More, Thomas', titulo: 'Utopia' },
  { autor: 'Wollstonecraft', titulo: 'A Vindication of the Rights of Woman' },
  { autor: 'Swift, Jonathan', titulo: "Gulliver's Travels" },
  { autor: 'Zola', titulo: 'Germinal' },
]

async function baixarCatalogo() {
  mkdirSync(join(RAIZ, 'dados'), { recursive: true })
  if (existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < VALIDADE) {
    console.log(`catálogo em cache (${(statSync(CACHE).size / 1e6).toFixed(1)} MB)`)
    return readFileSync(CACHE, 'utf8')
  }
  console.log('baixando o catálogo do Gutenberg…')
  const r = await fetch(CATALOGO, { headers: { 'user-agent': 'fio/0.1 (biblioteca pessoal)' } })
  if (!r.ok) throw new Error(`Gutenberg respondeu ${r.status}`)
  const txt = await r.text()
  writeFileSync(CACHE, txt)
  console.log(`  ${(txt.length / 1e6).toFixed(1)} MB`)
  return txt
}

function selecionar(registros, tudo) {
  if (tudo) return registros.filter(r => r.Type === 'Text')

  const pt = registros.filter(r => r.Type === 'Text' && r.Language === 'pt')
  const en = []
  for (const alvo of TRILHA_PODER) {
    const achou = registros.find(
      r =>
        r.Type === 'Text' &&
        r.Language === 'en' &&
        r.Authors.toLowerCase().includes(alvo.autor.toLowerCase()) &&
        r.Title.toLowerCase().includes(alvo.titulo.toLowerCase()),
    )
    if (achou) en.push(achou)
    else console.warn(`  ! não achei: ${alvo.autor} — ${alvo.titulo}`)
  }
  return [...pt, ...en]
}

function main() {
  const tudo = process.argv.includes('--tudo')
  const banco = abrir()

  return baixarCatalogo().then(csv => {
    console.log('lendo o CSV…')
    const registros = lerCSV(csv)
    console.log(`  ${registros.length} registros`)

    const escolhidos = selecionar(registros, tudo)
    console.log(`  ${escolhidos.length} selecionados\n`)

    const acha = {
      pessoa: banco.prepare('SELECT id FROM pessoa WHERE nome_ordem = ?'),
      texto: banco.prepare("SELECT id FROM texto WHERE fonte = 'gutenberg' AND fonte_id = ?"),
    }
    const poe = {
      pessoa: banco.prepare('INSERT INTO pessoa (nome, nome_ordem, nascimento, morte) VALUES (?,?,?,?)'),
      obra: banco.prepare(
        `INSERT INTO obra (titulo, ano, idioma_original, trilho, publicada)
         VALUES (?,?,?,?,1)`),
      obraPessoa: banco.prepare('INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,?)'),
      texto: banco.prepare(
        `INSERT INTO texto (obra_id, idioma, fonte, fonte_id, fonte_url, formato, normalizado)
         VALUES (?,?,'gutenberg',?,?,'epub',0)`),
      direito: banco.prepare(
        `INSERT OR REPLACE INTO direito (texto_id, jurisdicao, estado, livre_em, motivo, verificado_por, verificado_em)
         VALUES (?,?,?,?,?,'calculo',datetime('now'))`),
      obraTrilho: banco.prepare('UPDATE obra SET trilho = ? WHERE id = ?'),
      textoTradutor: banco.prepare('UPDATE texto SET tradutor_id = ? WHERE id = ?'),
      busca: banco.prepare(
        'INSERT INTO busca_obra (titulo, titulo_pt, autores, temas, resumo, conteudo_obra_id) VALUES (?,?,?,?,?,?)'),
    }

    const contas = { novas: 0, repetidas: 0, A: 0, B: 0, semAutor: 0, semMorte: 0 }

    banco.exec('BEGIN')
    for (const r of escolhidos) {
      const gid = r['Text#']
      if (acha.texto.get(gid)) { contas.repetidas++; continue }

      // ── autores
      const brutos = r.Authors.split(';').map(s => s.trim()).filter(Boolean)
      const autores = brutos.map(lerAutor).filter(Boolean)
      if (!autores.length) contas.semAutor++
      const ids = autores.map(a => {
        const ja = acha.pessoa.get(a.nome_ordem)
        if (ja) return { id: Number(ja.id), ...a }
        const res = poe.pessoa.run(a.nome, a.nome_ordem, a.nascimento, a.morte)
        return { id: Number(res.lastInsertRowid), ...a }
      })

      // O ano do registro é o de publicação no Gutenberg, não o da obra.
      // Melhor não ter o dado do que ter o dado errado: fica nulo até o
      // Wikidata preencher.
      const obraId = Number(poe.obra.run(r.Title, null, r.Language, 'B').lastInsertRowid)
      for (const a of ids) {
        // obra_pessoa guarda só quem é da OBRA. Tradutor é do TEXTO, e entra
        // no cálculo de direito abaixo — não como autor da obra.
        if (a.papel !== 'tradutor') poe.obraPessoa.run(obraId, a.id, a.papel)
      }

      const textoId = Number(
        poe.texto.run(obraId, r.Language, gid, `https://www.gutenberg.org/ebooks/${gid}`).lastInsertRowid,
      )

      // ── direito, por jurisdição
      const tradutor = ids.find(a => a.papel === 'tradutor')
      if (tradutor) poe.textoTradutor.run(tradutor.id, textoId)

      if (ids.some(a => !a.morte)) contas.semMorte++
      const br = { jurisdicao: 'BR', ...direitoBR({ creditados: ids }) }
      const us = { jurisdicao: 'US', ...direitoUS({ ano: null, fonte: 'gutenberg' }) }
      poe.direito.run(textoId, 'BR', br.estado, br.livre_em, br.motivo)
      poe.direito.run(textoId, 'US', us.estado, us.livre_em, us.motivo)

      const trilho = trilhoDe(true, [br, us])
      poe.obraTrilho.run(trilho, obraId)
      contas[trilho]++

      poe.busca.run(
        r.Title, null,
        ids.map(a => a.nome).join(', '),
        r.Subjects.replaceAll(';', ' '),
        '', obraId,
      )
      contas.novas++
    }
    banco.exec('COMMIT')

    console.log('─'.repeat(56))
    console.log(`obras novas ............ ${contas.novas}`)
    console.log(`já estavam ............. ${contas.repetidas}`)
    console.log(`trilho A (dá para ler) . ${contas.A}`)
    console.log(`trilho B (referência) .. ${contas.B}`)
    console.log(`sem autor identificado . ${contas.semAutor}`)
    console.log(`com creditado sem morte  ${contas.semMorte}  ← estes ficam "desconhecido" no Brasil`)
    console.log('─'.repeat(56))

    const porEstado = banco.prepare(
      `SELECT jurisdicao, estado, COUNT(*) n FROM direito GROUP BY 1,2 ORDER BY 1,3 DESC`).all()
    console.log('\ndireito por jurisdição:')
    for (const l of porEstado) console.log(`  ${l.jurisdicao}  ${String(l.estado).padEnd(16)} ${l.n}`)

    fechar()
  })
}

main().catch(e => { console.error(e); process.exit(1) })
