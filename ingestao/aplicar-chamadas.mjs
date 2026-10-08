// Aplica a camada editorial escrita à mão (08/10/2026): chamada e temas por livro.
//
//   node ingestao/aplicar-chamadas.mjs infra/conserto-0810/chamadas-1.json [--gravar]
//
// O arquivo é uma lista [{ id, chamada?, temas? }]. Vai para `curadoria_obra`,
// a mesma camada que o painel edita: o texto do livro não é tocado, vale
// também na ficha e no catálogo, e voltar atrás é apagar o campo no painel.
// Regras: não passa por cima de chamada que alguém já escreveu; chamada
// com mais de 240 letras ou tema fora dos temas do catálogo é recusada.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync } from 'node:fs'

const [arquivo] = process.argv.slice(2)
const gravar = process.argv.includes('--gravar')
const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db')
banco.exec('PRAGMA busy_timeout = 30000')
const lista = JSON.parse(readFileSync(arquivo, 'utf8'))
const dir = process.env.FIO_SITE_DADOS || '/site-dados'
const validos = new Set(JSON.parse(readFileSync(`${dir}/catalogo.json`, 'utf8')).temas.map((t) => t.nome))
const curador = banco.prepare("SELECT id FROM leitor WHERE papel = 'curador' ORDER BY id LIMIT 1").get()?.id ?? null

let nChamada = 0, nTemas = 0, pulou = 0
for (const { id, chamada, temas } of lista) {
  if (!existsSync(`${dir}/fichas/${id}.json`)) { console.log(`obra ${id}: fora do catálogo`); pulou++; continue }
  const ficha = JSON.parse(readFileSync(`${dir}/fichas/${id}.json`, 'utf8'))
  const antes = banco.prepare('SELECT campos FROM curadoria_obra WHERE obra_id = ?').get(id)
  const campos = antes ? JSON.parse(antes.campos) : {}
  if (chamada) {
    if (chamada.length > 240) { console.log(`obra ${id}: chamada com ${chamada.length} letras`); pulou++; continue }
    if ((ficha.chamada && !ficha.chamadaAuto) || campos.chamada) { pulou++; continue }
    campos.chamada = chamada; nChamada++
  }
  if (temas) {
    if (!temas.every((t) => validos.has(t))) { console.log(`obra ${id}: tema fora do catálogo`); pulou++; continue }
    campos.temas = temas; nTemas++
  }
  if (gravar) {
    banco.prepare(`INSERT INTO curadoria_obra (obra_id, campos, oculta, nota, mudou_em, mudou_por) VALUES (?, ?, 0, NULL, datetime('now'), ?)
      ON CONFLICT(obra_id) DO UPDATE SET campos = excluded.campos, mudou_em = datetime('now'), mudou_por = excluded.mudou_por`)
      .run(id, JSON.stringify(campos), curador)
  }
}
console.log({ chamadas: nChamada, temas: nTemas, pulou, gravado: gravar })
