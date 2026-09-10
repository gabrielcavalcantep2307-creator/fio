// Traduzir uma obra em domínio público, do original.
//
//   node ingestao/traduzir-obra.mjs \
//     --fonte http://gutenberg.net.au/ebooks01/0100011.txt \
//     --de en --titulo "A revolução dos bichos" --saida bichos
//
// O que sai é um arquivo em `dados/traducoes/<saida>.json`, com os capítulos
// prontos. Instalar no catálogo é o outro passo, `instalar-traducao.mjs` —
// porque traduzir é caro em tempo e instalar é barato, e juntar os dois num
// script só significa refazer horas de trabalho a cada erro de SQL.
//
// ─────────────────────────────────────────────────────────────
// O DIREITO, que é o que autoriza este arquivo a existir
//
// Não estamos pegando tradução de ninguém. Estamos traduzindo o ORIGINAL de
// uma obra cujos direitos patrimoniais já expiraram no Brasil.
//
// Lei 9.610/98, art. 14: "É titular de direitos de autor quem adapta, traduz,
// arranja ou orquestra obra caída no domínio público, não podendo opor-se a
// outra adaptação, arranjo, orquestração ou tradução, salvo se for cópia da
// sua."
//
// Ou seja: existir uma tradução comercial de Orwell não cria monopólio sobre
// traduzir Orwell. O limite é copiar a tradução alheia — e é justamente isso
// que este caminho NÃO faz, porque ele parte do inglês.
//
// O prazo é o do art. 41: setenta anos contados de 1º de janeiro do ano
// seguinte à morte. Orwell morreu em 1950, então é 2021.
//
// E o direito é `(texto, jurisdição)`, nunca um booleano. Animal Farm é
// domínio público no Brasil e SEGUE protegido nos Estados Unidos até 2041. É
// por isso que o servidor tem `FIO_JURISDICAO` e a tabela `direito` tem
// coluna de jurisdição: a mesma obra tem respostas diferentes conforme de
// onde se pergunta.
// ─────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { traduzir, motorDisponivel } from './motor-traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = join(RAIZ, 'dados', 'traducoes')
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

// Quantos parágrafos em voo ao mesmo tempo. Era dez, e dez foi demais: o
// serviço parou de responder no meio do segundo livro do dia. Três, com o
// freio adaptativo abaixo, é o ritmo que ele aguenta sem reclamar.
const EM_PARALELO = 3

const arg = (nome, padrao = null) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}

// ─────────────────────────────────────────────────────────────
// Recortar o livro de dentro do arquivo
// ─────────────────────────────────────────────────────────────

/**
 * Fora o cabeçalho e o rodapé da fonte.
 *
 * Cada casa marca o começo do próprio jeito, e errar aqui não dá erro: dá um
 * "capítulo 1" que é a licença do Projeto Gutenberg, traduzida com esmero.
 */
function soOLivro(bruto) {
  let t = bruto.replace(/\r\n/g, '\n')

  const inicios = [
    /\*\*\*\s*START OF TH(?:E|IS) PROJECT GUTENBERG[^\n]*\n/i,
    /\bTo contact Project Gutenberg of Australia go to[^\n]*\n/i,
  ]
  for (const re of inicios) {
    const m = t.match(re)
    if (m) { t = t.slice(m.index + m[0].length); break }
  }

  const fins = [
    /\*\*\*\s*END OF TH(?:E|IS) PROJECT GUTENBERG/i,
    /\nTHE END\b/,
    /\nThis site is full of FREE ebooks/i,
  ]
  for (const re of fins) {
    const m = t.match(re)
    if (m) { t = t.slice(0, m.index); break }
  }
  return t.trim()
}

/** Uma linha que é marca de capítulo, e não uma frase que começa com "Chapter". */
const MARCA = /^\s*((?:chapter|part|book|capítulo|parte|livro)\s+[ivxlcdm\d]+[.:]?|[ivxlcdm]{1,7}\.?)\s*$/i

/**
 * Parte o livro em capítulos.
 *
 * Se não houver marca nenhuma — e há livro assim — vira um capítulo só. É
 * melhor um texto inteiro que se lê do que dez pedaços cortados no lugar
 * errado por um palpite.
 */
function emCapitulos(texto) {
  const linhas = texto.split('\n')
  const marcas = []
  linhas.forEach((l, i) => { if (MARCA.test(l)) marcas.push(i) })

  if (marcas.length < 2) return [{ titulo: null, bruto: texto }]

  const saida = []
  const abertura = linhas.slice(0, marcas[0]).join('\n').trim()
  if (abertura.split(/\s+/).length > 60) saida.push({ titulo: null, bruto: abertura })

  marcas.forEach((inicio, k) => {
    const fim = k + 1 < marcas.length ? marcas[k + 1] : linhas.length
    saida.push({
      titulo: linhas[inicio].trim(),
      bruto: linhas.slice(inicio + 1, fim).join('\n').trim(),
    })
  })
  return saida.filter((c) => c.bruto)
}

/** Parágrafos: separados por linha em branco, com as quebras internas desfeitas. */
const emParagrafos = (bruto) => bruto
  .split(/\n\s*\n/)
  .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
  .filter(Boolean)

// ─────────────────────────────────────────────────────────────
// O caderno, que é o que torna isto refazível
//
// Um livro de cem mil palavras são milhares de chamadas e mais de uma hora.
// Cair no meio e recomeçar do zero seria inaceitável — e pior que inaceitável,
// seria desrespeitoso com um serviço gratuito. Cada unidade traduzida vai
// para um arquivo, indexada pelo resumo do texto de origem. Rodar de novo
// pula tudo que já saiu.
// ─────────────────────────────────────────────────────────────

const chave = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function abrirCaderno(nome) {
  mkdirSync(PASTA, { recursive: true })
  const caminho = join(PASTA, `${nome}.caderno.jsonl`)
  const feito = new Map()
  if (existsSync(caminho)) {
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      if (!linha.trim()) continue
      try { const { k, v } = JSON.parse(linha); feito.set(k, v) } catch { /* linha cortada por queda */ }
    }
  }
  return {
    feito,
    guardar(k, v) { feito.set(k, v); appendFileSync(caminho, JSON.stringify({ k, v }) + '\n') },
  }
}

// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// O freio que aprende, e por que ele precisou existir
//
// A Revolução dos Bichos saiu em três minutos com dez pedidos em voo. O 1984,
// logo depois, foi ficando lento e no parágrafo 75 o serviço parou de
// responder — "fetch failed", sem status, que é como um servidor diz "chega"
// sem se dar ao trabalho de explicar.
//
// A conclusão é simples e é justa: o MinT é de graça, é de uma fundação, e
// nós despejamos dois livros nele numa tarde. Insistir no mesmo ritmo depois
// de levar não é persistência, é abuso.
//
// Então a espera passa a ser adaptativa. Cada falha aumenta o intervalo entre
// pedidos para todo mundo, e cada sequência de acertos o devolve devagar. O
// livro demora mais e sempre termina — e o caderno garante que demorar não
// custa nada, porque nada do que já saiu é pedido de novo.
// ─────────────────────────────────────────────────────────────

let esperaEntrePedidos = 120
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function levouNao() {
  esperaEntrePedidos = Math.min(esperaEntrePedidos * 2, 15_000)
}
let seguidas = 0
function deuCerto() {
  if (++seguidas >= 20) { seguidas = 0; esperaEntrePedidos = Math.max(esperaEntrePedidos * 0.8, 120) }
}

async function comTentativas(fn, quantas = 6) {
  let ultimo
  for (let i = 0; i < quantas; i++) {
    try {
      await dormir(esperaEntrePedidos)
      const r = await fn()
      deuCerto()
      return r
    } catch (e) {
      ultimo = e
      seguidas = 0
      levouNao()
      // espera crescente NESTA unidade, além do freio geral
      await dormir(2000 * (i + 1) ** 2)
    }
  }
  throw ultimo
}

/** Traduz uma lista de unidades, em paralelo limitado, aproveitando o caderno. */
async function traduzirTudo(unidades, { de, glossario }, caderno, aoAndar) {
  const saida = new Array(unidades.length)
  let proxima = 0
  let prontas = 0

  const trabalhador = async () => {
    while (proxima < unidades.length) {
      const i = proxima++
      const bruto = unidades[i]
      const k = chave(`${de}:${bruto}`)

      if (caderno.feito.has(k)) saida[i] = caderno.feito.get(k)
      else {
        const t = await comTentativas(() => traduzir(bruto, { de, para: 'pt', glossario }))
        caderno.guardar(k, t)
        saida[i] = t
      }
      aoAndar(++prontas, unidades.length)
    }
  }

  await Promise.all(Array.from({ length: EM_PARALELO }, trabalhador))
  return saida
}

// ─────────────────────────────────────────────────────────────

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function principal() {
  const fonte = arg('fonte')
  const de = arg('de', 'en')
  const nome = arg('saida')
  const titulo = arg('titulo')
  if (!fonte || !nome) {
    console.error('uso: --fonte <url> --saida <nome> [--de en] [--titulo "..."]')
    process.exit(1)
  }

  const motor = motorDisponivel()
  console.log(`motor: ${motor.nome}, custo ${motor.custo}`)

  console.log(`baixando ${fonte}`)
  const r = await fetch(fonte, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`a fonte respondeu ${r.status}`)
  const bruto = await r.text()

  const livro = soOLivro(bruto)
  const capitulos = emCapitulos(livro)
  const porCapitulo = capitulos.map((c) => emParagrafos(c.bruto))
  const palavras = livro.split(/\s+/).filter(Boolean).length

  console.log(`${capitulos.length} capítulos, ${porCapitulo.flat().length} parágrafos, ${palavras} palavras`)

  // Os títulos entram na mesma fila que os parágrafos, com a cerquilha que
  // `prepararUnidade` sabe tirar antes de traduzir e recolocar depois.
  const fila = []
  const mapa = []
  capitulos.forEach((c, ci) => {
    if (c.titulo) { fila.push(`## ${c.titulo}`); mapa.push({ ci, tipo: 'titulo' }) }
    porCapitulo[ci].forEach((p, pi) => { fila.push(p); mapa.push({ ci, pi, tipo: 'p' }) })
  })

  const caderno = abrirCaderno(nome)
  console.log(`caderno: ${caderno.feito.size} unidades já traduzidas de antes`)

  const comeco = Date.now()
  const traduzidas = await traduzirTudo(fila, { de, glossario: {} }, caderno, (feitas, total) => {
    if (feitas % 25 !== 0 && feitas !== total) return
    const s = (Date.now() - comeco) / 1000
    const falta = s / feitas * (total - feitas)
    process.stdout.write(`\r  ${feitas}/${total}  ~${Math.round(falta / 60)} min restantes   `)
  })
  console.log()

  const prontos = capitulos.map((c, ci) => ({ ordem: ci + 1, titulo: null, paras: [] }))
  traduzidas.forEach((t, i) => {
    const m = mapa[i]
    if (m.tipo === 'titulo') prontos[m.ci].titulo = t.replace(/^#+\s*/, '')
    else prontos[m.ci].paras.push(t)
  })

  const saida = {
    titulo,
    fonte,
    idioma_origem: de,
    motor: motor.nome,
    traduzido_em: new Date().toISOString().slice(0, 10),
    palavras_original: palavras,
    capitulos: prontos.map((c) => ({
      ordem: c.ordem,
      titulo: c.titulo,
      corpo: c.paras.map((p) => `<p>${escapar(p)}</p>`).join(''),
      palavras: c.paras.join(' ').split(/\s+/).filter(Boolean).length,
    })),
  }

  const caminho = join(PASTA, `${nome}.json`)
  writeFileSync(caminho, JSON.stringify(saida, null, 1), 'utf8')
  console.log(`\npronto: ${caminho}`)
  console.log(`${saida.capitulos.length} capítulos, ${saida.capitulos.reduce((a, c) => a + c.palavras, 0)} palavras em português`)
  console.log('\ninstalar no catálogo:')
  console.log(`  node ingestao/instalar-traducao.mjs --arquivo ${nome} --obra <id>`)
}

principal().catch((e) => { console.error('\n' + e.message); process.exit(1) })
