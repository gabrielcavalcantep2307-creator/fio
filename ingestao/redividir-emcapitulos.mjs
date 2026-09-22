// Livro num capítulo só, redividido com o divisor de HOJE (22/09/2026).
//
//   node ingestao/redividir-emcapitulos.mjs --banco /dados/catalogo.db            # só mostra
//   node ingestao/redividir-emcapitulos.mjs --banco /dados/catalogo.db --texto 5009
//   node ingestao/redividir-emcapitulos.mjs --banco /dados/catalogo.db --gravar
//
// `dividir-capitulos-html.mjs` conserta pela FORMA do HTML do Gutenberg — e
// para isso precisa que o HTML marque capítulo com <h2>/<h3>. Quatro livros
// não têm essa marcação (o Gutenberg usa <p> comum, ou o HTML nem existe), e
// por isso ficaram de fora: Além do Bem e do Mal, Da Democracia na América,
// Um dos Seiscentos, A Jovem Philippa, O Espírito das Leis.
//
// Mas o `emCapitulos()` de `servicos/traducao.mjs` — o mesmo que traduz livro
// novo — RECONHECE a forma deles no próprio .txt: "Erstes Hauptstück:",
// "CHAPITRE I.", "CHAPTER I." são exatamente os casos que motivaram os
// comentários daquele arquivo. Só não foram aplicados a estes livros porque a
// tradução deles é de ANTES do divisor aprender essas formas — o resultado
// ficou congelado num capítulo só (ou num corte grosso demais).
//
// Aqui não se traduz nada de novo: os PARÁGRAFOS já traduzidos continuam os
// mesmos, na mesma ordem; só a FRONTEIRA de capítulo muda.
//
// ── A LINHA DO TÍTULO, CONTADA DE VOLTA (achado medindo Além do Bem e do Mal) ──
//
// `emCapitulos()` tira a linha do título de dentro do corpo — ela vira
// `titulo`, separada de `bruto`. Mas a tradução ANTIGA, de antes do livro
// ganhar capítulo nenhum, tratou essa mesma linha como um parágrafo comum:
// ela está lá, traduzida, junto com o resto. Comparar direto — soma dos
// parágrafos de `bruto` contra os <p> já guardados — dá sempre uma diferença
// do tamanho do número de capítulos, e pareceria "não bate" num livro que na
// verdade bate perfeitamente. A prova: para Além do Bem e do Mal, TODO
// parágrafo do texto corrido aparece ou no novo corpo ou como um dos títulos
// extraídos — zero perdido, zero sobrando.
//
// A conta certa soma de volta uma linha por capítulo COM título. E o título
// mostrado nunca é o texto do original ("Erstes Hauptstück:" não pode
// aparecer para quem lê em português) — é a PRÓPRIA linha, já traduzida, que
// a conta identificou.

import { DatabaseSync } from 'node:sqlite'
import { baixarFonte, soOLivro, emCapitulos } from '../servidor/servicos/traducao.mjs'

const PARAGRAFO = /<p(?:[ ][^>]*)?>[\s\S]*?<\/p>/g
const textoDe = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim()
/** emParagrafos (não exportada de traducao.mjs) — a mesma quebra que traduzirLivro usou */
const emParagrafos = (bruto) => bruto.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

/**
 * Reparte os `<p>` já traduzidos (`ps`, em ordem) segundo os capítulos que
 * `emCapitulos()` acha HOJE no original (`novosCapitulos`).
 *
 * @param {string[]} ps os `<p>...</p>` já traduzidos, em ordem, de TODOS os
 *   capítulos guardados hoje
 * @param {Array<{titulo:string|null, bruto:string}>} novosCapitulos o que
 *   `emCapitulos(soOLivro(original))` devolve
 * @returns {{erro:string}|{pedacos:Array<{titulo:string|null,corpo:string,palavras:number}>}}
 */
export function redividir(ps, novosCapitulos) {
  if (novosCapitulos.length < 3) return { erro: 'divisor de hoje também não achou capítulo (' + novosCapitulos.length + ')' }

  const contagemPorCapitulo = novosCapitulos.map((c) => emParagrafos(c.bruto).length)
  const totalNovo = contagemPorCapitulo.reduce((a, b) => a + b, 0)
  const titulosComTexto = novosCapitulos.filter((c) => c.titulo).length
  const esperado = totalNovo + titulosComTexto

  // A FOLHA DE ROSTO CURTA DEMAIS (achado medindo "Um dos Seiscentos" e "A
  // Jovem Philippa"): quando o que vem antes do primeiro capítulo tem 60
  // palavras ou menos, `emCapitulos()` DESCARTA o bloco inteiro — ele nem
  // vira um capítulo `{titulo: null, ...}` na frente. O primeiro pedaço
  // devolvido já nasce COM título. Na tradução ANTIGA (de antes do livro
  // ganhar capítulo algum), essa mesma folha de rosto — "Produced by Al
  // Haines.", título, autor, editora, ano — foi traduzida como parágrafos
  // comuns, e continua no começo dos <p> de hoje.
  //
  // Não precisa comparar conteúdo (traduzido x original, línguas
  // diferentes) para saber QUANTOS parágrafos são: a tradução preserva a
  // ordem 1 a 1, então a posição de cada parágrafo é a mesma nos dois
  // lados. A diferença aqui SÓ pode ser essa folha de rosto — e só quando o
  // primeiro capítulo novo já nasce com título (sinal de que não sobrou
  // nada antes dele) e a diferença é do tamanho de uma folha de rosto, não
  // de um capítulo perdido.
  let descartarDoInicio = 0
  if (ps.length !== esperado) {
    const diferenca = ps.length - esperado
    if (diferenca > 0 && diferenca <= 20 && novosCapitulos[0].titulo) descartarDoInicio = diferenca
    else return { erro: 'parágrafos não batem: divisor de hoje ' + esperado + ' (com títulos) x traduzido ' + ps.length }
  }
  ps = ps.slice(descartarDoInicio)

  const pedacos = []
  let cursor = 0
  for (let k = 0; k < novosCapitulos.length; k++) {
    let tituloTraduzido = null
    if (novosCapitulos[k].titulo) { tituloTraduzido = textoDe(ps[cursor]); cursor += 1 }
    const n = contagemPorCapitulo[k]
    const blocos = ps.slice(cursor, cursor + n)
    cursor += n
    const palavras = blocos.reduce((s, p) => s + (textoDe(p).match(/[^ ]+/g)?.length ?? 0), 0)
    pedacos.push({ titulo: tituloTraduzido, corpo: blocos.join(''), palavras })
  }

  // as mesmas travas de bom senso das outras ferramentas de divisão: nenhum
  // pedaço pode engolir mais da metade do livro, e a mediana não pode ser migalha
  const corpoTodo = pedacos.reduce((s, p) => s + p.palavras, 0)
  const semCapa = pedacos[0].titulo == null ? pedacos.slice(1) : pedacos
  const maiorNovo = semCapa.length ? Math.max(...semCapa.map((p) => p.palavras)) : 0
  const ordenados = semCapa.map((p) => p.palavras).sort((a, b) => a - b)
  const mediana = ordenados.length ? ordenados[ordenados.length >> 1] : 0
  if (semCapa.length < 3 || maiorNovo > corpoTodo * 0.6 || mediana < 200) {
    return { erro: 'desequilibrado (mediana ' + mediana + ' palavras)' }
  }
  return { pedacos, maior: maiorNovo, descartarDoInicio }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('redividir-emcapitulos.mjs')) {
  const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
  const tem = (n) => process.argv.includes(n)
  const gravar = tem('--gravar')
  const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: !gravar })
  const soTexto = arg('--texto', null)

  const PAREDE = 15000
  const INTEIRO = 8000
  const pegarCaps = banco.prepare('SELECT id, ordem, titulo, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem')

  let sql = `SELECT t.id, t.obra_id, t.fonte_url, coalesce(o.titulo_pt, o.titulo) titulo, count(c.id) caps, sum(c.palavras) pal, max(c.palavras) maior
    FROM texto t JOIN capitulo c ON c.texto_id = t.id JOIN obra o ON o.id = t.obra_id
    WHERE t.dono_id IS NULL AND t.fonte = 'fio_traducao' GROUP BY t.id HAVING maior > ${PAREDE} OR (caps = 1 AND pal > ${INTEIRO}) ORDER BY maior DESC`
  if (soTexto) sql = sql.replace("WHERE t.dono_id IS NULL AND t.fonte = 'fio_traducao'", 'WHERE t.id = ' + Number(soTexto))
  const candidatos = banco.prepare(sql).all()

  const linha = (id, titulo, resto) => console.log('  ' + resto.slice(0, 4).padEnd(4) + '  ' + String(id).padStart(5) + '  ' + (titulo || '').slice(0, 46).padEnd(48) + resto.slice(4))

  let feitos = 0, semCorte = 0

  for (const t of candidatos) {
    const capsAtuais = pegarCaps.all(t.id)
    const ps = capsAtuais.flatMap((c) => (c.corpo ?? '').match(PARAGRAFO) ?? [])
    if (ps.length < 5) { linha(t.id, t.titulo, '--  corpo vazio demais'); continue }

    let original
    try { original = await baixarFonte(t.fonte_url) } catch (e) { linha(t.id, t.titulo, '--  .txt: ' + e.message); continue }

    const novosCapitulos = emCapitulos(soOLivro(original))
    const resultado = redividir(ps, novosCapitulos)
    if (resultado.erro) { semCorte++; linha(t.id, t.titulo, '--  ' + resultado.erro); continue }
    const { pedacos, maior, descartarDoInicio } = resultado
    if (descartarDoInicio) console.log('      (folha de rosto curta demais: ' + descartarDoInicio + ' parágrafo(s) descartado(s))')

    if (maior > PAREDE && pedacos.length <= capsAtuais.length) {
      semCorte++
      linha(t.id, t.titulo, '--  corte achado mas não melhora o que já está (ainda ' + maior + ' palavras no maior)')
      continue
    }

    feitos++
    linha(t.id, t.titulo, 'ok  ' + capsAtuais.length + ' → ' + pedacos.length + ' partes  (' +
      pedacos.slice(0, 4).map((p) => (p.titulo || '(sem título)').slice(0, 20)).join(' | ') + ')')

    if (!gravar) continue
    banco.exec('BEGIN')
    try {
      banco.prepare('DELETE FROM capitulo WHERE texto_id = ?').run(t.id)
      const por = banco.prepare('INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?, ?, ?, ?, ?)')
      let ordem = 0
      for (const p of pedacos) { if (p.palavras) por.run(t.id, ordem++, p.titulo, p.corpo, p.palavras) }
      banco.exec('COMMIT')
    } catch (e) {
      banco.exec('ROLLBACK')
      linha(t.id, t.titulo, '!!  ' + e.message)
    }
  }

  console.log(`\n${candidatos.length} candidatos; ${feitos} tinham corte seguro com o divisor de hoje, ${semCorte} não.`)
  if (gravar) console.log('GRAVADO. Rode servidor/reindexar.mjs depois.')
  else console.log('(nada foi gravado — rode com --gravar)')
}
