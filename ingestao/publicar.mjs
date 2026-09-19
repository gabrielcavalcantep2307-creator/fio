// Refazer o catálogo estático do site — atalho para servidor/servicos/catalogo.mjs.
//
//   node ingestao/publicar.mjs [--saida web/public/dados] [--obra 123]
//
// Sem --obra refaz tudo (catalogo.json e fichas/, troca atômica, com a trava
// do catálogo encolhido). Com --obra, só a linha e a ficha daquela obra.
// Na VPS a esteira faz isso sozinha; isto é para rodar à mão.

import { join } from 'node:path'
import { abrir, fechar, RAIZ } from '../servidor/banco/base.mjs'
import { publicarCatalogo, publicarObra } from '../servidor/servicos/catalogo.mjs'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const saida = arg('saida', join(RAIZ, 'web', 'public', 'dados'))
const jurisdicao = process.env.FIO_JURISDICAO || 'BR'
const banco = abrir()

if (arg('obra')) {
  console.log(publicarObra(banco, saida, Number(arg('obra')), { jurisdicao }))
} else {
  const n = publicarCatalogo(banco, saida, { jurisdicao })
  if (!n.trocou) console.log(`NÃO TROQUEI: o catálogo novo tem ${n.obras} obras e o que está lá tem ${n.noAr}`)
  console.log(`catálogo ...... ${n.obras} obras em português`)
  console.log(`para ler ...... ${n.legiveis}  (${(n.palavras / 1e6).toFixed(1)} milhões de palavras, no banco)`)
  console.log(`só ficha ...... ${n.obras - n.legiveis}`)
  console.log(`com capa ...... ${n.comCapa}`)
  console.log(`com chamada ... ${n.comChamada}`)
  console.log(`prateleiras ... ${n.prateleiras}`)
  console.log(`coleções ...... ${n.colecoes}`)
  console.log(`autores ....... ${n.autores}`)
}
fechar()
