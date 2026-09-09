// Buscar DENTRO dos livros, e não só nos títulos.
//
// O acervo tem 110 milhões de palavras e um índice FTS5 sobre todas elas —
// `busca_capitulo`, 86.320 linhas — que estava pronto, populado e sem
// nenhuma rota que o consultasse. A busca do site procurava título, autor e
// assunto; quem lembrava de uma frase e não do livro não tinha onde
// perguntar.
//
// É a diferença entre um catálogo e uma biblioteca: o catálogo diz quais
// livros existem, a biblioteca deixa procurar dentro deles.
//
// Duas coisas que esta busca faz e que uma busca ingênua não faria:
//
//   O TRECHO, e não só o livro. `snippet()` devolve a frase com o termo
//   marcado, então o resultado já mostra POR QUE ele apareceu. Sem isso, uma
//   lista de vinte títulos obriga a abrir os vinte.
//
//   O DIREITO, conferido. Só entra no resultado a obra que pode ser lida
//   aqui: achar um trecho e não poder abrir o livro é uma promessa quebrada,
//   e pior que não achar.

import { Recusa } from './contas.mjs'

/**
 * O que o FTS5 aceita como consulta.
 *
 * A sintaxe do FTS5 tem operadores — `AND`, `OR`, `NOT`, `*`, `"`, `:`, `^` —
 * e um usuário que digita `direito: propriedade` ou `machado "` recebe um
 * erro de sintaxe do SQLite em vez de resultado. Pior: `NEAR(` e afins abrem
 * caminho para consulta que custa caro.
 *
 * Então nada do que a pessoa escreve vai cru para o índice. Cada palavra é
 * isolada, limpa e devolvida entre aspas — o que a torna um termo literal —
 * e as palavras são unidas por AND implícito. Uma frase entre aspas continua
 * funcionando porque é o caso mais pedido: quem lembra de uma frase quer
 * exatamente aquela frase.
 */
export function comoConsulta(termo) {
  const cru = String(termo ?? '').slice(0, 200)

  // frase entre aspas: vale inteira
  const frase = cru.match(/"([^"]{2,})"/)
  if (frase) {
    const limpa = frase[1].replace(/["']/g, ' ').replace(/\s+/g, ' ').trim()
    return limpa ? `"${limpa}"` : null
  }

  const palavras = cru
    .split(/\s+/)
    .map(p => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(p => p.length >= 2)
    .slice(0, 8)

  if (!palavras.length) return null
  return palavras.map(p => `"${p}"`).join(' AND ')
}

const POR_PAGINA = 20

export function criarBuscaNoTexto(banco) {
  // `bm25` é o ranqueamento do próprio FTS5: dá mais peso ao termo raro e
  // menos ao comum. Sem ele a ordem seria a do rowid, que é a ordem em que os
  // capítulos foram gravados — ou seja, nenhuma.
  const consulta = banco.prepare(`
    SELECT o.id obra_id,
           o.titulo, o.titulo_pt,
           p.nome autor,
           c.ordem capitulo,
           c.titulo capitulo_titulo,
           snippet(busca_capitulo, 0, '<mark>', '</mark>', '…', 14) trecho
      FROM busca_capitulo b
      JOIN capitulo c ON c.id = b.capitulo_id
      JOIN texto t ON t.id = c.texto_id AND t.normalizado = 1
      JOIN obra o ON o.id = t.obra_id AND o.publicada = 1
      JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
                    AND d.estado IN ('dominio_publico','licenca_livre')
      LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      LEFT JOIN pessoa p ON p.id = op.pessoa_id
     WHERE busca_capitulo MATCH ?
     ORDER BY bm25(busca_capitulo)
     LIMIT ?`)

  return (termo, { jurisdicao = 'BR' } = {}) => {
    const q = comoConsulta(termo)
    if (!q) return { termo: String(termo ?? ''), achados: [] }

    let linhas
    try {
      // pede mais que a página: obras repetidas são agrupadas logo abaixo
      linhas = consulta.all(jurisdicao, q, POR_PAGINA * 6)
    } catch {
      // sintaxe que escapou da limpeza — devolve vazio, nunca erro de SQL
      throw new Recusa('Não consegui entender essa busca.', 400)
    }

    // Um livro aparece UMA vez, com o melhor trecho dele.
    //
    // Sem isto, procurar uma palavra comum devolve vinte trechos do mesmo
    // romance e nada mais — o que parece um acervo de um livro só.
    const porObra = new Map()
    for (const l of linhas) {
      if (porObra.has(l.obra_id)) { porObra.get(l.obra_id).outros++; continue }
      porObra.set(l.obra_id, {
        obra: l.obra_id,
        titulo: l.titulo_pt || l.titulo,
        autor: l.autor ?? 'autoria não identificada',
        capitulo: l.capitulo,
        capituloTitulo: l.capitulo_titulo,
        trecho: l.trecho,
        outros: 0,
      })
      if (porObra.size >= POR_PAGINA) break
    }

    return { termo: String(termo ?? ''), achados: [...porObra.values()] }
  }
}
