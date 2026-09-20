// Que personagens o tradutor comeu? (20/09/2026)
//
//   node ingestao/conferir-nomes.mjs --banco /dados/catalogo.db --texto 4949
//   node ingestao/conferir-nomes.mjs --banco /dados/catalogo.db --todos
//   node ingestao/conferir-nomes.mjs --banco /dados/catalogo.db --todos --gravar
//
// Compara os nomes próprios da NOSSA tradução com os do texto original, que é
// baixado de `texto.fonte_url` e guardado em /dados/revisora/originais. A
// explicação do método está em servidor/nomes-do-livro.mjs — em uma linha:
// nome que sumiu de um lado e nome que apareceu do outro, com a mesma
// contagem, são a mesma pessoa.
//
// `--gravar` põe o resultado em /dados/revisora/nomes-<texto>.json, que é o
// que a revisora lê para devolver cada nome ao lugar.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { nomesDe, casarPorFrequencia, baixarOriginal, frequentes } from '../servidor/nomes-do-livro.mjs'

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p }
const tem = (n) => process.argv.includes(n)

const banco = new DatabaseSync(arg('--banco', 'dados/catalogo.db'), { readOnly: true })
const PASTA = arg('--pasta', '/dados/revisora')
const ORIGINAIS = join(PASTA, 'originais')

let sql = `SELECT t.id, t.obra_id, t.fonte_url, coalesce(o.titulo_pt, o.titulo) titulo, o.idioma_original
  FROM texto t JOIN obra o ON o.id = t.obra_id
  WHERE t.revisao = 'automatica' AND t.fonte_url IS NOT NULL ORDER BY t.id`
const soTexto = arg('--texto', null)
if (soTexto) sql = sql.replace("WHERE t.revisao", 'WHERE t.id = ' + Number(soTexto) + " AND t.revisao")
const textos = banco.prepare(sql).all()
const capsDe = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem')

if (tem('--gravar')) mkdirSync(PASTA, { recursive: true })

for (const t of textos) {
  let original
  try {
    original = await baixarOriginal(t.fonte_url, ORIGINAIS)
  } catch (e) {
    console.log('  --  ' + t.id + '  ' + (t.titulo || '').slice(0, 40) + '  original não veio: ' + e.message)
    continue
  }
  if (!original || original.length < 5000) { console.log('  --  ' + t.id + '  original curto demais'); continue }

  const nossa = nomesDe(capsDe.all(t.id).map((c) => c.corpo).join(' '))
  const deles = nomesDe(original)
  const r = casarPorFrequencia(nossa, deles)

  console.log('')
  console.log('=== ' + t.id + '  ' + (t.titulo || '') + '  (' + t.idioma_original + ')')
  console.log('    nomes frequentes: ' + frequentes(nossa).size + ' na nossa, ' + frequentes(deles).size + ' no original')
  // A informação que presta vem primeiro: quem está no original e sumiu.
  const sumiram = r.sumiram.slice(0, 14)
  if (sumiram.length) {
    console.log('    NOMES DO ORIGINAL QUE NÃO APARECEM NA NOSSA TRADUÇÃO:')
    console.log('      ' + sumiram.map((s) => s.nome + ' (' + s.vezes + 'x)').join(', '))
  } else {
    console.log('    nenhum nome frequente sumiu — este livro está bem nesse ponto')
  }
  // E os casamentos vêm depois, com o aviso: em livro real eles erraram TRÊS
  // em três. Servem de pista para o olho humano, nunca de instrução.
  if (r.casados.length) {
    console.log('    palpites de correspondência (NÃO CONFIAR — ver servidor/nomes-do-livro.mjs):')
    for (const c of r.casados) {
      console.log('      "' + c.de + '" (' + c.nossa + 'x)  ?  "' + c.para + '" (' + c.original + 'x)')
    }
  }

  if (tem('--gravar') && r.casados.length) {
    writeFileSync(join(PASTA, 'nomes-' + t.id + '.json'), JSON.stringify({
      texto: t.id, obra: t.obra_id, titulo: t.titulo, fonte: t.fonte_url,
      medido_em: new Date().toISOString(), casados: r.casados,
    }, null, 1))
  }
}
