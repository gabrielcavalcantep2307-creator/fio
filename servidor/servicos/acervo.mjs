// O acervo: pôr no banco, e na busca, uma tradução que já saiu pronta.
//
//   import { instalarLivro } from './servicos/acervo.mjs'
//   instalarLivro(banco, traducao, { obraId: 123 })
//
// Quem chama: a esteira, a cada livro que termina, e o atalho
// ingestao/instalar-traducao.mjs. Separado da tradução de propósito: traduzir
// custa horas e instalar custa um INSERT — juntar os dois faria cada erro de
// SQL custar o livro inteiro de novo.
//
// O que se grava, além do texto:
//
//   O RÓTULO. `texto.revisao = 'automatica'` e um `aviso` que o leitor vê na
//   ficha e na primeira página. Uma biblioteca que apresenta tradução de
//   máquina como se fosse de gente está mentindo sobre o próprio acervo.
//
//   O ORIGINAL. `fonte_url` guarda de onde veio o texto, para qualquer um
//   conferir a tradução contra ele.
//
//   O DIREITO. Uma linha em `direito` dizendo por que esta obra pode estar
//   aqui, com a jurisdição junto — Animal Farm é domínio público no Brasil e
//   segue protegido nos Estados Unidos até 2041.
//
//   A BUSCA. Os capítulos do livro e a linha da obra entram no índice na
//   mesma hora (reindexar.mjs, só aquele livro) — antes era um passo à parte,
//   que refazia 1 GB de índice e que alguém tinha de lembrar de rodar.

// De `sanear.mjs` DIRETO, e nunca por `normalizar.mjs`: aquele é um script, e
// importá-lo EXECUTA a ingestão, que trava o banco (custou cinco livros de
// seis em 11/09).
import { limpar } from '../sanear.mjs'
import { indexarTexto, indexarObra } from '../reindexar.mjs'

const AVISO = 'Tradução automática do Fio, sem revisão humana, feita a partir '
  + 'do original. O texto de origem fica no link da ficha, para conferência.'

/**
 * Instala uma tradução (o objeto que `servicos/traducao.mjs` grava) na obra
 * `obraId`. Não mexe na busca — para isso, `instalarLivro`, abaixo.
 *
 * @returns {{ textoId: number, palavras: number, capitulos: number, titulo: string, trilhoAntes: string }}
 */
export function instalarTraducao(db, t, { obraId, morte = 0, jurisdicao = 'BR', aoDizer = () => {} }) {
  const obra = db.prepare('SELECT id, titulo, trilho FROM obra WHERE id = ?').get(obraId)
  if (!obra) throw new Error(`obra ${obraId} não existe no banco`)

  const palavras = t.capitulos.reduce((a, c) => a + c.palavras, 0)
  // A mesma trava do tradutor, repetida aqui de propósito. Este é o último
  // passo antes de o livro aparecer para gente, e um arquivo antigo — gravado
  // antes de a trava existir — passaria batido se a única guarda fosse lá.
  if (palavras < 500) throw new Error(`obra ${obraId}: só ${palavras} palavras. Isto não é um livro; não instalo.`)

  db.exec('BEGIN')
  try {
    // Rodar duas vezes não pode empilhar duas traduções da mesma obra.
    const jaTem = db.prepare("SELECT id FROM texto WHERE obra_id = ? AND fonte = 'fio_traducao'").get(obraId)
    if (jaTem) {
      aoDizer(`obra ${obraId} já tem tradução nossa (texto ${jaTem.id}). Apagando para regravar.`)
      // A busca guarda o texto por conta própria; sem isto a tradução velha
      // continuaria aparecendo nas procuras depois de apagada.
      db.prepare('DELETE FROM busca_capitulo WHERE texto_id = ?').run(jaTem.id)
      db.prepare('DELETE FROM capitulo WHERE texto_id = ?').run(jaTem.id)
      db.prepare('DELETE FROM direito WHERE texto_id = ?').run(jaTem.id)
      db.prepare('DELETE FROM texto WHERE id = ?').run(jaTem.id)
    }

    const textoId = Number(db.prepare(`
      INSERT INTO texto (obra_id, idioma, fonte, fonte_url, formato, revisao, aviso,
                         normalizado, palavras)
      VALUES (?, 'pt', 'fio_traducao', ?, 'html', 'automatica', ?, 1, ?)`)
      .run(obraId, t.fonte, AVISO, palavras).lastInsertRowid)

    const poe = db.prepare(
      'INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,?,?,?,?)')
    for (const c of t.capitulos) {
      // Passa pelo saneador como qualquer texto de fora. O corpo do capítulo
      // vai para `dangerouslySetInnerHTML` no leitor, e "veio de nós" não é
      // motivo para abrir exceção: a exceção é que vira o buraco.
      poe.run(textoId, c.ordem, c.titulo, limpar(c.corpo), c.palavras)
    }

    const livreEm = morte ? morte + 71 : null
    db.prepare(`
      INSERT OR REPLACE INTO direito
        (texto_id, jurisdicao, estado, livre_em, motivo, verificado_por, verificado_em)
      VALUES (?, ?, 'dominio_publico', ?, ?, 'humano', datetime('now'))`)
      .run(textoId, jurisdicao, livreEm,
        morte
          ? `Autor morreu em ${morte}; obra em domínio público no Brasil desde ${morte + 71} `
            + `(Lei 9.610/98, art. 41). Esta tradução é nossa, feita do original — art. 14.`
          : 'Tradução própria, feita a partir de original em domínio público (Lei 9.610/98, art. 14).')

    // Trilho A: agora hospedamos o texto, e não só a ficha.
    db.prepare("UPDATE obra SET trilho = 'A', publicada = 1 WHERE id = ?").run(obraId)

    db.exec('COMMIT')
    return { textoId, palavras, capitulos: t.capitulos.length, titulo: obra.titulo, trilhoAntes: obra.trilho }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** O ano de morte que vai para a linha de direito: o do autor que morreu por último. */
export const morteDosAutores = (db, obraId) => db.prepare(`
  SELECT MAX(p.morte) morte FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
   WHERE op.obra_id = ? AND op.papel = 'autor'`).get(obraId)?.morte ?? 0

/**
 * Instala e põe na busca, numa chamada. É o que se usa: `instalarTraducao`
 * sozinha deixa o livro fora das procuras até alguém reindexar.
 */
export function instalarLivro(db, t, { obraId, morte = morteDosAutores(db, obraId), jurisdicao = 'BR', aoDizer } = {}) {
  const r = instalarTraducao(db, t, { obraId, morte, jurisdicao, aoDizer })
  const indexados = indexarTexto(db, r.textoId)
  indexarObra(db, obraId)
  // Devolve o espaço do WAL aos poucos, sem travar ninguém (PASSIVE não espera).
  try { db.exec('PRAGMA wal_checkpoint(PASSIVE)') } catch {}
  return { ...r, indexados }
}
