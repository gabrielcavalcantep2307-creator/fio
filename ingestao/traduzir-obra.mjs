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
import { traduzir, motorDisponivel, escolherMotor } from './motor-traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = join(RAIZ, 'dados', 'traducoes')
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

// Quantos parágrafos em voo ao mesmo tempo. Era três — conservador demais. O
// MinT aguentou dez numa rajada; oito é o ponto em que ganha velocidade e
// ainda deixa margem, e o freio adaptativo abaixo recua sozinho se ele
// reclamar. Dá para ajustar por FIO_PARALELO sem mexer no código.
const EM_PARALELO = Number(process.env.FIO_PARALELO || 8)

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
export function soOLivro(bruto) {
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

// ─────────────────────────────────────────────────────────────
// O que é marca de capítulo
//
// A primeira versão só via numeral: "Chapter IV", "Parte 2". As *Meditações*
// de Marco Aurélio saíram num capítulo só de doze, porque o original marca os
// livros por EXTENSO — "THE FIRST BOOK", "THE SECOND BOOK" — e nenhuma dessas
// linhas tem número.
//
// Errar para menos não dá erro: vira um capítulo gigante, que ainda se lê e
// estraga o progresso, o anti-spoiler e a sensação de avanço. Errar para mais
// é pior, então a linha tem que ser CURTA e ser só isso: um cabeçalho solto
// numa linha, e não uma frase que por acaso começa com "Chapter".
// ─────────────────────────────────────────────────────────────
const ORDINAIS = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth'
  + '|eleventh|twelfth|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]'
  + '|sext[oa]|sétim[oa]|setim[oa]|oitav[oa]|non[oa]|décim[oa]|decim[oa]'
const NOMES = 'chapter|part|book|canto|act|scene|capítulo|capitulo|parte|livro|ato|cena'

// As três formas que trazem o NOME da divisão junto. Separadas do numeral
// romano pelado porque só elas podem receber um título colado — ver abaixo.
const COM_NOME = String.raw`(?:the\s+)?(?:${NOMES})\s+(?:[ivxlcdm\d]+|${ORDINAIS})` // Chapter IV
  + String.raw`|(?:the\s+|o\s+|a\s+)?(?:${ORDINAIS})\s+(?:${NOMES})`                 // THE FIRST BOOK
  + String.raw`|(?:the\s+)?(?:${NOMES})\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)`

const MARCA = new RegExp(
  String.raw`^\s*(?:(?:${COM_NOME})[.:]?`
  + String.raw`|[ivxlcdm]{1,7}\.?`                                            // IV.
  + String.raw`)\s*$`, 'i')

// ── o cabeçalho com o título colado ──
//
// "FIRST BOOK. THE WORLD AS IDEA." O `MARCA` acima exige que a linha ACABE no
// marcador, e por isso as quatro divisões de *O Mundo como Vontade e
// Representação* passaram despercebidas: o livro saiu num capítulo só de
// 182.241 palavras, que é uma parede, não um texto que alguém lê.
//
// O numeral romano pelado fica de fora desta forma de propósito. "IV." sozinho
// numa linha é marca de capítulo; "IV. and then he left the room" é uma frase
// que começa com um numeral, e não há como separar as duas sem a regra de que
// ali a linha termina.
const MARCA_COM_TITULO = new RegExp(String.raw`^\s*(?:${COM_NOME})\s*[.:—–-]\s*\S`, 'i')

// ── o numeral romano com título, que só vale em MAIÚSCULA ──
//
// "I. A SCANDAL IN BOHEMIA". É assim que o Gutenberg marca os doze contos de
// *As Aventuras de Sherlock Holmes*, e sem esta forma eles saem em 5 pedaços
// com um de 92.615 palavras — metade do livro num capítulo só.
//
// O perigo é o parágrafo que começa com numeral: "IV. and then he left the
// room". A caixa desfaz o empate. Um cabeçalho de conto grita; uma frase no
// meio da narrativa, não. Nenhuma frase corrida de um romance vem inteira em
// maiúscula, e é só por isso que esta forma pode existir.
const ROMANO_COM_TITULO = /^\s*[ivxlcdm]{1,7}\.\s+(\S.*)$/i

// Um título de capítulo é uma linha curta e solta. Este teto é o que separa um
// cabeçalho de um parágrafo que por acaso começa com "Chapter", e é ele que
// deixa as formas com título serem generosas sem ficarem perigosas.
const ehMarca = (l) => {
  const t = l.trim()
  if (!t || t.length > 70) return false
  if (MARCA.test(t) || MARCA_COM_TITULO.test(t)) return true

  const romano = t.match(ROMANO_COM_TITULO)
  return Boolean(romano) && romano[1] === romano[1].toUpperCase() && /\p{Lu}/u.test(romano[1])
}

/**
 * Parte o livro em capítulos.
 *
 * Se não houver marca nenhuma — e há livro assim — vira um capítulo só. É
 * melhor um texto inteiro que se lê do que dez pedaços cortados no lugar
 * errado por um palpite.
 */
export function emCapitulos(texto) {
  const linhas = texto.split('\n')
  const marcas = []
  linhas.forEach((l, i) => { if (ehMarca(l)) marcas.push(i) })

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
/**
 * Traduz uma unidade — e, se ela for grande demais para o serviço, em partes.
 *
 * O MinT devolveu 413 num parágrafo do Schopenhauer. 413 é "payload too
 * large": não é falha de rede, não é freio, é o texto não caber. Repetir seis
 * vezes o mesmo parágrafo grande demais é repetir seis vezes a mesma recusa.
 *
 * Então quando ele recusa por tamanho, o parágrafo é partido em frases e
 * remontado. Parágrafo de filosofia alemã tem períodos de duzentas palavras,
 * e é exatamente onde isso acontece.
 */
async function emPedacos(bruto, { de, glossario }) {
  try {
    return await traduzir(bruto, { de, para: 'pt', glossario })
  } catch (e) {
    if (!/413/.test(e.message) || bruto.length < 600) throw e

    // corta no ponto final seguido de espaço, que é o fim de frase que não
    // erra em abreviação de uma letra só
    const frases = bruto.split(/(?<=[.!?])\s+(?=[A-ZÀ-Þ"«])/)
    if (frases.length < 2) throw e

    const partes = []
    for (const f of frases) partes.push(await traduzir(f, { de, para: 'pt', glossario }))
    return partes.join(' ')
  }
}

// ─────────────────────────────────────────────────────────────
// A VELOCIDADE vem do paralelismo, e não de juntar parágrafos
//
// Tentou-se juntar vários parágrafos num pedido só, separados por um marcador
// " @@@ " que o MinT devolveria intacto. Em texto limpo ele devolve; em livro
// de verdade, não — a cada trinta parágrafos ele engole um marcador perto de
// um asterisco de quebra de cena, de um verso ou de um título sem ponto final.
// Um marcador comido é um parágrafo colado no do lado, que é pior que um
// parágrafo no original. Medido na Alice: nove de cada doze lotes desalinhavam.
//
// O que É confiável é o pedido de um parágrafo só — esse sempre volta certo.
// Então a velocidade vem de mandar MUITOS ao mesmo tempo: o MinT aguentou dez
// em paralelo numa rajada, e o freio adaptativo recua sozinho se ele reclamar.
// Seis a oito em voo é várias vezes o ritmo dos três antigos, sem nenhum risco
// de desalinhar.
// ─────────────────────────────────────────────────────────────

async function traduzirTudo(unidades, { de, glossario }, caderno, aoAndar) {
  const saida = new Array(unidades.length)
  const falhou = []
  let proxima = 0
  let prontas = 0

  const trabalhador = async () => {
    while (proxima < unidades.length) {
      const i = proxima++
      const bruto = unidades[i]
      const k = chave(`${de}:${bruto}`)

      if (caderno.feito.has(k)) saida[i] = caderno.feito.get(k)
      else {
        try {
          const t = await comTentativas(() => emPedacos(bruto, { de, glossario }))
          caderno.guardar(k, t)
          saida[i] = t
        } catch (e) {
          // ── um parágrafo não derruba o livro ──
          //
          // Um livro com um parágrafo no original é MUITO melhor que nenhum
          // livro. O original fica no lugar, a falha é contada, e no fim se
          // decide se foram poucas demais para importar ou muitas demais para
          // aceitar. O caderno não guarda a falha, então rodar de novo tenta
          // outra vez — e o serviço que recusou hoje costuma aceitar amanhã.
          falhou.push({ i, porque: e.message })
          saida[i] = bruto
        }
      }
      aoAndar(++prontas, unidades.length)
    }
  }

  await Promise.all(Array.from({ length: EM_PARALELO }, trabalhador))

  // ── quantas falhas ainda são poucas ──
  //
  // Um parágrafo no original em vinte mil é um tropeço que ninguém nota.
  // Um em cada vinte é um livro meio traduzido se passando por traduzido, e
  // isso o rótulo de "tradução automática" não cobre: ele avisa sobre a
  // QUALIDADE da tradução, não sobre metade do texto não ter sido traduzida.
  //
  // Dois por cento é onde eu ponho a linha. Abaixo disso entra com o aviso;
  // acima, o livro não sai, e rodar de novo aproveita tudo que já saiu.
  const proporcao = falhou.length / Math.max(unidades.length, 1)
  if (proporcao > 0.02) {
    throw new Error(
      `${falhou.length} de ${unidades.length} parágrafos não traduziram `
      + `(${(proporcao * 100).toFixed(1)}%). O primeiro: ${falhou[0]?.porque ?? '?'}`)
  }
  if (falhou.length) {
    console.log(`\n  ${falhou.length} parágrafo(s) ficaram no original; rodar de novo tenta outra vez`)
  }
  return saida
}

// ─────────────────────────────────────────────────────────────

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Baixa a fonte, com prazo e com recomeço.
 *
 * O `fetch` do Node não desiste sozinho. Se o servidor aceita a conexão e
 * depois não fala mais nada — o que Gutenberg faz quando está sobrecarregado
 * — a espera é eterna, e "eterna" aqui não é figura: em 14/09/2026 a esteira
 * ficou 1h34 parada em Othello sem gastar 5 segundos de processador. Ninguém
 * consegue distinguir isso de "está traduzindo um livro grande", e é por isso
 * que custa caro: o defeito não parece defeito.
 *
 * Três minutos é folgado para um .txt de Gutenberg, e três tentativas com
 * espera crescente cobrem a queda passageira sem insistir com quem caiu.
 */
async function baixarFonte(fonte, tentativas = 3) {
  let ultimo
  for (let i = 0; i < tentativas; i++) {
    if (i) {
      const espera = 5_000 * 2 ** (i - 1)
      console.log(`   (${ultimo}; tentando de novo em ${espera / 1000}s)`)
      await dormir(espera)
    }
    try {
      const r = await fetch(fonte, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(180_000),
      })
      if (!r.ok) throw new Error(`a fonte respondeu ${r.status}`)
      return await r.text()
    } catch (e) {
      // `TimeoutError` é o que o AbortSignal levanta, e a mensagem dele sozinha
      // ("The operation was aborted due to timeout") não diz de quem se
      // esperava. Trocada por uma que diz.
      ultimo = e.name === 'TimeoutError'
        ? 'a fonte aceitou a conexão e não respondeu em 3 min'
        : e.message
    }
  }
  throw new Error(`não deu para baixar a fonte: ${ultimo}`)
}

async function principal() {
  const fonte = arg('fonte')
  const de = arg('de', 'en')
  const nome = arg('saida')
  const titulo = arg('titulo')
  if (!fonte || !nome) {
    console.error('uso: --fonte <url> --saida <nome> [--de en] [--titulo "..."]')
    process.exit(1)
  }

  console.log(`baixando ${fonte}`)
  const bruto = await baixarFonte(fonte)

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

  const escolha = await escolherMotor({ caracteres: fila.reduce((n, u) => n + u.length, 0), de, jaComecado: caderno.feito.size > 0 })
  const motor = motorDisponivel()
  console.log(`motor: ${motor.nome} — ${escolha.porque}`)

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

  // ── a trava do livro vazio ──
  //
  // Uma fonte pode responder 200 e não ser livro nenhum. Aconteceu: a ficha de
  // *A metamorfose* apontava para o README de um AUDIOLIVRO — cabeçalho do
  // Gutenberg, um aviso e um índice de faixas. Depois de recortar o cabeçalho
  // sobraram ZERO palavras, e o arquivo seria gravado, instalado e publicado
  // como um livro vazio com o nome certo na capa.
  //
  // Nada disso dá erro em lugar nenhum. Por isso a trava é aqui, antes de
  // gravar, e ela é grosseira de propósito: nenhum livro tem menos de
  // quinhentas palavras.
  const emPortugues = saida.capitulos.reduce((a, c) => a + c.palavras, 0)
  if (emPortugues < 500) {
    throw new Error(`saíram só ${emPortugues} palavras — esta fonte não é um livro`)
  }

  const caminho = join(PASTA, `${nome}.json`)
  writeFileSync(caminho, JSON.stringify(saida, null, 1), 'utf8')
  console.log(`\npronto: ${caminho}`)
  console.log(`${saida.capitulos.length} capítulos, ${saida.capitulos.reduce((a, c) => a + c.palavras, 0)} palavras em português`)
  console.log('\ninstalar no catálogo:')
  console.log(`  node ingestao/instalar-traducao.mjs --arquivo ${nome} --obra <id>`)
}

// ── só roda quando CHAMADO, e não quando importado ──
//
// Sem esta guarda, `import('./traduzir-obra.mjs')` traduz um livro. Foi o que
// aconteceu com `normalizar.mjs` em 11/09: importá-lo disparava a ingestão
// inteira, que travava o banco, e o erro que aparecia lá na frente era
// "database is locked" — verdadeiro, e a uma hora de distância da causa.
//
// Com ela, o divisor de capítulos pode ser importado por um teste sem que nada
// aconteça — que é o que torna possível conferir uma mudança no `MARCA` contra
// vinte livros de verdade antes de soltá-la na esteira.
if (process.argv[1]?.endsWith('traduzir-obra.mjs')) {
  principal().catch((e) => { console.error('\n' + e.message); process.exit(1) })
}
