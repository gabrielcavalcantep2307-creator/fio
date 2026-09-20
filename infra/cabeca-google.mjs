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

// O código que o Search Console deu ao dono (20/09/2026). Ele prova que a
// página inicial é dele — é o que destrava o sitemap e a verificação da marca
// no Google Cloud. Não é segredo: fica no HTML de qualquer jeito.
const VERIFICACAO = 'KUMLG5_GOtXU4KIcg14urGqYyolc4syP715xJdYl_XA'

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
    <meta name="google-site-verification" content="${VERIFICACAO}" />
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
  // A apresentação DENTRO de #raiz: é o que o robô (e a verificação da marca
  // no Google Cloud, que exige "a página inicial explica a finalidade do app"
  // e o link da privacidade) lê sem rodar JavaScript. Quando o app monta, o
  // React troca o conteúdo de #raiz pelo site — a pessoa quase não vê isto.
  if (!s.includes('class="fio-apresenta"')) {
    s = s.replace('<div id="raiz"></div>', `<div id="raiz"><section class="fio-apresenta" style="max-width:720px;margin:14vh auto 0;padding:0 20px;font:17px/1.7 Georgia,serif">
      <h1 style="font-weight:500;font-size:2.2rem;margin:0 0 12px">Fiolib</h1>
      <p>A Fiolib é uma biblioteca online e gratuita de livros em português: clássicos em domínio público, leis brasileiras, quadrinhos livres e obras publicadas pelos próprios leitores. Você lê no navegador, no celular ou no computador, e continua de onde parou.</p>
      <p>Criar uma conta é opcional e gratuito. Dá para entrar com nome de usuário e senha ou com a sua conta Google: do Google recebemos só o nome, o e-mail e a foto, usados apenas para identificar você na Fiolib. Não publicamos nada em seu nome e não acessamos nenhum outro dado.</p>
      <p><a href="/livros">Ver os livros</a> · <a href="/privacidade.html">Política de privacidade</a> · <a href="/termos.html">Termos de uso</a> · <a href="/direitos.html">Direitos autorais</a></p>
    </section></div>`)
  }
  // o cabeçalho, o sino e o rodapé do site inteiro (19/09/2026)
  if (!s.includes('/fio-cabecalho.css')) s = s.replace('</head>', '    <link rel="stylesheet" href="/fio-cabecalho.css">\n  </head>')
  if (!s.includes('/fio-cabecalho.js')) s = s.replace('</head>', '    <script defer src="/fio-cabecalho.js"></script>\n  </head>')
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
