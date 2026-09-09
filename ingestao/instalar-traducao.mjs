// Pôr no catálogo uma tradução que já saiu pronta.
//
//   node ingestao/instalar-traducao.mjs --arquivo bichos --obra 1051 \
//     [--banco dados/catalogo.db] [--morte 1950]
//
// Separado de `traduzir-obra.mjs` de propósito: traduzir custa minutos de
// máquina e instalar custa um INSERT. Juntar os dois faria cada erro de SQL
// custar o livro inteiro de novo.
//
// O que este script grava, além do texto:
//
//   O RÓTULO. `texto.revisao = 'automatica'` e um `aviso` que o leitor vê na
//   ficha e na primeira página. Uma biblioteca que apresenta tradução de
//   máquina como se fosse de gente está mentindo sobre o próprio acervo, e
//   este projeto inteiro é construído sobre não fazer isso.
//
//   O ORIGINAL. `fonte_url` guarda de onde veio o texto em inglês, para
//   qualquer um conferir a tradução contra ele.
//
//   O DIREITO. Uma linha em `direito` dizendo por que esta obra pode estar
//   aqui, com a jurisdição junto — porque Animal Farm é domínio público no
//   Brasil e segue protegido nos Estados Unidos até 2041.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { limpar } from './normalizar.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const nome = arg('arquivo')
const obraId = Number(arg('obra'))
const banco = arg('banco', join(RAIZ, 'dados', 'catalogo.db'))
const morte = Number(arg('morte', 0))
const jurisdicao = arg('jurisdicao', 'BR')

if (!nome || !obraId) {
  console.error('uso: --arquivo <nome> --obra <id> [--banco ...] [--morte 1950]')
  process.exit(1)
}

const t = JSON.parse(readFileSync(join(RAIZ, 'dados', 'traducoes', `${nome}.json`), 'utf8'))
const db = new DatabaseSync(banco)

const obra = db.prepare('SELECT id, titulo, trilho FROM obra WHERE id = ?').get(obraId)
if (!obra) { console.error(`obra ${obraId} não existe em ${banco}`); process.exit(1) }

// Rodar duas vezes não pode empilhar duas traduções da mesma obra.
const jaTem = db.prepare(
  "SELECT id FROM texto WHERE obra_id = ? AND fonte = 'fio_traducao'").get(obraId)
if (jaTem) {
  console.log(`obra ${obraId} já tem tradução nossa (texto ${jaTem.id}). Apagando para regravar.`)
  db.prepare('DELETE FROM texto WHERE id = ?').run(jaTem.id)
}

const AVISO = 'Tradução automática do Fio, sem revisão humana, feita a partir '
  + 'do original. O texto de origem fica no link da ficha, para conferência.'

const palavras = t.capitulos.reduce((a, c) => a + c.palavras, 0)

db.exec('BEGIN')
try {
  const textoId = Number(db.prepare(`
    INSERT INTO texto (obra_id, idioma, fonte, fonte_url, formato, revisao, aviso,
                       normalizado, palavras)
    VALUES (?, 'pt', 'fio_traducao', ?, 'html', 'automatica', ?, 1, ?)`)
    .run(obraId, t.fonte, AVISO, palavras).lastInsertRowid)

  const poe = db.prepare(
    'INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,?,?,?,?)')
  for (const c of t.capitulos) {
    // Passa pelo saneador como qualquer texto de fora. O corpo do capítulo
    // vai para `dangerouslySetInnerHTML` no leitor, e "veio de nós" não é
    // motivo para abrir exceção: a exceção é que vira o buraco.
    poe.run(textoId, c.ordem, c.titulo, limpar(c.corpo), c.palavras)
  }

  const livreEm = morte ? morte + 71 : null
  db.prepare(`
    INSERT OR REPLACE INTO direito
      (texto_id, jurisdicao, estado, livre_em, motivo, verificado_por, verificado_em)
    VALUES (?, ?, 'dominio_publico', ?, ?, 'humano', datetime('now'))`)
    .run(textoId, jurisdicao, livreEm,
      morte
        ? `Autor morreu em ${morte}; obra em domínio público no Brasil desde ${morte + 71} `
          + `(Lei 9.610/98, art. 41). Esta tradução é nossa, feita do original — art. 14.`
        : 'Tradução própria, feita a partir de original em domínio público (Lei 9.610/98, art. 14).')

  // Trilho A: agora hospedamos o texto, e não só a ficha.
  db.prepare("UPDATE obra SET trilho = 'A', publicada = 1 WHERE id = ?").run(obraId)

  db.exec('COMMIT')
  console.log(`\nobra ${obraId} — ${obra.titulo}`)
  console.log(`  trilho ${obra.trilho} → A`)
  console.log(`  texto ${textoId}: ${t.capitulos.length} capítulos, ${palavras} palavras`)
  console.log(`  rótulo: tradução automática, com o original em ${t.fonte}`)
  console.log('\nfalta reindexar a busca:\n  node servidor/reindexar.mjs')
} catch (e) {
  db.exec('ROLLBACK')
  throw e
}
