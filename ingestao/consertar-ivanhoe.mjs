// Ivanhoé abria com o índice de notas de rodapé, e o primeiro capítulo tinha
// o MESMO título do último ("Capítulo XLIV.").
//
// A varredura do acervo inteiro (22/09/2026) achou este padrão de índice de
// notas em um livro só — não é uma regra de site inteiro, é o conserto de um
// livro específico. A função que tira o índice de notas (`semIndiceDeNotas`
// em `servidor/indice-fantasma.mjs`) já está ligada na instalação, para
// livro novo com o mesmo defeito nascer limpo.
//
//   node ingestao/consertar-ivanhoe.mjs             # simulação
//   node ingestao/consertar-ivanhoe.mjs --aplicar

import { DatabaseSync } from 'node:sqlite'
import { semIndiceDeNotas } from '../servidor/indice-fantasma.mjs'

const BANCO = process.env.FIO_BANCO || 'dados/catalogo.db'
const aplicar = process.argv.includes('--aplicar')

const banco = new DatabaseSync(BANCO)
const t = banco.prepare("SELECT id FROM texto WHERE obra_id = 5027 AND dono_id IS NULL").get()
if (!t) { console.log('Ivanhoé não está instalado; nada a fazer.'); process.exit(0) }

const primeiro = banco.prepare('SELECT id, titulo, corpo FROM capitulo WHERE texto_id = ? AND ordem = 1').get(t.id)
if (!primeiro) { console.log('capítulo 1 não existe; nada a fazer.'); process.exit(0) }

const corpoLimpo = semIndiceDeNotas(primeiro.corpo)
const mudouCorpo = corpoLimpo !== primeiro.corpo
// "Capítulo XLIV." é o título do ÚLTIMO capítulo (o de verdade); este aqui é
// a epístola + introdução de Walter Scott, sem número de capítulo nenhum.
const mudouTitulo = primeiro.titulo === 'Capítulo XLIV.'

console.log('corpo:', mudouCorpo ? `tira o índice de notas (${primeiro.corpo.length} → ${corpoLimpo.length} chars)` : 'sem mudança')
console.log('título:', mudouTitulo ? `"${primeiro.titulo}" → null (front matter, não é capítulo)` : 'sem mudança')

if (aplicar && (mudouCorpo || mudouTitulo)) {
  banco.prepare('UPDATE capitulo SET corpo = ?, titulo = ? WHERE id = ?')
    .run(corpoLimpo, mudouTitulo ? null : primeiro.titulo, primeiro.id)
  console.log('\nAPLICADO.')
} else if (!aplicar) {
  console.log('\n(simulação — rode com --aplicar para valer)')
}
