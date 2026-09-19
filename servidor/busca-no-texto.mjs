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

// Quantos capítulos do índice a gente olha antes de resolver os livros. Alto o
// bastante para uma palavra comum render bons resultados, baixo o bastante para
// nunca ser caro. Ver o comentário grande na consulta abaixo.
const TETO_DE_CAPITULOS = 240

export function criarBuscaNoTexto(banco) {
  // ── por que a busca é em DOIS passos, e não num JOIN só ──
  //
  // A versão anterior fazia `... JOIN (seis tabelas) ... WHERE MATCH ?
  // ORDER BY bm25(...) LIMIT 120`. Parece certo e é uma armadilha: com o
  // `ORDER BY` sobre uma função do índice, o SQLite tem que JUNTAR todas as
  // linhas que casam ANTES de ordenar e cortar. Para "machado" são dez; para
  // "de" são centenas de milhares, cada uma passando por seis tabelas e por um
  // `snippet()`.
  //
  // E o `node:sqlite` é SÍNCRONO: enquanto essa consulta roda, o processo
  // inteiro para. Numa máquina de um núcleo, uma única busca por "que" — que
  // qualquer um na internet dispara, porque a rota é pública — congelava o site
  // por 60 segundos, `/api/saude` incluído. Era negação de serviço de graça.
  //
  // O primeiro passo pergunta SÓ ao índice, que é o que o FTS5 faz rápido:
  // `ORDER BY rank LIMIT 240` usa a fila de prioridade do bm25 e para cedo, sem
  // tocar em nenhuma outra tabela. O segundo passo resolve esses 240 candidatos
  // contra obra/texto/direito/autor — 240 linhas, não trezentas mil. Medido num
  // banco de verdade: "de" caiu de 60 s para cerca de um segundo.
  const doIndice = banco.prepare(`
    SELECT capitulo_id, texto_id, rank,
           snippet(busca_capitulo, 0, '<mark>', '</mark>', '…', 14) trecho
      FROM busca_capitulo
     WHERE busca_capitulo MATCH ?
     ORDER BY rank
     LIMIT ?`)

  // O segundo passo. `rank` do índice manda na ordem; o direito é conferido
  // aqui, e o que não pode ser lido em casa some do resultado — achar um trecho
  // e não poder abrir o livro é pior que não achar.
  const resolver = banco.prepare(`
    SELECT o.id obra_id, o.titulo, o.titulo_pt, p.nome autor,
           c.ordem capitulo, c.titulo capitulo_titulo
      FROM capitulo c
      JOIN texto t ON t.id = c.texto_id AND t.normalizado = 1
      JOIN obra o ON o.id = t.obra_id AND o.publicada = 1
      JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
                    AND d.estado IN ('dominio_publico','licenca_livre')
      LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      LEFT JOIN pessoa p ON p.id = op.pessoa_id
     WHERE c.id = ?`)

  return (termo, { jurisdicao = 'BR' } = {}) => {
    const q = comoConsulta(termo)
    if (!q) return { termo: String(termo ?? ''), achados: [] }

    let candidatos
    try {
      candidatos = doIndice.all(q, TETO_DE_CAPITULOS)
    } catch {
      // sintaxe que escapou da limpeza — devolve vazio, nunca erro de SQL
      throw new Recusa('Não consegui entender essa busca.', 400)
    }

    // Resolve cada candidato, na ordem que o índice deu, e junta o trecho de
    // volta. `rank` já vem ordenado do passo um.
    const linhas = []
    for (const cand of candidatos) {
      const alvo = resolver.get(jurisdicao, cand.capitulo_id)
      if (alvo) linhas.push({ ...alvo, trecho: cand.trecho })
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
        // 134 títulos do acervo trazem o subtítulo depois de uma quebra de
        // linha ("Iracema↵com uma noticia biographica…"): na busca, só a 1ª
        titulo: String(l.titulo_pt || l.titulo).split(/[\r\n]+/)[0].trim(),
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
