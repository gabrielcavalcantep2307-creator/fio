// O trilho C: o livro que é SEU.
//
// ─────────────────────────────────────────────────────────────
// POR QUE ISTO EXISTE
//
// O acervo tem três trilhos, decididos no começo do projeto:
//
//   A  nós hospedamos o texto — domínio público, ou tradução nossa
//   B  só a ficha e onde encontrar — a obra tem dono e não é nosso
//   C  o arquivo do LEITOR
//
// O C estava no esquema desde o primeiro dia, com coluna, índice e um
// comentário explicando a regra — e nunca tinha sido construído. O servidor
// só sabia ignorá-lo: toda consulta de leitura filtrava `dono_id IS NULL`, e
// nada nunca preenchia `dono_id`.
//
// Ele resolve o problema que nenhum dos outros dois resolve. Você comprou o
// livro, ou o arquivo é seu; a lei não te deixa publicá-lo para os outros e
// nunca te impediu de LER o que é seu. O que faltava era ler com marcação,
// caderno e sincronia entre aparelhos, que é o que esta biblioteca faz de
// melhor.
//
// ─────────────────────────────────────────────────────────────
// AS QUATRO REGRAS QUE FAZEM ISTO SER PRIVADO DE VERDADE
//
//   1. `obra.publicada = 0`. O catálogo estático do site é gerado com
//      `WHERE publicada = 1`. Um livro do leitor não entra nele nem por
//      engano, porque a consulta que o montaria nunca o vê.
//   2. `texto.dono_id` preenchido. É o que o servidor já filtrava desde
//      sempre, e agora tem quem filtrar.
//   3. Nada de `direito`. A biblioteca não afirma nada sobre o arquivo de
//      ninguém: quem sabe de onde ele veio é quem o mandou.
//   4. Apagar a conta leva os livros junto, por `ON DELETE CASCADE`. Sair
//      daqui é sair inteiro.
//
// A quarta regra é a que torna as outras três verdadeiras. Sem ela isto seria
// um depósito, e depósito de arquivo alheio é o que este projeto não é.
// ─────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { lerEpub } from './ler-epub.mjs'
import { limpar } from './sanear.mjs'
import { Recusa } from './contas.mjs'

/** Um EPUB grande é 30 MB; acima disso é outra coisa. */
export const TETO_BYTES = 40 * 1024 * 1024
const TETO_CAPITULOS = 2000

const contar = (html) => String(html).replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length

/**
 * Guarda o arquivo do leitor e devolve a obra criada.
 *
 * O EPUB em si NÃO é guardado. O que fica é o texto já desmontado em
 * capítulos e saneado — que é do que o leitor precisa, e é uma fração do
 * tamanho. Guardar o arquivo original seria guardar uma cópia de algo que já
 * é do leitor, ocupando disco nosso para nada.
 */
export function guardar(banco, leitorId, bytes, { nomeArquivo = '' } = {}) {
  if (!bytes?.length) throw new Recusa('Mandou um arquivo vazio.')
  if (bytes.length > TETO_BYTES) {
    throw new Recusa(`Arquivo grande demais (máximo ${Math.round(TETO_BYTES / 1024 / 1024)} MB).`, 413)
  }

  const hash = createHash('sha256').update(bytes).digest('hex')
  const jaTem = banco.prepare(
    'SELECT obra_id FROM texto WHERE dono_id = ? AND hash_arquivo = ?').get(leitorId, hash)
  if (jaTem) return { obra: jaTem.obra_id, repetido: true }

  let livro
  try { livro = lerEpub(bytes) } catch (e) {
    throw new Recusa(`Não consegui abrir este EPUB: ${e.message}`)
  }
  if (livro.capitulos.length > TETO_CAPITULOS) {
    throw new Recusa('Este arquivo tem capítulos demais; alguma coisa está errada nele.')
  }

  const titulo = livro.titulo
    || nomeArquivo.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim()
    || 'Sem título'

  banco.exec('BEGIN')
  try {
    const obraId = Number(banco.prepare(
      `INSERT INTO obra (titulo, idioma_original, trilho, publicada)
       VALUES (?, ?, 'C', 0)`).run(titulo.slice(0, 300), livro.idioma).lastInsertRowid)

    if (livro.autor) {
      const nome = livro.autor.slice(0, 200)
      const p = banco.prepare('SELECT id FROM pessoa WHERE nome = ?').get(nome)
        ?? { id: Number(banco.prepare('INSERT INTO pessoa (nome, nome_ordem) VALUES (?,?)')
          .run(nome, nome).lastInsertRowid) }
      banco.prepare("INSERT INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,'autor')")
        .run(obraId, p.id)
    }

    const palavras = livro.capitulos.reduce((a, c) => a + contar(c.corpo), 0)
    const textoId = Number(banco.prepare(
      `INSERT INTO texto (obra_id, idioma, fonte, formato, hash_arquivo, dono_id,
                          normalizado, palavras)
       VALUES (?, ?, 'leitor', 'epub', ?, ?, 1, ?)`)
      .run(obraId, livro.idioma, hash, leitorId, palavras).lastInsertRowid)

    const poe = banco.prepare(
      'INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,?,?,?,?)')
    for (const c of livro.capitulos) {
      // O MESMO saneador da ingestão. Um EPUB baixado da internet é tão de
      // fora quanto o Wikisource, e o corpo vai para `dangerouslySetInnerHTML`.
      const corpo = limpar(c.corpo)
      poe.run(textoId, c.ordem, c.titulo, corpo, contar(corpo))
    }

    banco.prepare('UPDATE obra SET minutos_leitura = ? WHERE id = ?')
      .run(Math.max(1, Math.round(palavras / 220)), obraId)

    banco.exec('COMMIT')
    return { obra: obraId, texto: textoId, titulo, autor: livro.autor, capitulos: livro.capitulos.length, palavras }
  } catch (e) {
    banco.exec('ROLLBACK')
    if (e instanceof Recusa) throw e
    throw new Recusa('Não consegui guardar este livro.')
  }
}

/** A estante particular de quem está entrado. */
export function meus(banco, leitorId) {
  return banco.prepare(`
    SELECT o.id, o.titulo, o.minutos_leitura minutos, t.palavras, t.criado_em,
           (SELECT COUNT(*) FROM capitulo c WHERE c.texto_id = t.id) capitulos,
           (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
             WHERE op.obra_id = o.id LIMIT 1) autor
      FROM texto t JOIN obra o ON o.id = t.obra_id
     WHERE t.dono_id = ?
     ORDER BY t.criado_em DESC`).all(leitorId)
}

/**
 * Tirar um livro da estante.
 *
 * Apaga a OBRA, e não só o texto: no trilho C a obra existe só para segurar
 * aquele arquivo, e deixá-la para trás encheria o banco de fichas órfãs que
 * ninguém nunca veria. As cascatas levam texto, capítulos e marcações junto.
 */
export function apagar(banco, leitorId, obraId) {
  const meu = banco.prepare(
    'SELECT id FROM texto WHERE obra_id = ? AND dono_id = ?').get(obraId, leitorId)
  if (!meu) throw new Recusa('Esse livro não é seu.', 404)
  banco.prepare("DELETE FROM obra WHERE id = ? AND trilho = 'C' AND publicada = 0").run(obraId)
  return { ok: true }
}

/** Este texto pode ser servido a esta pessoa? */
export const eDoLeitor = (banco, obraId, leitorId) => Boolean(leitorId && banco.prepare(
  'SELECT 1 FROM texto WHERE obra_id = ? AND dono_id = ?').get(obraId, leitorId))
