// A ficha do autor que morreu antes de Cristo.
//
// `direito.motivo` é a frase que a ficha do livro e o PDF mostram, e ela é
// gravada uma vez, quando a obra entra. Para Sun Tzu, Aristóteles e Tito
// Lívio o ano de morte é negativo na origem dos dados, e a frase saía assim:
//
//   Sun Tzu (autor) morreu em -496; Lei 9.610/98 art. 41 (70 anos a partir
//   de 1º/1 do ano seguinte) ⇒ livre em -425.
//
// `servidor/banco/base.mjs` já não escreve mais assim — mas o que está
// gravado continua gravado. São seis obras.
//
//   node ingestao/consertar-ficha-antiga.mjs             # simulação
//   node ingestao/consertar-ficha-antiga.mjs --aplicar

import { DatabaseSync } from 'node:sqlite'

const BANCO = process.env.FIO_BANCO || 'dados/catalogo.db'
const aplicar = process.argv.includes('--aplicar')

const banco = new DatabaseSync(BANCO)
const linhas = banco.prepare(
  "SELECT texto_id, jurisdicao, motivo FROM direito WHERE motivo LIKE '%morreu em -%'").all()

const arrumar = (m) => m
  .replace(/morreu em -(\d+)/g, (_, n) => `morreu em ${n} a.C.`)
  // "livre em 425 a.C." e "desde -283" são aritmeticamente certos e não dizem
  // nada: o que a pessoa precisa saber é que já caiu.
  .replace(/[⇒=]>?\s*livre em -\d+\./g, '— já em domínio público.')
  .replace(/desde -\d+ /g, 'desde sempre ')

const poe = banco.prepare('UPDATE direito SET motivo = ? WHERE texto_id = ? AND jurisdicao = ?')
for (const l of linhas) {
  const novo = arrumar(l.motivo)
  console.log(`texto ${l.texto_id}\n  antes: ${l.motivo}\n  agora: ${novo}`)
  if (aplicar) poe.run(novo, l.texto_id, l.jurisdicao)
}

console.log(`\n${aplicar ? 'ARRUMADAS' : 'seriam arrumadas'}: ${linhas.length} fichas`)
if (!aplicar) console.log('(simulação — rode com --aplicar para valer)')
