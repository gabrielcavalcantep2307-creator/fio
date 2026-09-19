// Grava as seções de descoberta como trilhas, na ordem, e aposenta as antigas.
//
//   node ingestao/secoes.mjs --banco /dados/catalogo.db            (confere)
//   node ingestao/secoes.mjs --banco /dados/catalogo.db --gravar   (grava)
//
// O que as seções SÃO mora em `descoberta.mjs`; aqui só se escreve no banco.
// Aposentar é `publicada = 0`, nunca apagar: a trilha antiga volta com um
// UPDATE, e os livros dela continuam no acervo, na estante e na busca.
//
// Cuidado conhecido: `generos.mjs --gravar` republica as prateleiras de gênero
// que ele criou. Se rodá-lo de novo, rode este depois.

import { DatabaseSync } from 'node:sqlite'
import { SECOES, MANTER, FIXAS, criarResolvedor } from '../servidor/servicos/descoberta.mjs'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }
const GRAVAR = process.argv.includes('--gravar')
const banco = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: !GRAVAR })
const resolver = criarResolvedor(banco)

const legivel = banco.prepare(`SELECT 1 FROM texto t WHERE t.obra_id = ? AND t.idioma = 'pt' AND t.normalizado = 1
  AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id) LIMIT 1`)
const titulo = banco.prepare('SELECT COALESCE(titulo_pt, titulo) t FROM obra WHERE id = ?')

const plano = SECOES.map((s) => {
  const ids = [], faltam = []
  for (const ref of s.livros) {
    const id = resolver(ref)
    if (id == null) faltam.push(typeof ref === 'number' ? `#${ref}` : ref.t)
    else if (!ids.includes(id)) ids.push(id)
  }
  const legiveis = ids.filter((id) => legivel.get(id)).length
  console.log(`\n${s.nome}\n  ${ids.length} livros, ${legiveis} legíveis${faltam.length ? ` · não achei: ${faltam.join(', ')}` : ''}`)
  console.log('  ' + ids.map((id) => (legivel.get(id) ? '' : '(a caminho) ') + titulo.get(id).t.slice(0, 32)).join(' · '))
  return { ...s, ids }
})

const ficam = new Set([...SECOES.map((s) => s.nome), ...MANTER, ...FIXAS])
const aposentar = banco.prepare('SELECT id, nome FROM trilha WHERE publicada = 1').all().filter((t) => !ficam.has(t.nome))
console.log(`\naposentadas: ${aposentar.map((t) => t.nome).join(' · ') || 'nenhuma'}`)

if (!GRAVAR) { console.log('\n(só conferindo; use --gravar)'); process.exit(0) }

const acha = banco.prepare('SELECT id FROM trilha WHERE nome = ?')
const poe = banco.prepare('INSERT INTO trilha (nome, resumo, publicada) VALUES (?,?,1)')
const atualiza = banco.prepare('UPDATE trilha SET resumo = ?, publicada = 1 WHERE id = ?')
const limpa = banco.prepare('DELETE FROM trilha_item WHERE trilha_id = ?')
const item = banco.prepare('INSERT OR REPLACE INTO trilha_item (trilha_id, obra_id, ordem, porque) VALUES (?,?,?,NULL)')
const tira = banco.prepare('UPDATE trilha SET publicada = 0 WHERE id = ?')

banco.exec('BEGIN')
try {
  for (const s of plano) {
    const id = Number(acha.get(s.nome)?.id ?? poe.run(s.nome, s.resumo).lastInsertRowid)
    atualiza.run(s.resumo, id)
    limpa.run(id)
    s.ids.forEach((obra, i) => item.run(id, obra, i + 1))
  }
  for (const t of aposentar) tira.run(t.id)
  banco.exec('COMMIT')
  console.log(`\ngravado: ${plano.length} seções, ${aposentar.length} aposentadas`)
} catch (e) { banco.exec('ROLLBACK'); throw e }
