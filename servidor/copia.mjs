// Uma cópia íntegra do banco, com o servidor rodando.
//
//   node servidor/copia.mjs destino.db          # copia o banco padrão
//   FIO_BANCO=... node servidor/copia.mjs x.db
//
// `cp` de um SQLite em WAL durante uma escrita produz um arquivo quebrado —
// e quebrado de um jeito que só se descobre no dia em que o backup for
// necessário. `VACUUM INTO` faz a cópia por dentro do próprio SQLite, num
// ponto consistente, e ainda sai compactada (sem as páginas livres).

import { DatabaseSync } from 'node:sqlite'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from './banco/base.mjs'

const origem = process.env.FIO_BANCO || join(RAIZ, 'dados', 'catalogo.db')
const destino = process.argv[2]

if (!destino) {
  console.error('uso: node servidor/copia.mjs <destino.db>')
  process.exit(1)
}

// O VACUUM INTO recusa escrever por cima de um arquivo que já existe.
rmSync(destino, { force: true })

// SEM readOnly, e isso não é descuido: um banco em WAL só é lido por
// inteiro por quem consegue abrir o índice do WAL, o que exige escrita no
// arquivo `-shm`. Aberto como somente-leitura, o SQLite enxerga apenas o
// arquivo principal — e devolve uma cópia SILENCIOSAMENTE VAZIA se o que
// interessa ainda está no WAL. Custou uma hora descobrir isso.
const banco = new DatabaseSync(origem)
banco.exec(`VACUUM INTO '${destino.split('\\').join('/').replaceAll("'", "''")}'`)
banco.close()

console.log(destino)
