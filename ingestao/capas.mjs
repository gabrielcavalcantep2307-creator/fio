// As capas.
//
// Uma estante sem capa não é uma estante — é uma lista. O Gutenberg serve
// uma capa por obra em `pgN.cover.medium.jpg`, com 7 a 13 KB cada: 645 capas
// custam uns 6 MB, o que cabe folgado num site estático.
//
//   node ingestao/capas.mjs
//
// Quem não tiver capa fica sem, e o site desenha uma no lugar — a partir do
// título e do autor. É melhor que um retângulo cinza, e não mente sobre ter
// uma imagem que não existe.

import { writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, fechar, RAIZ } from '../servidor/banco/base.mjs'

const PASTA = join(RAIZ, 'web', 'public', 'capas')
const PAUSA = 350
const MINIMO = 2500

// O Gutenberg SEMPRE responde com uma imagem: quando não tem a capa de
// verdade, ele desenha uma — arte geométrica berrante com "Project Gutenberg"
// carimbado. Numa estante isso é pior que não ter capa nenhuma.
//
// O jeito de saber: a capa gerada sai sempre em 200x300 exatos, porque é
// desenhada nessa medida. A digitalização de um livro real preserva a
// proporção do original, e cai em 185x300, 170x300, 192x300 — nunca no 2:3
// redondo. Medi as 659: 537 eram geradas.
const GERADA = { w: 200, h: 300 }

/** Largura e altura direto do JPEG, sem biblioteca nenhuma. */
function medir(caminho) {
  const b = readFileSync(caminho)
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const marca = b[i + 1]
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

const ehGerada = (caminho) => {
  const d = medir(caminho)
  return !d || (d.w === GERADA.w && d.h === GERADA.h)
}

// limpeza: joga fora o que já foi baixado e é arte gerada
if (process.argv.includes('--limpar')) {
  const banco0 = abrir()
  const zera = banco0.prepare('UPDATE obra SET capa = NULL WHERE capa = ?')
  let fora = 0
  for (const f of readdirSync(PASTA)) {
    const p = join(PASTA, f)
    if (!ehGerada(p)) continue
    unlinkSync(p); zera.run(f); fora++
  }
  console.log(`descartadas ${fora} capas geradas pelo Gutenberg — o site desenha as delas`)
  fechar()
  process.exit(0)
}

const banco = abrir()
mkdirSync(PASTA, { recursive: true })

const fila = banco.prepare(
  `SELECT o.id, t.fonte_id, o.titulo FROM obra o
     JOIN texto t ON t.obra_id = o.id
    WHERE t.fonte = 'gutenberg' AND o.publicada = 1
    ORDER BY o.id`).all()

const marca = banco.prepare('UPDATE obra SET capa = ? WHERE id = ?')

let baixadas = 0, pulos = 0, sem = 0
for (const [k, o] of fila.entries()) {
  const destino = join(PASTA, `${o.id}.jpg`)
  if (existsSync(destino) && statSync(destino).size > MINIMO && !ehGerada(destino)) {
    marca.run(`${o.id}.jpg`, o.id); pulos++; continue
  }
  try {
    const r = await fetch(
      `https://www.gutenberg.org/cache/epub/${o.fonte_id}/pg${o.fonte_id}.cover.medium.jpg`,
      { headers: { 'user-agent': 'fio/0.1 (biblioteca em portugues)' } },
    )
    if (!r.ok) { sem++; marca.run(null, o.id) }
    else {
      const bin = Buffer.from(await r.arrayBuffer())
      if (bin.length < MINIMO) { sem++; marca.run(null, o.id) }
      else {
        writeFileSync(destino, bin)
        if (ehGerada(destino)) { unlinkSync(destino); marca.run(null, o.id); sem++ }
        else { marca.run(`${o.id}.jpg`, o.id); baixadas++ }
      }
    }
  } catch { sem++; marca.run(null, o.id) }

  if (k % 50 === 0) process.stderr.write(`${k}/${fila.length}  ${baixadas} capas\r`)
  await new Promise(r => setTimeout(r, PAUSA))
}

console.log(`\ncapas baixadas .. ${baixadas}`)
console.log(`já tinha ........ ${pulos}`)
console.log(`sem capa ........ ${sem}  (o site desenha uma)`)
fechar()
