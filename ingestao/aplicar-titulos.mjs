// Grava os títulos padronizados que JÁ FORAM LIDOS E AUTORIZADOS (05/10/2026).
//
//   node ingestao/aplicar-titulos.mjs              # grava /dados/achados/titulos-final.json
//   node ingestao/aplicar-titulos.mjs --desfazer   # volta cada título ao que era
//
// As travas:
//   - cópia do banco inteiro antes da primeira gravação;
//   - só troca se o título no banco AINDA É exatamente o que foi lido
//     (COALESCE(titulo_pt, titulo) = antes) — nada mudado no meio do caminho
//     é sobrescrito;
//   - o valor anterior de titulo_pt de cada obra vai para um diário, e
//     --desfazer devolve um a um;
//   - o original de catálogo em `titulo` não é tocado: só `titulo_pt`, que é
//     o que o site mostra.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const BANCO = process.env.FIO_BANCO || '/dados/catalogo.db'
const LISTA = '/dados/achados/titulos-final.json'
// 05/10 houve duas gravações: titulos-aplicados-1.json (1.432) e -2.json (1).
// Desfazer uma delas: --desfazer --diario /dados/achados/titulos-aplicados-1.json
const i = process.argv.indexOf('--diario')
const DIARIO = i > 0 ? process.argv[i + 1] : '/dados/achados/titulos-aplicados.json'
const COPIA = '/dados/catalogo.antes-titulos-20261005.db'

const db = new DatabaseSync(BANCO)
db.exec('PRAGMA busy_timeout=10000')

if (process.argv.includes('--desfazer')) {
  const diario = JSON.parse(readFileSync(DIARIO, 'utf8'))
  const volta = db.prepare(`UPDATE obra SET titulo_pt = ?, atualizado_em = datetime('now') WHERE id = ? AND titulo_pt = ?`)
  db.exec('BEGIN')
  let n = 0
  for (const r of diario) n += volta.run(r.titulo_pt_antes, r.id, r.depois).changes
  db.exec('COMMIT')
  console.log(`${n} de ${diario.length} títulos voltaram ao que eram`)
  process.exit(0)
}

const lista = JSON.parse(readFileSync(LISTA, 'utf8'))
if (!existsSync(COPIA)) db.exec(`VACUUM INTO '${COPIA}'`)
const atual = db.prepare('SELECT titulo, titulo_pt FROM obra WHERE id = ?')
const grava = db.prepare(`UPDATE obra SET titulo_pt = ?, atualizado_em = datetime('now')
  WHERE id = ? AND COALESCE(titulo_pt, titulo) = ?`)
const diario = []
let pulados = 0
db.exec('BEGIN')
for (const r of lista) {
  const o = atual.get(r.id)
  if (!o || (o.titulo_pt ?? o.titulo) !== r.antes) { pulados++; continue }
  if (grava.run(r.depois, r.id, r.antes).changes) diario.push({ id: r.id, titulo_pt_antes: o.titulo_pt, depois: r.depois })
}
db.exec('COMMIT')
writeFileSync(DIARIO, JSON.stringify(diario, null, 1))
console.log(`${diario.length} títulos gravados; ${pulados} pulados (mudaram desde a leitura); cópia em ${COPIA}; diário em ${DIARIO}`)
