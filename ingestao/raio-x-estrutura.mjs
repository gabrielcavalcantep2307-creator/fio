// O raio-x da ESTRUTURA do acervo inteiro (21/09/2026).
//
//   node ingestao/raio-x-estrutura.mjs --banco /dados/catalogo.db
//   node ingestao/raio-x-estrutura.mjs --banco /dados/catalogo.db --fonte gutenberg --lista
//
// O dono abriu vários livros — inclusive livros que NÃO fomos nós que
// traduzimos — e achou um capítulo só. A pergunta deste arquivo é se isso é
// defeito da tradução ou de como os livros foram PUXADOS, e a resposta tem que
// vir por fonte, porque cada fonte entrou por um caminho diferente:
//
//   gutenberg      HTML do Project Gutenberg, cortado pelos <h2>
//   wikisource     páginas e subpáginas do Wikisource
//   archive        OCR de livro escaneado (archive.org)
//   planalto       leis, cortadas por artigo
//   fio_traducao   o que a esteira traduziu, a partir do .txt do Gutenberg
//
// Só entra texto que se LÊ aqui (publicado, com direito livre), porque é esse
// que a pessoa abre.

import { DatabaseSync } from 'node:sqlite'

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
const tem = (n) => process.argv.includes(n)
const b = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: true })
const soFonte = arg('--fonte', null)

// ── o que conta como "sem forma de livro" ──
//
// Um capítulo de livro impresso tem de 2 a 8 mil palavras; conto, menos; um
// ensaio, às vezes 15 mil. Acima de 15 mil palavras numa página só, ninguém
// lê como livro — e é o que o dono viu. Dois sinais:
//
//   PAREDE   algum capítulo com mais de 15 mil palavras
//   INTEIRO  o livro todo num capítulo só, com mais de 8 mil palavras
//
// Poesia e lei ficam de fora do segundo: um livro de poemas curto pode ser
// uma página só sem estar errado, e a lei é cortada por artigo, não capítulo.
const PAREDE = 15000
const INTEIRO = 8000

const textos = b.prepare(`
  SELECT t.id, t.obra_id, t.fonte, t.fonte_url, coalesce(o.titulo_pt, o.titulo) titulo,
         (SELECT count(*) FROM capitulo c WHERE c.texto_id = t.id) caps,
         (SELECT coalesce(sum(palavras),0) FROM capitulo c WHERE c.texto_id = t.id) pal,
         (SELECT coalesce(max(palavras),0) FROM capitulo c WHERE c.texto_id = t.id) maior,
         (SELECT count(*) FROM capitulo c WHERE c.texto_id = t.id AND (c.titulo IS NULL OR c.titulo = '')) sem_titulo
    FROM texto t JOIN obra o ON o.id = t.obra_id
    JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = 'BR' AND d.estado IN ('dominio_publico','licenca_livre')
   WHERE o.publicada = 1 AND t.dono_id IS NULL AND t.normalizado = 1
     AND o.id NOT IN (SELECT obra_id FROM curadoria_obra WHERE oculta = 1)`).all()

const porFonte = new Map()
const ruins = []
for (const t of textos) {
  if (soFonte && t.fonte !== soFonte) continue
  const f = porFonte.get(t.fonte) ?? { livros: 0, parede: 0, inteiro: 0, semTituloCaps: 0, caps: 0, pal: 0 }
  f.livros++; f.caps += t.caps; f.pal += t.pal; f.semTituloCaps += t.sem_titulo
  const parede = t.maior > PAREDE
  const inteiro = t.caps === 1 && t.pal > INTEIRO
  if (parede) f.parede++
  if (inteiro) f.inteiro++
  porFonte.set(t.fonte, f)
  if (parede || inteiro) ruins.push({ ...t, parede, inteiro })
}

console.log('=== ' + textos.length + ' textos que se leem aqui ===\n')
console.log('fonte'.padEnd(14) + 'livros'.padStart(7) + 'parede'.padStart(8) + 'inteiro'.padStart(9) + '  % ruim' + '   caps sem titulo')
for (const [fonte, f] of [...porFonte].sort((a, b) => b[1].livros - a[1].livros)) {
  const ruim = ruins.filter((r) => r.fonte === fonte).length
  console.log(fonte.padEnd(14) + String(f.livros).padStart(7) + String(f.parede).padStart(8) + String(f.inteiro).padStart(9) +
    (Math.round(ruim / f.livros * 100) + '%').padStart(8) + String(f.semTituloCaps).padStart(10) + ' de ' + f.caps)
}
console.log('\ntotal com forma ruim: ' + ruins.length + ' de ' + textos.length + ' (' + Math.round(ruins.length / textos.length * 100) + '%)')

// De onde vieram os ruins do Gutenberg: HTML ou .txt? É a pergunta do dono —
// "será que puxamos errado?" — e a URL responde.
const gut = ruins.filter((r) => r.fonte === 'gutenberg' || r.fonte === 'fio_traducao')
const porFormato = {}
for (const r of gut) {
  const k = r.fonte + ' / ' + (/\.txt/.test(r.fonte_url ?? '') ? '.txt' : /\.html?|-images/.test(r.fonte_url ?? '') ? 'html' : (r.fonte_url ? 'outro' : 'sem url'))
  porFormato[k] = (porFormato[k] ?? 0) + 1
}
console.log('\nruins do Gutenberg, pelo formato de onde vieram: ' + JSON.stringify(porFormato))

if (tem('--lista')) {
  console.log('\n--- os maiores ---')
  for (const r of ruins.sort((a, b) => b.pal - a.pal).slice(0, Number(arg('--quantos', 40)))) {
    console.log('  ' + String(r.id).padEnd(6) + r.fonte.padEnd(13) + String(r.caps).padStart(4) + ' caps ' +
      String(r.pal).padStart(7) + ' pal  maior ' + String(r.maior).padStart(6) + '  ' + (r.titulo || '').slice(0, 42) + '  ' + (r.fonte_url ?? '').slice(-40))
  }
}
