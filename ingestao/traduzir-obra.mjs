// Traduzir um livro pela linha de comando — atalho para servidor/servicos/traducao.mjs.
//
//   node ingestao/traduzir-obra.mjs --fonte https://www.gutenberg.org/ebooks/1952.txt.utf-8 \
//     --de en --titulo "O Papel de Parede Amarelo" --saida obra123 [--pasta dados/traducoes]
//
// A esteira não passa por aqui: ela chama o serviço direto. Isto é para
// traduzir um livro avulso, à mão. O porquê jurídico (Lei 9.610/98, arts. 14 e
// 41) e o funcionamento do caderno e do freio estão no serviço.

import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { traduzirLivro } from '../servidor/servicos/traducao.mjs'

// o divisor de capítulos continua importável daqui (conferir-divisao.mjs)
export { soOLivro, emCapitulos } from '../servidor/servicos/traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

async function principal() {
  const fonte = arg('fonte')
  const nome = arg('saida')
  if (!fonte || !nome) {
    console.error('uso: --fonte <url> --saida <nome> [--de en] [--titulo "..."] [--pasta dados/traducoes]')
    process.exit(1)
  }
  const pasta = arg('pasta', process.env.FIO_TRADUCOES || join(RAIZ, 'dados', 'traducoes'))
  const r = await traduzirLivro({
    fonte, nome, pasta, de: arg('de', 'en'), titulo: arg('titulo'),
    aoDizer: (l) => console.log(l),
    aoAndar: (feitas, total, min) => process.stdout.write(`\r  ${feitas}/${total}  ~${min} min restantes   `),
  })
  const palavras = r.livro.capitulos.reduce((a, c) => a + c.palavras, 0)
  console.log(`\npronto: ${r.arquivo}\n${r.livro.capitulos.length} capítulos, ${palavras} palavras em português`)
  console.log(`\ninstalar no catálogo:\n  node ingestao/instalar-traducao.mjs --arquivo ${nome} --obra <id>`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  principal().catch((e) => { console.error('\n' + e.message); process.exit(1) })
}
