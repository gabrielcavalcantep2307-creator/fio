// Instalar uma tradução pela linha de comando — atalho para servidor/servicos/acervo.mjs.
//
//   node ingestao/instalar-traducao.mjs --arquivo obra123 --obra 123 \
//     [--banco dados/catalogo.db] [--pasta dados/traducoes] [--morte 1950]
//
// A esteira não passa por aqui: ela chama o serviço direto. O livro entra no
// banco E na busca; o catálogo estático do site é o outro passo
// (node ingestao/publicar.mjs, ou a esteira, que faz sozinha).

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { instalarLivro } from '../servidor/servicos/acervo.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

function principal() {
  const nome = arg('arquivo')
  const obraId = Number(arg('obra'))
  if (!nome || !obraId) {
    console.error('uso: --arquivo <nome> --obra <id> [--banco ...] [--pasta ...] [--morte 1950]')
    process.exit(1)
  }
  const pasta = arg('pasta', process.env.FIO_TRADUCOES || join(RAIZ, 'dados', 'traducoes'))
  const t = JSON.parse(readFileSync(join(pasta, `${nome}.json`), 'utf8'))
  const db = new DatabaseSync(arg('banco', process.env.FIO_BANCO || join(RAIZ, 'dados', 'catalogo.db')))
  db.exec('PRAGMA busy_timeout = 30000')
  db.exec('PRAGMA foreign_keys = ON')
  try {
    const r = instalarLivro(db, t, {
      obraId, jurisdicao: arg('jurisdicao', 'BR'), aoDizer: (l) => console.log(l),
      ...(arg('morte') ? { morte: Number(arg('morte')) } : {}),
    })
    console.log(`\nobra ${obraId} — ${r.titulo}`)
    console.log(`  trilho ${r.trilhoAntes} → A`)
    console.log(`  texto ${r.textoId}: ${r.capitulos} capítulos, ${r.palavras} palavras, ${r.indexados} na busca`)
    console.log(`  rótulo: tradução automática, com o original em ${t.fonte}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) principal()
