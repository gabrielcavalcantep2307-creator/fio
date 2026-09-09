// Baixa o texto integral e transforma em capítulos limpos no banco.
//
// É a decisão 2 da arquitetura, em código: o EPUB/HTML é desmontado AQUI, uma
// vez, e o navegador nunca vê um arquivo de livro — só capítulos prontos.
//
//   node ingestao/normalizar.mjs             # os autores curados
//   node ingestao/normalizar.mjs --tudo      # todo o trilho A em português
//   node ingestao/normalizar.mjs --obra 42   # uma obra só
//
// Educação com a fonte: uma requisição de cada vez, com pausa. O Gutenberg é
// um projeto sem fins lucrativos e bloqueia quem martela.

import { abrir, fechar } from '../servidor/banco/base.mjs'

const PAUSA = 900
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

// Os autores que sustentam uma biblioteca de literatura em português.
// Não é gosto: é o que existe livre e vale ser lido.
const CURADOS = [
  'Machado de Assis', 'Eça de Queirós', 'José Martiniano de Alencar',
  'Aluísio Azevedo', 'Manuel Antônio de Almeida', 'Joaquim Nabuco',
  'Antônio Gonçalves Dias', 'José de Anchieta',
  'Luís de Camões', 'Manuel Maria Barbosa du Bocage', 'Antero de Quental',
  'Alexandre Herculano', 'Almeida Garrett', 'Júlio Dinis', 'Cesário Verde',
  'Camilo Castelo Branco', 'Ramalho Ortigão', 'Abílio Manuel Guerra Junqueiro',
  'Fernando Pessoa', 'Florbela Espanca', 'António Pereira Nobre',
  'Teófilo Braga', 'Gonçalves Crespo',
]
const TETO_POR_AUTOR = 12

// ─────────────────────────────────────────────────────────────
// Limpeza de HTML
//
// A entrada é HTML de origem desconhecida dentro de um zip. Tratamos como
// entrada hostil: lista de permissão de tags, e NENHUM atributo sobrevive.
// Isso é a defesa contra XSS, e ela roda uma vez na ingestão — não a cada
// leitura, onde seria fácil esquecer.
// ─────────────────────────────────────────────────────────────

const PERMITIDAS = new Set(['p', 'em', 'strong', 'blockquote', 'br', 'ul', 'ol', 'li', 'h3'])
// Todo cabeçalho que sobra DENTRO de um capítulo é subtítulo — o do capítulo
// já foi consumido pelo partidor. Machado usa <h5> para o número e <h4> para
// a epígrafe ("Do titulo."); esquecer um deles apaga a epígrafe.
const TRADUZ = {
  i: 'em', b: 'strong', cite: 'em', small: 'em',
  h1: 'h3', h2: 'h3', h4: 'h3', h5: 'h3', h6: 'h3',
}

/**
 * Onde termina esta tag — e por que isto não é uma expressão regular.
 *
 * A versão anterior achava o fim com `[^>]*>`, o primeiro `>` depois do nome.
 * Isso erra dos dois lados:
 *
 *   `<img src="x>y" onerror=alert(1)>` termina cedo demais. A tag some pela
 *   metade e o resto — `onerror=alert(1)` — fica no capítulo como texto.
 *
 *   `<p data-mw='{"h":"<poem>x"}' id="mwA">`, que é como o Parsoid do
 *   Wikisource devolve parágrafo, termina no `>` de dentro do JSON, e o
 *   miolo do atributo vai parar na página.
 *
 * A versão ANTES dessa exigia aspas casadas, e aí uma aspa solta
 * (`title=a'b`) fazia o casamento falhar inteiro: a tag não era reconhecida,
 * não era removida, e ia viva para o `dangerouslySetInnerHTML` do leitor.
 *
 * O navegador não faz nada disso. A regra do HTML5 é simples e é esta: aspa
 * só abre valor quando vem logo depois do `=`. Em qualquer outro lugar ela é
 * um caractere como outro qualquer. Uma varredura de dez linhas faz certo o
 * que três expressões regulares fizeram errado.
 */
function fimDaTag(s, i) {
  let j = i + 1
  if (s[j] === '/') j++
  let nome = ''
  while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) nome += s[j++]

  while (j < s.length && s[j] !== '>') {
    if (s[j] !== '=') { j++; continue }
    j++
    while (j < s.length && /\s/.test(s[j])) j++
    const aspa = s[j]
    if (aspa === '"' || aspa === "'") {
      j++
      while (j < s.length && s[j] !== aspa) j++
      j++ // a aspa que fecha
    }
  }
  return { nome, fim: j }
}

function limpar(html) {
  const semBloco = html
    // fora tudo que não é conteúdo
    .replace(/<(script|style|table|figure|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  let saida = ''
  for (let i = 0; i < semBloco.length; i++) {
    const c = semBloco[i]
    if (c !== '<') { saida += c; continue }

    // `<` que não começa tag é texto — "5 < 6" tem que sobreviver, e virar
    // entidade em vez de virar começo de marcação na cara do leitor.
    const depois = semBloco[i + 1] === '/' ? semBloco[i + 2] : semBloco[i + 1]
    if (!/[a-zA-Z]/.test(depois ?? '')) { saida += '&lt;'; continue }

    const { nome, fim } = fimDaTag(semBloco, i)
    const fechando = semBloco[i + 1] === '/'
    const alvo = TRADUZ[nome.toLowerCase()] ?? nome.toLowerCase()
    if (PERMITIDAS.has(alvo)) saida += fechando ? `</${alvo}>` : `<${alvo}>`
    i = fim // o laço avança para depois do `>`
  }

  return saida
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*(<br>\s*)*<\/p>/g, '')
    .trim()
}

// Exportado porque é controle de segurança, e controle de segurança sem teste
// é intenção. Quem testa é `servidor/testes.mjs`, que é o que roda no CI.
export { limpar }

function texto(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

const contarPalavras = (html) => texto(html).split(' ').filter(Boolean).length

/**
 * Acha o nível de cabeçalho que o livro usa para capítulo.
 * Varia por obra: Dom Casmurro usa <h4>, outros usam <h2>. Contar é mais
 * confiável que adivinhar.
 */
function nivelDeCapitulo(corpo) {
  let melhor = null
  for (const n of [2, 3, 4, 5]) {
    const q = (corpo.match(new RegExp(`<h${n}\\b`, 'gi')) || []).length
    if (q >= 3 && (!melhor || q > melhor.q)) melhor = { n, q }
  }
  return melhor?.n ?? null
}

function partir(htmlBruto) {
  // 1. só o miolo: fora o cabeçalho e a licença do Gutenberg
  let corpo = htmlBruto
  const i = corpo.search(/\*\*\*\s*START OF TH(E|IS) PROJECT GUTENBERG/i)
  const f = corpo.search(/\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG/i)
  if (i > -1) corpo = corpo.slice(corpo.indexOf('>', i) + 1)
  if (f > -1 && i > -1) corpo = corpo.slice(0, corpo.search(/\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG/i))
  else if (f > -1) corpo = corpo.slice(0, f)

  const nivel = nivelDeCapitulo(corpo)
  const pedacos = []

  if (nivel) {
    const re = new RegExp(`<h${nivel}\\b[^>]*>([\\s\\S]*?)<\\/h${nivel}>`, 'gi')
    const marcas = [...corpo.matchAll(re)]
    // o que vem antes do 1º cabeçalho é rosto e índice: só entra se for texto
    const abertura = corpo.slice(0, marcas[0]?.index ?? 0)
    if (contarPalavras(abertura) > 400) pedacos.push({ titulo: 'Abertura', html: abertura })
    marcas.forEach((m, k) => {
      const inicio = m.index + m[0].length
      const fim = k + 1 < marcas.length ? marcas[k + 1].index : corpo.length
      pedacos.push({ titulo: texto(m[1]).slice(0, 120), html: corpo.slice(inicio, fim) })
    })
  } else {
    // sem cabeçalho nenhum: corta por blocos de parágrafo, para não entregar
    // um livro inteiro numa tela só
    const paras = corpo.split(/(?=<p\b)/i)
    for (let k = 0; k < paras.length; k += 60) {
      pedacos.push({ titulo: null, html: paras.slice(k, k + 60).join('') })
    }
  }

  return pedacos
    .map(p => ({ titulo: p.titulo, corpo: limpar(p.html) }))
    .map(p => ({ ...p, palavras: contarPalavras(p.corpo) }))
    .filter(p => p.palavras >= 25)
}

// ─────────────────────────────────────────────────────────────

async function baixar(gid) {
  const tentativas = [
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}-images.html`,
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.html`,
    `https://www.gutenberg.org/files/${gid}/${gid}-h/${gid}-h.htm`,
  ]
  for (const url of tentativas) {
    const r = await fetch(url, { headers: { 'user-agent': UA } })
    if (r.ok) return await r.text()
  }
  return null
}

function escolher(banco, argv) {
  const uma = argv.indexOf('--obra')
  if (uma > -1) {
    return banco.prepare(
      `SELECT t.id texto_id, t.fonte_id, o.id obra_id, o.titulo FROM texto t
         JOIN obra o ON o.id = t.obra_id WHERE o.id = ?`).all(Number(argv[uma + 1]))
  }

  const base = `
    SELECT t.id texto_id, t.fonte_id, o.id obra_id, o.titulo,
           (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
             WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
      FROM texto t JOIN obra o ON o.id = t.obra_id
     WHERE o.trilho = 'A' AND o.idioma_original = 'pt'
       AND t.fonte = 'gutenberg' AND t.normalizado = 0
     ORDER BY o.id`

  const todas = banco.prepare(base).all()
  if (argv.includes('--tudo')) return todas

  const porAutor = new Map()
  return todas.filter(o => {
    if (!o.autor) return false
    const curado = CURADOS.find(c => o.autor.includes(c) || c.includes(o.autor))
    if (!curado) return false
    const n = (porAutor.get(curado) ?? 0) + 1
    porAutor.set(curado, n)
    return n <= TETO_POR_AUTOR
  })
}

async function main() {
  const banco = abrir()
  const fila = escolher(banco, process.argv)
  console.log(`${fila.length} obras para normalizar\n`)

  const poe = banco.prepare(
    'INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,?,?,?,?)')
  const limpa = banco.prepare('DELETE FROM capitulo WHERE texto_id = ?')
  const marca = banco.prepare('UPDATE texto SET normalizado = 1, palavras = ? WHERE id = ?')
  const mede = banco.prepare(
    `UPDATE obra SET paginas = ?, minutos_leitura = ?, atualizado_em = datetime('now') WHERE id = ?`)
  const indexa = banco.prepare(
    'INSERT INTO busca_capitulo (corpo, capitulo_id, texto_id) VALUES (?,?,?)')

  let ok = 0, falhou = 0
  for (const [k, o] of fila.entries()) {
    const nome = o.titulo.split('\n')[0].slice(0, 46)
    process.stdout.write(`[${String(k + 1).padStart(3)}/${fila.length}] ${nome.padEnd(48)}`)
    try {
      const html = await baixar(o.fonte_id)
      if (!html) { console.log('sem arquivo'); falhou++; continue }
      const caps = partir(html)
      if (!caps.length) { console.log('nao deu para partir'); falhou++; continue }

      const palavras = caps.reduce((s, c) => s + c.palavras, 0)
      banco.exec('BEGIN')
      limpa.run(o.texto_id)
      caps.forEach((c, i) => {
        const id = Number(poe.run(o.texto_id, i + 1, c.titulo, c.corpo, c.palavras).lastInsertRowid)
        indexa.run(texto(c.corpo), id, o.texto_id)
      })
      marca.run(palavras, o.texto_id)
      // 250 palavras por página, 220 por minuto — as médias usuais
      mede.run(Math.round(palavras / 250), Math.round(palavras / 220), o.obra_id)
      banco.exec('COMMIT')

      console.log(`${String(caps.length).padStart(4)} caps  ${(palavras / 1000).toFixed(0)}k palavras`)
      ok++
    } catch (e) {
      try { banco.exec('ROLLBACK') } catch {}
      console.log(`erro: ${e.message.slice(0, 40)}`)
      falhou++
    }
    await new Promise(r => setTimeout(r, PAUSA))
  }

  console.log(`\nnormalizadas ${ok}, falharam ${falhou}`)
  fechar()
}

main().catch(e => { console.error(e); process.exit(1) })
