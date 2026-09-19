// A nota do OCR de cada livro de archive.org (ver servidor/qualidade.mjs).
//
//   node ingestao/medir-ocr.mjs                 # mede tudo (~20 min num núcleo)
//   node ingestao/medir-ocr.mjs --de notas.json # só importa notas já medidas
//
// Na VPS, de dentro do container do site (o banco é o de produção):
//   docker compose -f /opt/fio/infra/docker-compose.yml exec -T fio node ingestao/medir-ocr.mjs
//
// A nota é a fração das palavras (texto já diagramado, primeiras 6 mil) que
// existem nos livros limpos do acervo (Gutenberg e Wikisource, palavra vista
// ao menos duas vezes). Mede só archive.org: as outras fontes são texto
// digitado, não escaneado.

import { readFileSync } from 'node:fs'
import { abrir, fechar } from '../servidor/banco/base.mjs'
import { diagramar } from '../servidor/diagramar.mjs'
import { garantirTabelas } from '../servidor/qualidade.mjs'

const banco = abrir()
garantirTabelas(banco)
const gravar = banco.prepare(`INSERT INTO nota_ocr (obra_id, nota, medido_em) VALUES (?, ?, datetime('now'))
  ON CONFLICT (obra_id) DO UPDATE SET nota = excluded.nota, medido_em = excluded.medido_em`)

const i = process.argv.indexOf('--de')
if (i > 0) {
  const notas = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'))
  let n = 0
  banco.exec('BEGIN')
  for (const [obra, v] of Object.entries(notas)) if (v.fonte === 'archive') { gravar.run(Number(obra), v.nota); n++ }
  banco.exec('COMMIT')
  console.log(`${n} notas importadas`)
  fechar()
  process.exit(0)
}

const palavras = (s) => s.replace(/<[^>]+>/g, ' ').toLowerCase().match(/[a-zà-ÿ]{2,}/g) ?? []
const vocab = new Map()
for (const c of banco.prepare(`SELECT c.corpo FROM capitulo c JOIN texto t ON t.id = c.texto_id
    WHERE t.fonte IN ('gutenberg','wikisource') AND t.normalizado = 1`).iterate()) {
  for (const w of palavras(c.corpo)) vocab.set(w, (vocab.get(w) ?? 0) + 1)
}
for (const [w, n] of vocab) if (n < 2) vocab.delete(w)
console.log(`vocabulário: ${vocab.size} palavras`)

const textos = banco.prepare(`SELECT t.id, o.id obra FROM texto t JOIN obra o ON o.id = t.obra_id
  WHERE t.fonte = 'archive' AND t.normalizado = 1 AND t.dono_id IS NULL`).all()
const capsDe = banco.prepare('SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')
let feitos = 0
for (const t of textos) {
  let tot = 0, ok = 0
  for (const c of diagramar(capsDe.all(t.id), { fonte: 'archive' })) {
    for (const w of palavras(c.corpo)) { tot++; if (vocab.has(w)) ok++; if (tot >= 6000) break }
    if (tot >= 6000) break
  }
  if (tot) gravar.run(t.obra, +(ok / tot).toFixed(3))
  if (++feitos % 200 === 0) console.log(`${feitos}/${textos.length}`)
}
console.log(`${feitos} livros medidos`)
fechar()
