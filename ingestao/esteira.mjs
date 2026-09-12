// A esteira: traduz, um a um, tudo que o achador de fontes encontrou.
//
//   node ingestao/esteira.mjs [--quantos 20] [--minutos 120]
//
// Lê `dados/traducoes/esteira.json` — o plano que `achar-fonte.mjs` produz — e
// roda `traduzir-obra.mjs` para cada linha dele. O que sai são arquivos
// `obraNNN.json` prontos para `instalar-traducao.mjs`.
//
// ─────────────────────────────────────────────────────────────
// POR QUE CADA LIVRO É UM PROCESSO SEPARADO
//
// Podia ser tudo num laço dentro deste arquivo, e seria mais rápido de
// escrever. Não é o que se quer numa esteira que vai rodar horas sem ninguém
// olhando.
//
// Livro é matéria bruta: um vem sem marca de capítulo, outro tem o rodapé em
// outro lugar, um terceiro derruba o processo com um caractere que ninguém
// previu. Num laço só, o vigésimo livro estragado leva junto os dezenove que
// já tinham saído. Em processos separados, ele leva só a si mesmo, a esteira
// anota e segue.
//
// O caderno de cada livro faz o resto: rodar de novo não repete nada do que
// já saiu, então "seguir" é literalmente seguir, e não recomeçar.
// ─────────────────────────────────────────────────────────────
//
// A ORDEM: prateleira primeiro, e depois do menor para o maior.
//
// Prateleira primeiro porque é o que alguém vai procurar hoje. Menor primeiro
// porque dez livros curtos prontos valem mais, para quem está esperando, que
// um Guerra e Paz a caminho — e porque livro curto que falha revela o defeito
// cedo, quando ainda dá para consertar antes dos grandes.

import { spawn } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = join(RAIZ, 'dados', 'traducoes')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const quantos = Number(arg('quantos', 999))
const minutos = Number(arg('minutos', 600))

// ── `--subir`: a esteira publica sozinha ──
//
// De quantos em quantos livros ela para e manda para a VPS. Não é a cada um,
// e o motivo é o `reindexar`: ele refaz o índice dos 86 mil capítulos numa
// escrita só e leva uns cinco minutos, independentemente de terem entrado um
// livro ou dez. Subir a cada livro gastaria mais tempo reindexando do que
// traduzindo.
//
// Cinco é o número em que o custo do índice se dilui e o leitor ainda vê
// coisa nova aparecendo no mesmo dia.
const subirACada = process.argv.includes('--subir') ? Number(arg('lote', 5)) : 0
const plano = JSON.parse(readFileSync(join(PASTA, 'esteira.json'), 'utf8')).plano

/** Roda um comando e devolve o que ele disse, sem deixar ninguém sem saída. */
const rodar = (args, programa = process.execPath, argsDele = null) => new Promise((pronto) => {
  const p = spawn(programa, argsDele ?? args, { cwd: RAIZ })
  let saida = ''
  p.stdout.on('data', (d) => { saida += d })
  p.stderr.on('data', (d) => { saida += d })
  p.on('close', (codigo) => pronto({ codigo, saida }))
})

const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

/**
 * O tamanho de cada fonte, perguntado antes de baixar.
 *
 * Um `HEAD` custa milissegundos e responde a única coisa que decide a ordem.
 * Sem ele a esteira começa pelo que está em prateleira — e *Os Irmãos
 * Karamázov*, 350 mil palavras e horas de tradução, segura os outros trinta
 * e cinco atrás de si.
 */
async function medir(itens) {
  const com = []
  for (const o of itens) {
    let bytes = Number.MAX_SAFE_INTEGER
    try {
      const r = await fetch(o.fonte, { method: 'HEAD', headers: { 'user-agent': UA } })
      const n = Number(r.headers.get('content-length'))
      if (r.ok && n > 0) bytes = n
    } catch { /* sem resposta, vai para o fim da fila */ }
    com.push({ ...o, bytes })
  }
  return com
}

// ── a ordem: do MENOR para o maior ──
//
// Vinte livros curtos prontos hoje valem mais, para quem está esperando, do
// que um Guerra e Paz a caminho. E livro curto que falha revela o defeito
// cedo, quando ainda dá para consertar antes de custar uma hora.
//
// Prateleira continua pesando, mas como DESEMPATE: dentro de uma faixa de
// tamanho parecida, o que alguém vai procurar hoje sai antes.

/**
 * Manda para a VPS o que já saiu.
 *
 * `subir-traducoes.sh` é idempotente: ele leva tudo que está na pasta, e
 * instalar de novo a mesma obra apaga a anterior antes de gravar. Então não
 * importa que os livros das rodadas passadas subam junto — só custa alguns
 * segundos de `scp` e evita ter que lembrar quais já foram.
 *
 * Se a subida falhar — e a VPS já caiu no meio de um deploy — a esteira NÃO
 * para. Traduzir é a parte cara; publicar é um comando que se roda de novo
 * depois, e perder uma hora de tradução por causa de uma porta fechada seria
 * o pior negócio possível.
 */
async function publicar() {
  const t0 = Date.now()
  const { codigo, saida } = await rodar([], 'bash', [join(RAIZ, 'infra', 'subir-traducoes.sh')])
  const min = Math.round((Date.now() - t0) / 60_000)
  const linha = saida.split('\n').reverse()
    .find((l) => /instaladas|prontas|responde/.test(l)) ?? ''
  console.log(codigo === 0
    ? `   ↑ publicado em ${min} min — ${linha.trim().slice(0, 70)}\n`
    : `   ↑ a subida falhou (${linha.trim().slice(0, 70)}); a esteira segue\n`)
}

console.log('medindo as fontes…')
const fila = (await medir(plano))
  .sort((a, b) => a.bytes - b.bytes || (b.emTrilha ?? 0) - (a.emTrilha ?? 0))
  .slice(0, quantos)

console.log(`esteira: ${fila.length} obras, do menor para o maior\n`)

const prazo = Date.now() + minutos * 60_000
const feitos = []
const falhas = []
let novos = 0

for (const [i, o] of fila.entries()) {
  if (Date.now() > prazo) { console.log('\n(prazo desta rodada acabou; o resto fica para a próxima)'); break }

  const arquivo = join(PASTA, `${o.saida}.json`)
  const cabeca = `[${i + 1}/${fila.length}] obra ${o.obra} — ${o.titulo}`

  if (existsSync(arquivo)) { console.log(`${cabeca}: já traduzida`); feitos.push(o); continue }

  console.log(`${cabeca}\n   de ${o.de}, ${o.fonte}`)
  const t0 = Date.now()
  const { codigo, saida } = await rodar([
    join(RAIZ, 'ingestao', 'traduzir-obra.mjs'),
    '--fonte', o.fonte, '--de', o.de, '--titulo', o.titulo, '--saida', o.saida,
  ])
  const min = Math.round((Date.now() - t0) / 60_000)

  if (codigo === 0 && existsSync(arquivo)) {
    const t = JSON.parse(readFileSync(arquivo, 'utf8'))
    const palavras = t.capitulos.reduce((a, c) => a + c.palavras, 0)
    console.log(`   pronto: ${t.capitulos.length} capítulos, ${palavras} palavras, ${min} min\n`)
    feitos.push({ ...o, capitulos: t.capitulos.length, palavras })

    // Publica de lote em lote, para o livro aparecer no site enquanto a
    // esteira ainda anda. `novos` conta só o que saiu NESTA rodada: as que já
    // estavam traduzidas de antes não disparam subida, senão a primeira volta
    // do laço publicaria tudo de novo sem ter produzido nada.
    novos++
    if (subirACada && novos % subirACada === 0) await publicar()
  } else {
    // A primeira linha que parece erro, e não a última linha da saída — que
    // num processo que morreu é sempre "Node.js v22.x" e não diz nada. Esse
    // engano escondeu por uma hora que o banco estava travado.
    const linhas = saida.split('\n').map((l) => l.trim()).filter(Boolean)
    const erro = linhas.find((l) => /^\w*Error\b|^Erro\b|palavras — esta fonte/.test(l))
      ?? linhas.at(-1) ?? 'sem mensagem'
    console.log(`   FALHOU (${min} min): ${erro.slice(0, 140)}\n`)
    falhas.push({ obra: o.obra, titulo: o.titulo, fonte: o.fonte, erro: erro.slice(0, 300) })
  }
}

// A última subida, para o que sobrou do lote não ficar esperando a próxima
// rodada. Se `novos` for zero, não há o que publicar.
if (subirACada && novos % subirACada !== 0 && novos > 0) {
  console.log('── última subida ──')
  await publicar()
}

const relatorio = join(PASTA, 'esteira-relatorio.json')
writeFileSync(relatorio, JSON.stringify({ feito_em: new Date().toISOString(), feitos, falhas }, null, 1), 'utf8')

console.log(`\n${feitos.length} traduzidas, ${falhas.length} falharam`)
console.log(`relatório em ${relatorio}`)
if (falhas.length) {
  console.log('\n── as que falharam ──')
  for (const f of falhas) console.log(`  ${String(f.obra).padStart(5)} ${String(f.titulo).slice(0, 34).padEnd(34)} ${f.erro.split('\n')[0].slice(0, 60)}`)
}
console.log('\ninstalar tudo que saiu:\n  node ingestao/instalar-lote.mjs')
