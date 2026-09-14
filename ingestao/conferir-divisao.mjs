// O divisor de capítulos, medido contra os livros do plano.
//
//   node ingestao/conferir-divisao.mjs [--quantos 12]
//
// Mexer no `MARCA` de `traduzir-obra.mjs` é mexer em todo livro que ainda vai
// entrar, e o estrago não aparece como erro: aparece como um capítulo de 182
// mil palavras, ou como noventa capítulos de três linhas. Nos dois casos o
// script diz "pronto" e segue.
//
// Este arquivo baixa as fontes de verdade, roda o divisor nelas e mostra o
// resultado em número. É rápido e não custa nada — as fontes são estáticas, e
// nenhuma tradução é pedida.
//
// O que se procura na saída:
//   1 capítulo num livro grande  → o divisor não achou as marcas
//   capítulo com > 40 mil palavras → achou algumas e perdeu outras
//   dezenas de capítulos minúsculos → achou marca onde não havia

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { soOLivro, emCapitulos } from './traduzir-obra.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const plano = JSON.parse(
  readFileSync(join(RAIZ, 'dados', 'traducoes', 'esteira.json'), 'utf8')).plano
const quantos = Number(arg('quantos', 12))

const conta = (s) => s.split(/\s+/).filter(Boolean).length

console.log(`${Math.min(quantos, plano.length)} obras\n`)
console.log('  obra  caps   palavras   maior cap  título')
console.log('  ' + '-'.repeat(64))

const suspeitos = []

for (const o of plano.slice(0, quantos)) {
  let texto
  try {
    const r = await fetch(o.fonte, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    texto = soOLivro(await r.text())
  } catch (e) {
    console.log(`  ${String(o.obra).padStart(5)}  -- ${e.message}`)
    continue
  }

  const caps = emCapitulos(texto)
  const tamanhos = caps.map((c) => conta(c.bruto))
  const total = tamanhos.reduce((a, b) => a + b, 0)
  const maior = Math.max(...tamanhos, 0)

  // Um capítulo que sozinho passa de 40 mil palavras é maior que muitos livros
  // inteiros. Ou o divisor perdeu as marcas, ou o livro não tem nenhuma — e nos
  // dois casos alguém precisa olhar antes de o leitor topar com a parede.
  const aviso = caps.length === 1 && total > 25_000 ? '  << um capitulo so'
    : maior > 40_000 ? '  << capitulo gigante'
      : caps.length > 4 && total / caps.length < 220 ? '  << picado demais'
        : ''
  if (aviso) suspeitos.push({ ...o, caps: caps.length, total, maior, aviso })

  console.log(`  ${String(o.obra).padStart(5)} ${String(caps.length).padStart(5)} ` +
    `${String(total).padStart(10)} ${String(maior).padStart(11)}  ${String(o.titulo).slice(0, 30)}${aviso}`)
}

console.log()
if (!suspeitos.length) {
  console.log('nenhum suspeito.')
} else {
  console.log(`${suspeitos.length} para olhar:`)
  for (const s of suspeitos) console.log(`  ${s.obra} ${s.titulo} — ${s.caps} caps, maior ${s.maior}${s.aviso}`)
}
