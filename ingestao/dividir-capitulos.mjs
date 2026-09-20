// Livro que chegou numa página só, dividido em capítulos (20/09/2026).
//
//   node ingestao/dividir-capitulos.mjs --banco /dados/catalogo.db            # só mostra
//   node ingestao/dividir-capitulos.mjs --banco /dados/catalogo.db --texto 4959
//   node ingestao/dividir-capitulos.mjs --banco /dados/catalogo.db --gravar
//
// O dono abriu o site e achou o texto "bagunçado". Uma das causas, medida:
// 30 livros do acervo são UM capítulo só. "As Memórias de Sherlock Holmes"
// são 87 mil palavras numa página; "O Fantasma da Ópera", 78 mil; "Hamlet"
// inteiro, ato a ato, sem corte. No celular isso não é um livro, é um rolo.
//
// ─────────────────────────────────────────────────────────────
// DE ONDE VEM O DEFEITO
//
// Não é da tradução. É da FONTE: esses livros entraram pelo `.txt.utf-8` do
// Gutenberg, que é texto puro. O HTML do Gutenberg tem <h2> em cada capítulo
// e a ingestão corta por ele; o .txt não tem marca nenhuma — só uma linha
// curta, sozinha, entre duas linhas em branco. A ingestão não tinha o que
// cortar, e guardou o livro inteiro como capítulo 1.
//
// Quem traduziu depois herdou a página única, e por isso quase todos os 30
// são `fio_traducao`.
//
// COMO SE ACHA O CORTE
//
// A linha de título sobreviveu: ela é um <p> curto, sozinho, que não fecha
// frase e é seguido de prosa. O risco é cortar no lugar errado — uma fala
// curta ("Você o viu?") tem a mesma cara. Três travas contra isso:
//
//   1. o título tem FORMA de título: "Capítulo IV", "IV.", "IV. A cara
//      amarela", ou caixa alta, ou está no sumário do próprio livro;
//   2. não começa com aspas nem com travessão (isso é diálogo);
//   3. a divisão inteira só vale se der 3 capítulos ou mais, nenhum
//      ridiculamente curto, e nenhum engolindo mais da metade do livro.
//
// Falhando qualquer trava, o livro fica como está. Errar para menos aqui é
// barato (o livro continua como hoje); errar para mais corta um romance no
// meio de um diálogo.
//
// O SUMÁRIO DO PRÓPRIO LIVRO
//
// Dez dos trinta trazem "Conteúdo" logo no começo, com os nomes dos
// capítulos — mas amassados num parágrafo só, porque no .txt eles eram
// linhas seguidas sem linha em branco entre elas. Não dá para ler esse bolo
// como lista; dá para usá-lo como PENEIRA: parágrafo curto cujo texto
// aparece dentro do bolo é título de capítulo, com quase nenhuma dúvida.
// ─────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome)
  return i > 0 ? process.argv[i + 1] : padrao
}
const tem = (nome) => process.argv.includes(nome)

const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: !tem('--gravar') })
const soTexto = arg('--texto', null)
const gravar = tem('--gravar')

const semTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#[0-9]+;/g, ' ').replace(/[ ]+/g, ' ').trim()
const chave = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

// ── a forma de um título ────────────────────────────────────────────────
const ROMANO = '[IVXLC]+'
const FORMA_TITULO = [
  new RegExp('^(cap[ií]tulo|canto|ato|acto|livro|parte|carta|cena)[ ]*(' + ROMANO + '|[0-9]{1,3})?([ .:—–-]|$)', 'i'),
  new RegExp('^(' + ROMANO + '|[0-9]{1,3})[.):]?([ ]|$)'),
]
const TERMINA_FRASE = /[.!?…,;:]$/
const ABRE_FALA = /^["“«'—–-]/

function pareceTitulo(t, noSumario) {
  if (!t || t.length > 70) return false
  if (ABRE_FALA.test(t)) return false
  if (noSumario(t)) return true
  if (TERMINA_FRASE.test(t) && !/^(cap[ií]tulo|canto|ato|acto)/i.test(t) && !FORMA_TITULO[1].test(t)) return false
  for (const r of FORMA_TITULO) if (r.test(t)) return true
  // caixa alta com mais de uma palavra ("A HISTÓRIA DA PORTA")
  return t === t.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(t) && t.split(' ').length <= 9
}

/** O número de um título, seja ele romano ou arábico. null quando não há. */
const VALOR_ROMANO = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
export function numeroDe(titulo) {
  const t = String(titulo ?? '').trim()
  const arabico = t.match(/^(?:cap[ií]tulo|canto|ato|acto|parte|livro)?[ ]*([0-9]{1,3})(?![0-9])/i)
  if (arabico) return Number(arabico[1])
  const romano = t.match(/^(?:cap[ií]tulo|canto|ato|acto|parte|livro)?[ ]*([IVXLCDM]+)(?=[^A-ZÀ-Ý]|$)/)
  if (!romano) return null
  const letras = romano[1].toLowerCase()
  let total = 0
  for (let i = 0; i < letras.length; i++) {
    const v = VALOR_ROMANO[letras[i]]
    const prox = VALOR_ROMANO[letras[i + 1]]
    total += prox && prox > v ? -v : v
  }
  return total || null
}

// ── dividir um texto ────────────────────────────────────────────────────
const PARAGRAFO = /<p(?:[ ][^>]*)?>[\s\S]*?<\/p>|<h[1-6](?:[ ][^>]*)?>[\s\S]*?<\/h[1-6]>/g

function dividir(corpo) {
  const ps = corpo.match(PARAGRAFO)
  if (!ps || ps.length < 40) return null
  const textos = ps.map(semTags)

  // o sumário: o bolo que vem logo depois de "Conteúdo"
  let bolo = ''
  for (let i = 0; i < Math.min(ps.length, 40); i++) {
    if (/^(conte[úu]do|sum[áa]rio|[íi]ndice|contents)$/i.test(textos[i])) {
      for (let j = i + 1; j < Math.min(i + 8, ps.length); j++) if (textos[j].length > 60) { bolo += ' ' + chave(textos[j]) }
      break
    }
  }
  const noSumario = (t) => bolo.length > 80 && t.length >= 6 && bolo.includes(chave(t))

  // os cortes. O começo do livro (capa, autor, sumário) fica no primeiro
  // pedaço; só depois do 3º parágrafo um título conta.
  const cortes = []
  for (let i = 3; i < ps.length - 2; i++) {
    const t = textos[i]
    if (!pareceTitulo(t, noSumario)) continue
    const seguinte = textos[i + 1]
    if (!seguinte || seguinte.length < 40) continue        // título solto seguido de outro título curto: é sumário, não corpo
    if (cortes.length && i - cortes.at(-1) < 4) continue   // dois títulos colados: fica o primeiro
    cortes.push(i)
  }
  if (cortes.length < 2) return null

  const pedacos = []
  const limites = [0, ...cortes, ps.length]
  for (let k = 0; k < limites.length - 1; k++) {
    const de = limites[k]
    const ate = limites[k + 1]
    if (ate <= de) continue
    const blocos = ps.slice(de, ate)
    const palavras = blocos.reduce((s, p) => s + (semTags(p).match(/[^ ]+/g)?.length ?? 0), 0)
    pedacos.push({ titulo: k === 0 ? null : textos[de], corpo: blocos.join(''), palavras, de })
  }

  // ── as travas ──
  const corpoTodo = pedacos.reduce((s, p) => s + p.palavras, 0)
  const miolo = pedacos.slice(1)
  if (miolo.length < 3) return null

  // TRAVA DO NÚMERO QUE ANDA PARA TRÁS (20/09/2026)
  //
  // A primeira versão cortou "O Grand Babylon Hotel" em capítulos 15, 19, 25,
  // "dois" — nessa ordem. Números fora de ordem não são o índice do livro: são
  // a expressão "capítulo 15" aparecendo DENTRO da prosa, e cada casamento
  // desses corta um romance no meio de uma frase.
  //
  // E cortou os três Nietzsche em 96, 60 e 38 pedaços chamados "1.", "3.",
  // "5." — que são os AFORISMOS, numerados e recomeçando a cada seção. O
  // livro não tem 96 capítulos; tem 9 seções de aforismos numerados.
  //
  // Uma regra pega as duas coisas: se a maioria dos títulos traz número, esses
  // números têm que SUBIR. Recomeçar do 1 no meio, ou pular para trás, é sinal
  // de que o que está sendo lido não é o sumário do livro.
  const numeros = miolo.map((p) => numeroDe(p.titulo)).filter((n) => n != null)
  if (numeros.length >= Math.max(3, miolo.length * 0.5)) {
    for (let k = 1; k < numeros.length; k++) if (numeros[k] <= numeros[k - 1]) return null
  }

  // TRAVA DO TÍTULO REPETIDO: "TALES FÉRICAS" oito vezes não é capítulo, é
  // cabeçalho corrido da página que sobreviveu à ingestão.
  const contagem = new Map()
  for (const p of miolo) contagem.set(p.titulo, (contagem.get(p.titulo) ?? 0) + 1)
  if ([...contagem.values()].some((n) => n > 2)) return null
  // nenhum capítulo pode ser maior que metade do livro (sinal de que só um
  // corte pegou), e a mediana não pode ser de migalha
  const maior = Math.max(...miolo.map((p) => p.palavras))
  if (maior > corpoTodo * 0.5) return null
  const ordenados = miolo.map((p) => p.palavras).sort((a, b) => a - b)
  const mediana = ordenados[ordenados.length >> 1]
  if (mediana < 300) return null
  // e o miolo tem que ser o livro: a capa não pode ficar com tudo
  if (pedacos[0].palavras > corpoTodo * 0.25) return null
  return pedacos
}

// ── varredura ───────────────────────────────────────────────────────────
let sql = `SELECT t.id, t.obra_id, coalesce(o.titulo_pt, o.titulo) titulo, t.fonte, count(c.id) caps, sum(c.palavras) pal
  FROM texto t JOIN capitulo c ON c.texto_id = t.id JOIN obra o ON o.id = t.obra_id
  WHERE t.dono_id IS NULL GROUP BY t.id HAVING caps = 1 AND pal > 12000 ORDER BY pal DESC`
if (soTexto) sql = sql.replace('WHERE t.dono_id IS NULL', 'WHERE t.id = ' + Number(soTexto))
const alvos = banco.prepare(sql).all()

const pegarCap = banco.prepare('SELECT id, ordem, titulo, corpo FROM capitulo WHERE texto_id = ?')
let divididos = 0
let recusados = 0

for (const t of alvos) {
  const cap = pegarCap.get(t.id)
  const pedacos = dividir(cap.corpo ?? '')
  if (!pedacos) {
    recusados++
    console.log('  --  ' + String(t.id).padStart(5) + '  ' + (t.titulo || '').slice(0, 46).padEnd(48) + 'sem corte seguro')
    continue
  }
  divididos++
  console.log('  ok  ' + String(t.id).padStart(5) + '  ' + (t.titulo || '').slice(0, 46).padEnd(48) +
    pedacos.length + ' partes  (' + pedacos.slice(1, 5).map((p) => (p.titulo || '').slice(0, 22)).join(' | ') + ' …)')
  if (!gravar) continue

  banco.exec('BEGIN')
  try {
    banco.prepare('DELETE FROM capitulo WHERE texto_id = ?').run(t.id)
    const por = banco.prepare('INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?, ?, ?, ?, ?)')
    let ordem = 0
    for (const p of pedacos) {
      if (!p.palavras) continue
      por.run(t.id, ordem++, p.titulo, p.corpo, p.palavras)
    }
    banco.exec('COMMIT')
  } catch (e) {
    banco.exec('ROLLBACK')
    console.log('      !! ' + e.message)
  }
}

console.log('')
console.log(alvos.length + ' livros de um capítulo só; ' + divididos + ' dá para dividir, ' + recusados + ' não.')
if (!gravar) console.log('(nada foi gravado — rode com --gravar)')
else console.log('GRAVADO. Rode servidor/reindexar.mjs e ingestao/publicar.mjs depois.')
