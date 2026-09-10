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
const plano = JSON.parse(readFileSync(join(PASTA, 'esteira.json'), 'utf8')).plano

/** Roda um comando e devolve o que ele disse, sem deixar ninguém sem saída. */
const rodar = (args) => new Promise((pronto) => {
  const p = spawn(process.execPath, args, { cwd: RAIZ })
  let saida = ''
  p.stdout.on('data', (d) => { saida += d })
  p.stderr.on('data', (d) => { saida += d })
  p.on('close', (codigo) => pronto({ codigo, saida }))
})

// Prateleira primeiro; depois o mais baixado, que é uma boa aposta de que o
// texto está inteiro e bem digitalizado.
const fila = [...plano]
  .sort((a, b) => (b.emTrilha ?? 0) - (a.emTrilha ?? 0))
  .slice(0, quantos)

console.log(`esteira: ${fila.length} obras\n`)

const prazo = Date.now() + minutos * 60_000
const feitos = []
const falhas = []

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
  } else {
    const ultima = saida.trim().split('\n').at(-1) ?? 'sem mensagem'
    console.log(`   FALHOU (${min} min): ${ultima.slice(0, 140)}\n`)
    falhas.push({ obra: o.obra, titulo: o.titulo, fonte: o.fonte, erro: ultima.slice(0, 300) })
  }
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
