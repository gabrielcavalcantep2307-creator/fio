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
import { RAIZ, recriarDerivada } from './banco/base.mjs'

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

// ─────────────────────────────────────────────────────────────
// --sem-busca: a cópia que não leva o que a outra ponta refaz
//
// Medido com `dbstat` num catálogo de 1,8 GB:
//
//     712 MB  capitulo                 ← o texto dos livros
//     686 MB  busca_capitulo_content   ← uma SEGUNDA cópia do mesmo texto
//     365 MB  busca_capitulo_data      ← o índice invertido
//
// São 1.051 MB de dado DERIVADO — 58% do arquivo. Mandar isso pela rede é
// mandar um giga do que a VPS constrói sozinha em minutos, e foi o que
// transformou a publicação numa coisa de horas.
//
// A cópia sai sem índice e o `fundir.mjs` o refaz do outro lado. O VACUUM
// depois é o que devolve o espaço: sem ele o arquivo continua do mesmo
// tamanho, com as páginas marcadas como livres por dentro.
// ─────────────────────────────────────────────────────────────
// DERRUBAR e recriar, e não `DELETE`. Medido nos dois jeitos:
//
//   original            1.780 MB
//   com DELETE          1.212 MB   ← o _content sumiu e o _data CRESCEU
//                                    de 365 para 482 MB, de tanta lápide
//   com DROP+CREATE       723 MB
//
// Um `DELETE` num FTS5 não apaga: escreve marcas de remoção dentro do índice,
// porque o formato é feito para busca rápida e não para esvaziamento. Quem
// quer a tabela vazia derruba a tabela.
if (process.argv.includes('--sem-busca')) {
  const copia = new DatabaseSync(destino)
  for (const t of ['busca_capitulo', 'busca_obra']) recriarDerivada(copia, t)
  copia.exec('VACUUM')
  copia.close()
}

console.log(destino)
