// Tira do acervo o índice da edição de papel que virou capítulo.
//
// A regra mora em `servidor/indice-fantasma.mjs` — lá está escrito o que
// separa um índice de um capítulo curto de verdade, e por que a primeira
// medida errava. Aqui só se aplica ao que já está publicado; livro novo já
// nasce limpo, porque a esteira chama o mesmo módulo ao instalar.
//
//   node ingestao/consertar-indice.mjs             # simulação
//   node ingestao/consertar-indice.mjs --aplicar   # para valer
//
// Nada é renumerado. `fragmento.revela_ate` e a posição guardada de quem está
// lendo apontam para `ordem`; um buraco na numeração não incomoda ninguém,
// e renumerar deslocaria as duas coisas.

import { DatabaseSync } from 'node:sqlite'
import { oQueEhIndice } from '../servidor/indice-fantasma.mjs'

const BANCO = process.env.FIO_BANCO || 'dados/catalogo.db'
const aplicar = process.argv.includes('--aplicar')

const banco = new DatabaseSync(BANCO)
const textos = banco.prepare(`
  SELECT t.id texto_id, o.id obra_id, COALESCE(o.titulo_pt, o.titulo) titulo, t.fonte
    FROM texto t JOIN obra o ON o.id = t.obra_id
   WHERE t.dono_id IS NULL AND t.normalizado = 1 AND o.publicada = 1`).all()

const capStmt = banco.prepare('SELECT id, ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')
const apagar = banco.prepare('DELETE FROM capitulo WHERE id = ?')
const daBusca = banco.prepare('DELETE FROM busca_capitulo WHERE capitulo_id = ?')
const recontar = banco.prepare('UPDATE texto SET palavras = (SELECT COALESCE(SUM(palavras),0) FROM capitulo WHERE texto_id = ?) WHERE id = ?')

let livros = 0
let capitulos = 0
const porMotivo = { 'indice-engolido': 0, 'indice-fantasma': 0 }

for (const t of textos) {
  const caps = capStmt.all(t.texto_id)
  const fora = oQueEhIndice(caps)
  if (!fora.length) continue
  livros++
  capitulos += fora.length
  for (const c of fora) porMotivo[c.motivo]++
  console.log(`\nobra ${t.obra_id} — ${String(t.titulo).slice(0, 60)} (${t.fonte}, ${caps.length} caps)`)
  for (const c of fora) {
    console.log(`  ${c.motivo}  #${c.ordem} ${c.palavras}pal  ${JSON.stringify(String(c.titulo ?? '').slice(0, 60))}`)
  }
  if (aplicar) {
    const ordens = new Set(fora.map((c) => c.ordem))
    banco.exec('BEGIN')
    try {
      for (const c of caps) {
        if (!ordens.has(c.ordem)) continue
        apagar.run(c.id)
        // a busca guarda o capítulo por conta própria; sem isto o índice
        // continuaria aparecendo em quem procura
        try { daBusca.run(c.id) } catch { /* índice de busca pode não ter esta linha */ }
      }
      recontar.run(t.texto_id, t.texto_id)
      banco.exec('COMMIT')
    } catch (e) {
      banco.exec('ROLLBACK')
      console.log(`  !! obra ${t.obra_id} não mudou: ${e.message}`)
    }
  }
}

console.log(`\n${aplicar ? 'APAGADOS' : 'seriam apagados'}: ${capitulos} capítulos em ${livros} livros`)
console.log(`  índice engolido: ${porMotivo['indice-engolido']}   índice fantasma: ${porMotivo['indice-fantasma']}`)
if (!aplicar) console.log('\n(simulação — rode com --aplicar para valer)')
