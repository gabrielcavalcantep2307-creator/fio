// Capítulo (ou livro inteiro) na forma errada, refeito pela FORMA do original (21/09/2026).
//
//   node ingestao/dividir-capitulos-html.mjs --banco /dados/catalogo.db            # só mostra
//   node ingestao/dividir-capitulos-html.mjs --banco /dados/catalogo.db --texto 5098
//   node ingestao/dividir-capitulos-html.mjs --banco /dados/catalogo.db --gravar
//
// ingestao/dividir-capitulos.mjs já resolve parte dos livros de um capítulo
// só ADIVINHANDO onde é título a partir da forma da linha no .txt — e recusa
// quando a forma não é clara (28 dos 38, na varredura de 20/09: Nietzsche
// numerado por aforismo, "capítulo 15" citado dentro da prosa, título sem
// número nenhum). Este arquivo ataca os livros de forma ruim (o raio-x —
// ingestao/raio-x-estrutura.mjs — chama de PAREDE um capítulo com mais de
// 15 mil palavras, e de INTEIRO o livro todo num capítulo só) sem adivinhar
// nada: baixa a edição em HTML do próprio Gutenberg
// (servidor/servicos/estrutura.mjs), lê os <h2>/<h3> que quem preparou a
// edição escreveu — a forma do livro original — e localiza essas âncoras no
// .txt que a esteira já traduziu. Só entra a ESTRUTURA; o texto continua
// sendo o que a esteira traduziu, e o livro é refeito inteiro (não só o
// capítulo-parede), porque só assim a numeração dos capítulos fica certa.
//
// Só livros com fonte no Gutenberg entram aqui (fonte_url carrega o número do
// livro). Wikisource, Archive e Planalto não têm HTML do Gutenberg para
// comparar — esses continuam só na guarda do dividir-capitulos.mjs.
//
// Rode ANTES do dividir-capitulos.mjs: usar a forma verdadeira do original é
// mais seguro que adivinhar, então quem tem HTML aqui nem devia cair na
// adivinhação do outro script.
//
// A ARMADILHA QUE A PRIMEIRA VERSÃO CAIU (21/09/2026)
//
// O `corpo` gravado é a TRADUÇÃO em português; o HTML do Gutenberg está no
// idioma do original (inglês, francês…). Comparar as âncoras do HTML direto
// contra os parágrafos traduzidos não bate nunca — são línguas diferentes.
//
// A correção: localizar os cortes no PRÓPRIO .txt original (mesma língua do
// HTML), e só então aplicar os mesmos ÍNDICES de parágrafo na tradução.
// Funciona porque `traduzirLivro` (servidor/servicos/traducao.mjs) monta o
// `corpo` com exatamente um `<p>` por parágrafo do original, capítulo por
// capítulo, na mesma ordem (`c.paras.map(p => '<p>'+p+'</p>')`) — refazer
// `emCapitulos` + a divisão em parágrafos sobre o MESMO .txt reproduz a
// mesma sequência de parágrafos que foi traduzida. Por segurança, só se
// confia no corte se a CONTAGEM total de parágrafos do original bater
// exatamente com a do corpo (somando todos os capítulos de hoje); se não
// bater (o texto mudou desde a tradução, ou `emCapitulos` mudou de versão),
// o livro fica como está.

import { DatabaseSync } from 'node:sqlite'
import { idDoGutenberg, textoDe, baixarHtml, esbocoDoHtml, localizar } from '../servidor/servicos/estrutura.mjs'
import { baixarFonte, soOLivro, emCapitulos } from '../servidor/servicos/traducao.mjs'

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
const tem = (n) => process.argv.includes(n)
const gravar = tem('--gravar')
const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: !gravar })
const soTexto = arg('--texto', null)

const PAREDE = 15000
const INTEIRO = 8000

const PARAGRAFO = /<p(?:[ ][^>]*)?>[\s\S]*?<\/p>|<h[1-6](?:[ ][^>]*)?>[\s\S]*?<\/h[1-6]>/g
// mesma divisão de servidor/servicos/traducao.mjs → emParagrafos (não exportada)
const emParagrafos = (bruto) => bruto.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

let sql = `SELECT t.id, t.obra_id, t.fonte_url, coalesce(o.titulo_pt, o.titulo) titulo, count(c.id) caps, sum(c.palavras) pal, max(c.palavras) maior
  FROM texto t JOIN capitulo c ON c.texto_id = t.id JOIN obra o ON o.id = t.obra_id
  WHERE t.dono_id IS NULL GROUP BY t.id HAVING maior > ${PAREDE} OR (caps = 1 AND pal > ${INTEIRO}) ORDER BY maior DESC`
if (soTexto) sql = sql.replace('WHERE t.dono_id IS NULL', 'WHERE t.id = ' + Number(soTexto))
const candidatos = banco.prepare(sql).all()

const pegarCaps = banco.prepare('SELECT id, ordem, titulo, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem')

let feitos = 0, semGutenberg = 0, semHtml = 0, semCorte = 0

const linha = (id, titulo, resto) => console.log('  ' + resto.slice(0, 4).padEnd(4) + '  ' + String(id).padStart(5) + '  ' + (titulo || '').slice(0, 46).padEnd(48) + resto.slice(4))

for (const t of candidatos) {
  const idGb = idDoGutenberg(t.fonte_url)
  if (!idGb) { semGutenberg++; continue }

  const capsAtuais = pegarCaps.all(t.id)
  const ps = capsAtuais.flatMap((c) => (c.corpo ?? '').match(PARAGRAFO) ?? [])
  if (ps.length < 5) { linha(t.id, t.titulo, '--  corpo vazio demais'); continue }

  let original
  try { original = await baixarFonte(t.fonte_url) } catch (e) { linha(t.id, t.titulo, '--  .txt: ' + e.message); continue }
  // livro que HOJE é um capítulo só foi traduzido como um bloco único, sem
  // passar por emCapitulos (marcas.length<2 na hora) — reproduzir com
  // emParagrafos direto. Livro com vários capítulos passou por emCapitulos
  // de verdade, então refazer o mesmo caminho é o que reproduz a mesma
  // sequência. emCapitulos pode ter ganhado trava nova desde a tradução
  // (ex.: 21/09, a do cabeçalho corrido) — usar a versão errada aqui é
  // exatamente a armadilha que a checagem de contagem abaixo existe para
  // pegar.
  const paragrafosOriginais = capsAtuais.length === 1
    ? emParagrafos(soOLivro(original))
    : emCapitulos(soOLivro(original)).flatMap((c) => emParagrafos(c.bruto))
  if (paragrafosOriginais.length !== ps.length) {
    semCorte++
    linha(t.id, t.titulo, '--  parágrafos não batem: original ' + paragrafosOriginais.length + ' x traduzido ' + ps.length)
    continue
  }

  let html
  try { html = await baixarHtml(idGb) } catch (e) { linha(t.id, t.titulo, '--  html: ' + e.message); continue }
  if (!html) { semHtml++; linha(t.id, t.titulo, '--  sem html no Gutenberg (404)'); continue }

  const esboco = esbocoDoHtml(html)
  const { cortes, perdidos } = localizar(esboco, paragrafosOriginais)

  // travas: precisa de pelo menos 3 cortes reais, e não pode ter perdido mais
  // título do que achou (esboço bagunçado é pior que não ter esboço nenhum)
  if (cortes.length < 3 || perdidos > cortes.length) {
    semCorte++
    linha(t.id, t.titulo, '--  ' + cortes.length + ' cortes, ' + perdidos + ' perdidos')
    continue
  }

  // o título do HTML está na língua do original ("Chapter IV", "Kapitel 4"),
  // não em português — não dá pra mostrar isso ao leitor. Fica só "Capítulo N",
  // que é honesto e igual ao que o resto do acervo mostra.
  const limites = [0, ...cortes.map((c) => c.indice), ps.length]
  const titulosPorLimite = [null, ...cortes.map((_, k) => 'Capítulo ' + (k + 1))]
  const pedacos = []
  for (let k = 0; k < limites.length - 1; k++) {
    const de = limites[k]
    const ate = limites[k + 1]
    if (ate <= de) continue
    const blocos = ps.slice(de, ate)
    const palavras = blocos.reduce((s, p) => s + (textoDe(p).match(/[^ ]+/g)?.length ?? 0), 0)
    pedacos.push({ titulo: titulosPorLimite[k], corpo: blocos.join(''), palavras })
  }

  // as mesmas travas de bom senso do dividir-capitulos.mjs: nenhum pedaço
  // pode engolir mais da metade do livro, a capa não pode ficar com tudo, e a
  // MEDIANA não pode ser migalha — é o que pega peça de teatro (Hamlet: o
  // Gutenberg marca cada FALA como cabeçalho, e sem essa trava viravam 775
  // "capítulos" de uma linha)
  const corpoTodo = pedacos.reduce((s, p) => s + p.palavras, 0)
  const miolo = pedacos.slice(1)
  const maior = miolo.length ? Math.max(...miolo.map((p) => p.palavras)) : 0
  const ordenados = miolo.map((p) => p.palavras).sort((a, b) => a - b)
  const mediana = ordenados.length ? ordenados[ordenados.length >> 1] : 0
  if (miolo.length < 3 || maior > corpoTodo * 0.6 || pedacos[0].palavras > corpoTodo * 0.25 || mediana < 300) {
    semCorte++
    linha(t.id, t.titulo, '--  corte achado mas desequilibrado demais (mediana ' + mediana + ' palavras)')
    continue
  }

  // sem ganho de verdade: o novo maior capítulo continua uma parede, ou o
  // número de pedaços não mudou nada — não vale trocar por trocar
  if (maior > PAREDE && pedacos.length <= capsAtuais.length) {
    semCorte++
    linha(t.id, t.titulo, '--  corte achado mas não melhora o que já está (ainda ' + maior + ' palavras no maior)')
    continue
  }

  feitos++
  linha(t.id, t.titulo, 'ok  ' + capsAtuais.length + ' → ' + pedacos.length + ' partes  (' + perdidos + ' perdidos)  ' +
    pedacos.slice(1, 4).map((p) => (p.titulo || '').slice(0, 20)).join(' | '))

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
console.log(candidatos.length + ' livros de forma ruim (parede ou um capítulo só); ' + feitos + ' tinham HTML do Gutenberg com corte seguro, ' +
  semGutenberg + ' não vieram do Gutenberg, ' + semHtml + ' o Gutenberg não tem HTML, ' + semCorte + ' sem corte seguro.')
if (!gravar) console.log('(nada foi gravado — rode com --gravar)')
else console.log('GRAVADO. Rode servidor/reindexar.mjs e ingestao/publicar.mjs depois.')
