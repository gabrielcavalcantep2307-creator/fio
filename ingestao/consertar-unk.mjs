// Conserta o "⁇" dos livros que já saíram (07/10/2026).
//
// O Opus não tem "ü" nem maiúscula acentuada no vocabulário e escrevia "⁇"
// ("freq ⁇ entemente", "HIST ⁇ RIA", "a ⁇ ndia"): 3.552 vezes em 59 livros. O
// tradutor agora repõe a letra sozinho (infra/tradutor/servidor.py); isto
// conserta o que já estava no banco, com a mesma regra — sem o original à
// mão, o dicionário é o das palavras dos livros digitados do acervo
// (/dados/ocr/digitado.tsv). O que não tiver conserto certo fica como está.
// Cada capítulo mexido é guardado antes em `capitulo_unk_antes` (volta: --desfazer).
//
//   node ingestao/consertar-unk.mjs [--gravar] [--desfazer]

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db')
banco.exec('PRAGMA busy_timeout = 30000')
banco.exec(`CREATE TABLE IF NOT EXISTS capitulo_unk_antes (capitulo_id INTEGER PRIMARY KEY, corpo TEXT NOT NULL, em TEXT DEFAULT (datetime('now')))`)
const reindexar = (textoId) => {
  banco.prepare('DELETE FROM busca_capitulo WHERE texto_id = ?').run(textoId)
  const poe = banco.prepare('INSERT INTO busca_capitulo (corpo, capitulo_id, texto_id) VALUES (?,?,?)')
  for (const c of banco.prepare('SELECT id, corpo FROM capitulo WHERE texto_id = ?').all(textoId)) poe.run(c.corpo, c.id, textoId)
}

if (process.argv.includes('--desfazer')) {
  const textos = new Set()
  for (const r of banco.prepare('SELECT a.capitulo_id, a.corpo, c.texto_id FROM capitulo_unk_antes a JOIN capitulo c ON c.id = a.capitulo_id').all()) {
    banco.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?').run(r.corpo, r.capitulo_id); textos.add(r.texto_id)
  }
  for (const t of textos) reindexar(t)
  banco.exec('DELETE FROM capitulo_unk_antes')
  console.log('desfeito em', textos.size, 'textos'); process.exit(0)
}

const dic = new Map()
for (const l of readFileSync('/dados/ocr/digitado.tsv', 'utf8').split('\n')) { const [w, n, lv] = l.split('\t'); if (w && Number(lv) >= 3) dic.set(w, Number(n)) }
const LETRAS = ['u', 'í', 'ó', 'á', 'é', 'ú', 'ã', 'õ', 'ç', 'ê', 'â', 'ô', 'çã', 'çõ']
// só letra latina, e o pedaço depois do "⁇" tem de existir (nome chinês de uma
// letra, "K ⁇ ." ou grego, "ἀυτ ⁇ ", ficam como estão)
const UNK = /([A-Za-zÀ-ÿ]*) ?⁇ ?([A-Za-zÀ-ÿ]+)/g

// leitura separada ("a" + "Índia") só depois de palavra curta do português
const CURTAS = new Set('a o à da do na no de em e para com pela pelo um uma as os das dos nas nos'.split(' '))
const MAO = [[/\b([Aa])rco- ?⁇ ?ris\b/g, '$1rco-íris'], [/\b(da|na|a|à|para a) ⁇ ndia\b/g, '$1 Índia']]

function consertar(t) {
  for (const [re, por] of MAO) t = t.replace(re, por)
  return t.replace(UNK, (todo, a, b, pos) => {
    const antes = t.slice(0, pos).trimEnd().slice(-1)
    // "⁇" solto antes de palavra com maiúscula ("escuro, ⁇ Os"): é pontuação perdida
    if (/ ⁇ [A-ZÀ-Þ]/.test(todo) && !a && b !== b.toUpperCase()) return todo
    if (/^ ?⁇ /.test(todo) && !a && /^[a-zà-ÿ]/.test(b) && /[,;:]/.test(antes)) return todo
    // grego, cirílico: não é com letra portuguesa que se conserta
    if (/[Ͱ-Ͽἀ-῿Ѐ-ӿ]/.test(t.slice(Math.max(0, pos - 3), pos + todo.length + 3))) return todo
    // inicial de nome + pedaço curto ("D ⁇ e", "C ⁇ mē"): não é palavra portuguesa
    if (a.length === 1 && a === a.toUpperCase() && b.length <= 2) return todo
    // o espaço da frente é do texto, não do "⁇" ("rrancadas! ⁇ timo")
    if (!a && todo.startsWith(' ')) { const d = consertar(todo.trimStart()); return d === todo.trimStart() ? todo : ' ' + d }
    const tudoMaiusc = (a + b).length > 1 && (a + b) === (a + b).toUpperCase()
    const leituras = [[a, '']].concat(a && CURTAS.has(a.toLowerCase()) && !tudoMaiusc ? [['', a + ' ']] : [])
    for (const [pre, fica] of leituras) {
      if ((pre + b).length < 2) continue
      const tudoMaius = (pre + b).length > 1 && (pre + b) === (pre + b).toUpperCase() && /\p{Lu}/u.test(pre + b)
      const letras = LETRAS.filter((c) => !(!pre && c === 'u'))
      const cands = tudoMaius ? letras.filter((c) => c !== 'u').map((c) => pre + c.toUpperCase() + b)
        : !pre ? [...letras.map((c) => c.toUpperCase() + b), ...letras.map((c) => c + b)]
          : letras.map((c) => pre + c + b)
      const boas = cands.filter((c) => c.length >= 3 && (dic.get(c.toLowerCase()) ?? 0) >= 20).sort((x, y) => dic.get(y.toLowerCase()) - dic.get(x.toLowerCase()))
      if (boas.length) {
        const meio = /\p{L}/u.test((fica || antes).trim().slice(-1)) || antes === '-'
        if (!pre && !tudoMaius && meio) { const m = boas.find((c) => c[0] === c[0].toLowerCase()); if (m) return fica + m }
        if (!pre && !tudoMaius) { const M = boas.find((c) => c[0] !== c[0].toLowerCase()); if (M) return fica + M }
        return fica + boas[0]
      }
    }
    return todo
  })
}

const gravar = process.argv.includes('--gravar')
const caps = banco.prepare(`SELECT id, texto_id, corpo FROM capitulo WHERE corpo LIKE '%⁇%'`).all()
let antes = 0, depois = 0
const textos = new Set()
const exemplos = []
for (const c of caps) {
  const n0 = (c.corpo.match(/⁇/g) ?? []).length
  const novo = consertar(c.corpo)
  const n1 = (novo.match(/⁇/g) ?? []).length
  antes += n0; depois += n1
  if (novo === c.corpo) continue
  for (const m of c.corpo.matchAll(/\S{0,10} ?⁇ ?\S{0,10}/g)) { const d = consertar(m[0]); if (d !== m[0]) exemplos.push(m[0] + ' → ' + d) }
  if (gravar) {
    banco.prepare('INSERT OR IGNORE INTO capitulo_unk_antes (capitulo_id, corpo) VALUES (?,?)').run(c.id, c.corpo)
    banco.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?').run(novo, c.id)
    textos.add(c.texto_id)
  }
}
for (const t of textos) reindexar(t)
console.log({ capitulos: caps.length, antes, depois, consertados: antes - depois, gravado: gravar, textos: textos.size })
// amostra ao acaso do que mudou, para ler antes de gravar
let sem = 9; const r = () => (sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648
for (let i = exemplos.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [exemplos[i], exemplos[j]] = [exemplos[j], exemplos[i]] }
console.log(exemplos.slice(0, 80).join('  |  '))
