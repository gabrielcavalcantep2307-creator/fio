// Livro nativo do Gutenberg mal dividido, reprocessado (21/09/2026).
//
//   node ingestao/renormalizar-parede.mjs            # só mostra
//   node ingestao/renormalizar-parede.mjs --obra 525
//   node ingestao/renormalizar-parede.mjs --gravar
//
// Livros de fonte='gutenberg' (já em português, não passam pela esteira) são
// divididos por ingestao/normalizar.mjs → partir(), que escolhe UM nível de
// cabeçalho (o que aparecer 3+ vezes) e corta só por ele. Funciona na maioria,
// mas erra de duas formas:
//
//   PAREDE      o livro mistura níveis (PARTE em <h2>, CAPÍTULO em <h3>) ou o
//               nível escolhido é grosso demais — sobra um "capítulo" de
//               20-200 mil palavras (raio-x chama de PAREDE, >15 mil palavras)
//   SEM TÍTULO  nenhum nível de cabeçalho apareceu 3+ vezes — o livro cai no
//               modo "sem cabeçalho nenhum" e vira blocos arbitrários de 60
//               parágrafos, todos com titulo=null (95 livros, achado pelo
//               raio-x-completo.mjs — muitos nem aparecem como parede porque
//               os blocos são pequenos, só sem sentido nenhum)
//
// Este arquivo não troca a regra de normalizar.mjs (517 livros já passam bem
// por ela); ataca só os que sobraram, com uma leitura mais solta: qualquer
// <h2>-<h6> conta como possível título, não só o nível mais comum. Como o
// título e o texto vêm do MESMO html, não há problema de idioma nem de
// contagem de parágrafo batendo entre duas fontes — a árvore de blocos é
// cortada direto nas posições dos títulos.
//
// A limpeza é a MESMA de normalizar.mjs (servidor/sanear.mjs → limpar): o
// HTML do Gutenberg é entrada de fora, e o corpo vai para
// dangerouslySetInnerHTML no leitor. Pular o saneador aqui seria abrir a
// mesma porta que ele foi criado para fechar.

import { DatabaseSync } from 'node:sqlite'
import { limpar } from '../servidor/sanear.mjs'

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
const tem = (n) => process.argv.includes(n)
const gravar = tem('--gravar')
const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: !gravar })
const soObra = arg('--obra', null)

const PAREDE = 15000
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

const texto = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim()
const contarPalavras = (html) => texto(html).split(' ').filter(Boolean).length

const NAO_E_DIVISAO = /^(contents|table of contents|index|footnotes?|notes?|transcriber'?s? notes?|illustrations?|list of illustrations|the end|finis|fim|conteúdo|sumário|índice|notas)\.?$/i

async function baixar(gid) {
  const tentativas = [
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}-images.html`,
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.html`,
    `https://www.gutenberg.org/files/${gid}/${gid}-h/${gid}-h.htm`,
  ]
  for (const url of tentativas) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })
      if (r.ok) return await r.text()
    } catch { /* tenta a próxima */ }
  }
  return null
}

/** Todos os <h2>-<h6> contam como possível título — não só o nível mais comum. */
function dividirSolto(corpo) {
  let miolo = corpo
  const i = miolo.search(/\*\*\*\s*START OF TH(E|IS) PROJECT GUTENBERG/i)
  const f = miolo.search(/\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG/i)
  if (i > -1) miolo = miolo.slice(miolo.indexOf('>', i) + 1)
  if (f > -1 && i > -1) miolo = miolo.slice(0, miolo.search(/\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG/i))
  else if (f > -1) miolo = miolo.slice(0, f)

  const marcas = [...miolo.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => ({ index: m.index, fim: m.index + m[0].length, nivel: Number(m[1]), texto: texto(m[2]) }))
    .filter((m) => m.nivel > 1 && m.texto && m.texto.length <= 160 && !NAO_E_DIVISAO.test(m.texto))
  if (marcas.length < 3) return null

  const pedacos = []
  const abertura = miolo.slice(0, marcas[0].index)
  if (contarPalavras(abertura) > 400) pedacos.push({ titulo: 'Abertura', html: abertura })
  marcas.forEach((m, k) => {
    const fim = k + 1 < marcas.length ? marcas[k + 1].index : miolo.length
    pedacos.push({ titulo: m.texto.slice(0, 120), html: miolo.slice(m.fim, fim) })
  })

  return pedacos
    .map((p) => ({ titulo: p.titulo, corpo: limpar(p.html) }))
    .map((p) => ({ ...p, palavras: contarPalavras(p.corpo) }))
    .filter((p) => p.palavras >= 25)
}

let sql = `SELECT t.id texto_id, t.fonte_id, o.id obra_id, coalesce(o.titulo_pt, o.titulo) titulo,
    count(c.id) caps, max(c.palavras) maior,
    sum(case when c.titulo is null or trim(c.titulo) = '' then 1 else 0 end) semTitulo
  FROM texto t JOIN capitulo c ON c.texto_id = t.id JOIN obra o ON o.id = t.obra_id
  WHERE t.fonte = 'gutenberg' AND t.dono_id IS NULL
  GROUP BY t.id HAVING maior > ${PAREDE} OR semTitulo > 0 ORDER BY semTitulo DESC, maior DESC`
if (soObra) sql = sql.replace("WHERE t.fonte = 'gutenberg'", "WHERE t.fonte = 'gutenberg' AND o.id = " + Number(soObra))
const candidatos = banco.prepare(sql).all()

const linha = (id, titulo, resto) => console.log('  ' + resto.slice(0, 4).padEnd(4) + '  ' + String(id).padStart(5) + '  ' + (titulo || '').slice(0, 46).padEnd(48) + resto.slice(4))

let feitos = 0, semHtml = 0, semCorte = 0

for (const t of candidatos) {
  if (!t.fonte_id) { semHtml++; linha(t.obra_id, t.titulo, '--  sem fonte_id'); continue }

  let html
  try { html = await baixar(t.fonte_id) } catch (e) { linha(t.obra_id, t.titulo, '--  html: ' + e.message); continue }
  if (!html) { semHtml++; linha(t.obra_id, t.titulo, '--  sem html no Gutenberg'); continue }

  const pedacos = dividirSolto(html)
  if (!pedacos || pedacos.length < 4) {
    semCorte++
    linha(t.obra_id, t.titulo, '--  sem título suficiente para cortar')
    continue
  }

  const corpoTodo = pedacos.reduce((s, p) => s + p.palavras, 0)
  const miolo = pedacos[0].titulo === 'Abertura' ? pedacos.slice(1) : pedacos
  const maiorNovo = Math.max(...miolo.map((p) => p.palavras))
  const ordenados = miolo.map((p) => p.palavras).sort((a, b) => a - b)
  const mediana = ordenados[ordenados.length >> 1]
  const abertura = pedacos[0].titulo === 'Abertura' ? pedacos[0].palavras : 0

  if (miolo.length < 3 || maiorNovo > corpoTodo * 0.6 || abertura > corpoTodo * 0.25 || mediana < 300) {
    semCorte++
    linha(t.obra_id, t.titulo, '--  corte achado mas desequilibrado (mediana ' + mediana + ')')
    continue
  }
  // dividirSolto sempre dá título real (do próprio <hN>) ou 'Abertura' —
  // nunca null. Então melhora se reduz a parede OU se o livro de hoje tinha
  // capítulo sem título nenhum (blocos arbitrários de 60 parágrafos).
  const melhoraParede = maiorNovo < t.maior && pedacos.length > t.caps
  const melhoraTitulo = t.semTitulo > 0
  if (!melhoraParede && !melhoraTitulo) {
    semCorte++
    linha(t.obra_id, t.titulo, '--  não melhora o que já está (' + t.caps + '→' + pedacos.length + ' caps, ' + t.maior + '→' + maiorNovo + ' palavras)')
    continue
  }

  feitos++
  linha(t.obra_id, t.titulo, 'ok  ' + t.caps + ' → ' + pedacos.length + ' partes  (maior: ' + t.maior + ' → ' + maiorNovo + ')' +
    (melhoraTitulo ? '  +título' : ''))

  if (!gravar) continue
  banco.exec('BEGIN')
  try {
    banco.prepare('DELETE FROM capitulo WHERE texto_id = ?').run(t.texto_id)
    const por = banco.prepare('INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?, ?, ?, ?, ?)')
    let ordem = 0
    for (const p of pedacos) { if (!p.palavras) continue; por.run(t.texto_id, ordem++, p.titulo, p.corpo, p.palavras) }
    banco.prepare('UPDATE texto SET palavras = ? WHERE id = ?').run(corpoTodo, t.texto_id)
    banco.prepare("UPDATE obra SET paginas = ?, minutos_leitura = ?, atualizado_em = datetime('now') WHERE id = ?")
      .run(Math.round(corpoTodo / 250), Math.round(corpoTodo / 220), t.obra_id)
    banco.exec('COMMIT')
  } catch (e) {
    banco.exec('ROLLBACK')
    console.log('      !! ' + e.message)
  }
}

console.log('')
console.log(candidatos.length + ' livros gutenberg com parede ou sem título; ' + feitos + ' melhoraram, ' +
  semHtml + ' sem html, ' + semCorte + ' sem corte melhor que o de hoje.')
if (!gravar) console.log('(nada foi gravado — rode com --gravar)')
else console.log('GRAVADO. Rode servidor/reindexar.mjs e ingestao/publicar.mjs depois.')
