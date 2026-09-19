// A cabeça do index.html do app para o Google (19/09/2026).
//
// O título era "Fio — biblioteca": "fio" é também o nome de uma ferramenta
// famosa de Linux, e é ela que aparece quando se procura "fio lib". O nome que
// se procura é FIOLIB, junto de "livros grátis em português".
//
// Usado por infra/remendar-bundle.mjs (todo bundle novo sai com esta cabeça)
// e sozinho, para trocar só a cabeça do index que está no ar:
//
//   node infra/cabeca-google.mjs site-no-ar/index.html
//
// Idempotente: rodar duas vezes dá o mesmo arquivo.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SITE = 'https://fiolib.com.br'
const TITULO = 'Fiolib — biblioteca online grátis de livros em português'
const DESCRICAO = 'Leia de graça milhares de livros em português: clássicos brasileiros e portugueses, poesia, contos, leis e traduções. No celular ou no computador, sem anúncio.'

const LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE}/#site`, name: 'Fiolib', alternateName: ['Fio', 'Fio Lib'], url: `${SITE}/`, inLanguage: 'pt-BR', description: DESCRICAO },
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Fiolib', url: `${SITE}/`, logo: `${SITE}/fio.svg` },
  ],
}

const MARCA = '<!-- cabeça para o Google (infra/cabeca-google.mjs) -->'

export function cabecaParaOGoogle(index) {
  let s = index.replace(/<title>[^<]*<\/title>/, `<title>${TITULO}</title>`)
  s = s.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${DESCRICAO}" />`)
  // o bloco inteiro some e volta, para rodar duas vezes sem duplicar
  const FIM = MARCA.replace('cabeça', 'fim da cabeça')
  const a = s.indexOf(MARCA), b = s.indexOf(FIM)
  if (a >= 0 && b > a) s = s.slice(0, a).trimEnd() + s.slice(b + FIM.length)
  const bloco = `
    ${MARCA}
    <link rel="canonical" href="${SITE}/" />
    <meta property="og:site_name" content="Fiolib" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE}/" />
    <meta property="og:title" content="${TITULO}" />
    <meta property="og:description" content="${DESCRICAO}" />
    <script type="application/ld+json">${JSON.stringify(LD).replace(/</g, '')}</script>
    ${FIM}`
  s = s.replace(/(<meta name="description"[^>]*>)/, `$1${bloco}`)
  // Para quem chega sem JavaScript (e para o robô, antes de rodar o app): as
  // listas de livros e autores, que são páginas de verdade.
  if (!s.includes('id="sem-js"')) {
    s = s.replace('<div id="raiz"></div>', `<div id="raiz"></div>
    <noscript id="sem-js"><p>A Fiolib é uma biblioteca online grátis de livros em português. <a href="/livros">Veja todos os livros</a> ou <a href="/autores">os autores</a>.</p></noscript>`)
  }
  return s
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arq = process.argv[2]
  if (!arq) { console.error('uso: node infra/cabeca-google.mjs caminho/index.html'); process.exit(1) }
  writeFileSync(arq, cabecaParaOGoogle(readFileSync(arq, 'utf8')))
  console.log(`cabeça trocada em ${arq}`)
}
