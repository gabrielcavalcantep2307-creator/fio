// Os caracteres quebrados (�) que sobraram no acervo (08/10/2026): 2 títulos e 7 capítulos.
// Cada um foi lido no contexto e consertado à mão; o capítulo antigo fica em
// `capitulo_quebrado_antes` (desfazer = copiar o corpo de volta).
//
//   node quebrados.mjs [--gravar]

import { DatabaseSync } from 'node:sqlite'

const Q = String.fromCharCode(65533)
const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db')
banco.exec('PRAGMA busy_timeout = 30000')
banco.exec('CREATE TABLE IF NOT EXISTS capitulo_quebrado_antes (capitulo_id INTEGER PRIMARY KEY, corpo TEXT NOT NULL, em TEXT DEFAULT (datetime(\'now\')))')
const gravar = process.argv.includes('--gravar')

const TITULOS = [
  [718, 'Relatos Sexuais de Mulheres Ordin' + Q + 'rias', 'Relatos Sexuais de Mulheres Ordinárias', 'Relatos Sexuais de Mulheres Ordin' + Q + 'Rias', 'Relatos Sexuais de Mulheres Ordinárias'],
  [730, 'Escalada do Monte Improv' + Q + 'vel, A', 'Escalada do Monte Improvável, A', null, null],
]
// [capítulo, trecho com o �, trecho certo], na ordem em que valem
const CAPITULOS = [
  [40415, 'vivace ' + Q, 'vivace ♃'],
  [40415, 'signal ' + Q + ',', 'signal ♃,'],
  [102462, 'assim que ' + Q + ' assegura', 'assim que assegura'],
  [102463, '<p>' + Q + ' desenvolvedores', '<p>• desenvolvedores'],
  [105532, 'mes traits, ' + Q + 'e sont', 'mes traits, ne sont'],
  [105934, '<p>' + Q + '</p>', ''],
]
// regras gerais por capítulo: o hífen de sílaba que virou � no meio da palavra,
// e o "� 82" do pé de página impresso (106621, 102464)
const REGRAS = {
  106621: [[new RegExp('([a-zà-ÿ])' + Q + '(?=[a-zà-ÿ])', 'g'), '$1']],
  102464: [[new RegExp('(<p>)?' + Q + ' [0-9]{1,3} ?', 'g'), '$1']],
}

for (const [id, tit, titNovo, pt, ptNovo] of TITULOS) {
  const o = banco.prepare('SELECT titulo, titulo_pt FROM obra WHERE id = ?').get(id)
  console.log(`obra ${id}:`, o.titulo, '->', titNovo, o.titulo_pt === pt ? `| ${ptNovo}` : '')
  if (gravar) {
    if (o.titulo === tit) banco.prepare('UPDATE obra SET titulo = ? WHERE id = ?').run(titNovo, id)
    if (pt && o.titulo_pt === pt) banco.prepare('UPDATE obra SET titulo_pt = ? WHERE id = ?').run(ptNovo, id)
  }
}
const ids = [...new Set([...CAPITULOS.map((c) => c[0]), ...Object.keys(REGRAS).map(Number)])]
for (const id of ids) {
  const c = banco.prepare('SELECT corpo, texto_id FROM capitulo WHERE id = ?').get(id)
  let novo = c.corpo
  for (const [i, de, para] of CAPITULOS) if (i === id) novo = novo.split(de).join(para)
  for (const [re, para] of REGRAS[id] ?? []) novo = novo.replace(re, para)
  console.log(`capítulo ${id}: ${c.corpo.split(Q).length - 1} -> ${novo.split(Q).length - 1} quebrados`)
  if (gravar && novo !== c.corpo) {
    banco.prepare('INSERT OR IGNORE INTO capitulo_quebrado_antes (capitulo_id, corpo) VALUES (?, ?)').run(id, c.corpo)
    banco.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?').run(novo, id)
    banco.prepare('DELETE FROM busca_capitulo WHERE capitulo_id = ?').run(id)
    banco.prepare('INSERT INTO busca_capitulo (corpo, capitulo_id, texto_id) VALUES (?,?,?)').run(novo, id, c.texto_id)
  }
}
console.log('restam:', banco.prepare('SELECT COUNT(*) n FROM capitulo WHERE corpo LIKE \'%\' || ? || \'%\'').get(Q).n, 'capítulos;',
  banco.prepare('SELECT COUNT(*) n FROM obra WHERE titulo LIKE \'%\' || ? || \'%\' OR COALESCE(titulo_pt, \'\') LIKE \'%\' || ? || \'%\'').get(Q, Q).n, 'títulos')
