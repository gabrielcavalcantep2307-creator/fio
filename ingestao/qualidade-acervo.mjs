// O estado de cada livro, para o painel (05/10/2026).
//
// O dono não entendia "selo", "revisora" e "tradutora". Este arquivo diz, de
// cada livro em português, UMA coisa em palavra simples: qual é o problema
// dele, se houver.
//   traducao   — traduzido por máquina, ainda sem revisão
//   escaneado  — lido de página escaneada: erro de leitura de letra
//   grafia     — escrito antes de 1943 ("elle", "pharmacia"); a lista lida
//                atualiza na leitura, e "resto" é o que ela ainda não cobre
//   limpo      — texto digitado, grafia de hoje
// Ler o acervo inteiro leva um minuto e meio; o painel lê o resultado.
//
//   node ingestao/qualidade-acervo.mjs [/dados/qualidade.json]

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const saida = process.argv[2] || '/dados/qualidade.json'
const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db', { readOnly: true })
const { trocas } = JSON.parse(readFileSync(new URL('../servidor/ortografia-atualizada.json', import.meta.url), 'utf8'))
const lista = new Set(Object.keys(trocas))
// as listas automáticas da modernizadora também contam como "já coberto"
try { for (const k of Object.keys(JSON.parse(readFileSync('/dados/mapas/grafia-auto.json', 'utf8')))) lista.add(k) } catch { /* ainda não existe */ }

// o que a lista ainda não cobre: palavras com forma moderna proposta e não lida
const resto = new Set()
// palavra inglesa no meio do livro ("have", "them") não é grafia antiga
const estrangeiras = existsSync('/dados/ortografia/estrangeiras.txt')
  ? new Set(readFileSync('/dados/ortografia/estrangeiras.txt', 'utf8').split('\n')) : new Set()
for (const f of ['proposta-segura.tsv', 'acentos.tsv']) {
  const c = `/dados/ortografia/${f}`
  if (existsSync(c)) for (const l of readFileSync(c, 'utf8').split('\n')) { const p = l.split('\t')[0]; if (p && p.length >= 4 && !lista.has(p) && !estrangeiras.has(p) && !l.includes('dúvida')) resto.add(p) }
}

const PAL = /[a-zà-öø-ÿ]+(?:['’-][a-zà-öø-ÿ]+)*/g
const textos = banco.prepare(`SELECT t.id, t.obra_id, t.fonte FROM texto t JOIN obra o ON o.id = t.obra_id
  WHERE t.dono_id IS NULL AND t.idioma = 'pt' AND o.publicada = 1`).all()
const caps = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?')
const por = {}
for (const t of textos) {
  let palavras = 0, antigas = 0, sobra = 0
  for (const c of caps.iterate(t.id)) {
    // etiqueta de bloco separa palavra; a de dentro da linha não ("<b>Q</b>uando" é uma palavra só)
    for (const m of c.corpo.replace(/<\/?(p|div|br|h[1-6]|li|blockquote|tr|td)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').matchAll(PAL)) {
      palavras++
      const w = m[0].replace(/’/g, "'")
      if (lista.has(w)) antigas++
      else if (resto.has(w)) sobra++
    }
  }
  if (!palavras) continue
  const mil = (n) => Math.round((n / palavras) * 10000) / 10
  const tipo = t.fonte === 'fio_traducao' ? 'traducao' : t.fonte === 'archive' ? 'escaneado'
    : mil(antigas) + mil(sobra) >= 3 ? 'grafia' : 'limpo'
  // a obra com mais de um texto fica com o MELHOR (o leitor abre o português digitado)
  const ordem = { limpo: 0, grafia: 1, traducao: 2, escaneado: 3 }
  const atual = por[t.obra_id]
  if (!atual || ordem[tipo] < ordem[atual[0]]) por[t.obra_id] = [tipo, mil(antigas), mil(sobra), palavras]
}
writeFileSync(saida, JSON.stringify({ feito: new Date().toISOString(), obras: por }))
const conta = {}
for (const [tipo] of Object.values(por)) conta[tipo] = (conta[tipo] ?? 0) + 1
console.log(saida, conta)
