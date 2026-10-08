// 02/10/2026: os 40 livros da esteira de 29/09 estavam sem título em
// português e sem capa. Roda DENTRO do infra-fio-1 (infra/conserto-0210.sh).
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync } from 'node:fs'

const t = JSON.parse(readFileSync('/tmp/titulos.json', 'utf8'))
const db = new DatabaseSync('/dados/catalogo.db')
db.exec('PRAGMA busy_timeout=10000')
const copia = '/dados/catalogo.antes-titulos-20261002.db'
if (!existsSync(copia)) db.exec(`VACUUM INTO '${copia}'`)

const poe = db.prepare(`UPDATE obra SET titulo_pt = ?, capa = COALESCE(capa, ?), atualizado_em = datetime('now')
  WHERE id = ? AND id BETWEEN 5165 AND 5204`)
// autor que a esteira criou com nome em inglês -> a pessoa que já existia em português
const troca = db.prepare('UPDATE OR IGNORE obra_pessoa SET pessoa_id = ? WHERE obra_id = ? AND pessoa_id = ?')

db.exec('BEGIN')
let n = 0
for (const [id, [titulo]] of Object.entries(t)) n += poe.run(titulo, `des-${id}.svg`, Number(id)).changes
for (const [obra, nova, velha] of [[5165, 444, 252], [5196, 745, 1723], [5187, 517, 1720], [5191, 517, 1720], [5176, 587, 1714]]) troca.run(nova, obra, velha)
db.exec('COMMIT')

console.log('obras atualizadas:', n, '(cópia de antes em', copia + ')')
for (const r of db.prepare('SELECT id, titulo_pt, capa FROM obra WHERE id IN (5165, 5187, 5196)').all()) console.log(' ', r.id, r.titulo_pt, r.capa)
