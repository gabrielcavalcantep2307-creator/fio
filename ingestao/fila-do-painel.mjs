// A ponte entre o painel e a esteira, do lado do BANCO.
//
//   node ingestao/fila-do-painel.mjs --banco /dados/catalogo.db
//
// Roda no servidor (é onde está o banco). Faz três coisas e imprime o plano:
//
//   1. RECONCILIA: todo item 'na_esteira' cuja obra já tem tradução legível
//      vira 'pronto'. É assim que o painel sabe que o livro subiu.
//
//   2. PROMOVE: cada item 'espera' vira uma OBRA de verdade (ficha em trilho B,
//      autor com ano de morte) e passa a 'na_esteira'. Sem isto a esteira
//      traduziria um texto sem ter onde instalá-lo — a obra é o gancho.
//
//   3. EMITE: imprime, em JSON, as linhas de plano para a esteira traduzir.
//
// O `puxar-fila.mjs`, na máquina do dono, chama este script por SSH e junta o
// plano ao `esteira.json`. Nenhum comando roda na máquina de ninguém a partir
// da web: o painel só escreve uma linha no banco, e é esta ponte, do lado de
// cá, que a transforma em trabalho.

import { DatabaseSync } from 'node:sqlite'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const db = new DatabaseSync(arg('banco', 'dados/catalogo.db'))

// 1. reconciliar: o que a esteira já entregou, o painel passa a mostrar pronto
db.exec(`
  UPDATE fila_traducao SET estado = 'pronto', mexido_em = datetime('now')
   WHERE estado = 'na_esteira' AND obra_id IN (
     SELECT o.id FROM obra o JOIN texto t ON t.obra_id = o.id
      WHERE t.fonte = 'fio_traducao' AND t.normalizado = 1
        AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id))`)

const achaPessoa = db.prepare('SELECT id FROM pessoa WHERE nome = ?')
const poePessoa = db.prepare('INSERT INTO pessoa (nome, nome_ordem, morte) VALUES (?,?,?)')
const poMorte = db.prepare('UPDATE pessoa SET morte = COALESCE(morte, ?) WHERE id = ?')
const achaObra = db.prepare(`
  SELECT o.id FROM obra o JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
    JOIN pessoa p ON p.id = op.pessoa_id
   WHERE o.titulo = ? COLLATE NOCASE AND p.nome = ?`)
const poeObra = db.prepare(
  `INSERT INTO obra (titulo, titulo_pt, idioma_original, trilho, publicada) VALUES (?,?,?, 'B', 1)`)
const liga = db.prepare("INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,'autor')")
const marcar = db.prepare("UPDATE fila_traducao SET estado = 'na_esteira', obra_id = ?, mexido_em = datetime('now') WHERE id = ?")

// 2. promover cada 'espera' a obra
const esperando = db.prepare("SELECT * FROM fila_traducao WHERE estado = 'espera' ORDER BY criado_em").all()
const plano = []

db.exec('BEGIN')
try {
  for (const f of esperando) {
    let obraId = achaObra.get(f.titulo, f.autor)?.id
    if (!obraId) {
      const pessoa = achaPessoa.get(f.autor)
        ?? { id: Number(poePessoa.run(f.autor, f.autor, f.morte).lastInsertRowid) }
      if (f.morte) poMorte.run(f.morte, pessoa.id)
      obraId = Number(poeObra.run(f.titulo, f.titulo, f.idioma).lastInsertRowid)
      liga.run(obraId, pessoa.id)
    }
    marcar.run(obraId, f.id)
    plano.push({
      obra: obraId, titulo: f.titulo, autor: f.autor, morte: f.morte ?? null,
      fonte: f.fonte, de: f.idioma, saida: `obra${obraId}`, emTrilha: 1, prioridade: f.prioridade ?? 0,
    })
  }
  db.exec('COMMIT')
} catch (e) { db.exec('ROLLBACK'); throw e }

// 3. emitir. Uma linha marcada, para o puxar-fila achar no meio do resto.
console.error(`fila: ${esperando.length} promovidos a obra`)
console.log('===PLANO===')
console.log(JSON.stringify(plano))
