// Grava os anos achados por achar-anos.mjs (08/10/2026), só onde a obra não tem ano.
//   node ingestao/aplicar-anos.mjs anos.json [--gravar]
// Guarda o que mudou em /dados/anos-gravados.json (desfazer: pôr NULL nesses ids).
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync } from 'node:fs'

const [arquivo] = process.argv.slice(2)
const gravar = process.argv.includes('--gravar')
const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db')
banco.exec('PRAGMA busy_timeout = 30000')
const anos = JSON.parse(readFileSync(arquivo, 'utf8'))
const gravados = []
const por = {}
for (const [id, { ano, de }] of Object.entries(anos)) {
  const o = banco.prepare('SELECT ano FROM obra WHERE id = ?').get(Number(id))
  if (!o || o.ano != null) continue
  if (gravar) banco.prepare('UPDATE obra SET ano = ? WHERE id = ? AND ano IS NULL').run(ano, Number(id))
  gravados.push(Number(id)); por[de] = (por[de] ?? 0) + 1
}
if (gravar) writeFileSync('/dados/anos-gravados.json', JSON.stringify({ em: new Date().toISOString(), ids: gravados }))
console.log({ obras: gravados.length, por, gravado: gravar })
