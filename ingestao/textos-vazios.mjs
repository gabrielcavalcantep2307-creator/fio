// Fichas de texto que prometem um livro e não têm nenhum.
//
//   node ingestao/textos-vazios.mjs --banco /dados/catalogo.db
//
// Uma linha em `texto` é a promessa de que aquela obra é legível. O catálogo
// conta essas linhas para dizer quantos livros a biblioteca serve, e a tela
// mostra o botão de ler a partir delas. Se a linha existe e não há um capítulo
// atrás dela, tudo isso continua funcionando: o número sobe, o botão aparece,
// e o leitor clica para não achar nada.
//
// É o pior tipo de defeito de catálogo, porque não quebra — mente.
//
// Achado em 14/09/2026 pelo caminho torto: procurando textos com o idioma
// errado, o Othello não apareceu na lista, e ele era o caso que se sabia
// errado. Não apareceu porque não havia o que medir.

import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const db = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: true })

const vazios = db.prepare(`
  SELECT t.id, t.obra_id, t.idioma, t.fonte, t.fonte_url, t.palavras, t.criado_em, o.titulo
    FROM texto t JOIN obra o ON o.id = t.obra_id
   WHERE NOT EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id)
   ORDER BY t.obra_id`).all()

const total = db.prepare('SELECT COUNT(*) n FROM texto').get().n

console.log(`${vazios.length} fichas de texto sem um capítulo sequer, de ${total}\n`)

const contar = (campo) => {
  const c = {}
  for (const v of vazios) c[v[campo] ?? '(nulo)'] = (c[v[campo] ?? '(nulo)'] ?? 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1])
}

console.log('por fonte:')
for (const [k, n] of contar('fonte')) console.log(`  ${String(k).padEnd(16)} ${String(n).padStart(4)}`)
console.log('\npor idioma:')
for (const [k, n] of contar('idioma')) console.log(`  ${String(k).padEnd(16)} ${String(n).padStart(4)}`)

// `palavras` é a coluna que o catálogo usa para dizer o tamanho do livro. Se
// ela está preenchida numa ficha sem capítulo, a mentira tem número: a tela
// mostra "182 mil palavras" para um texto que não existe.
const comNumero = vazios.filter((v) => v.palavras > 0)
console.log(`\ndessas, ${comNumero.length} ainda anunciam um número de palavras`)

console.log('\n-- as 30 primeiras --')
for (const v of vazios.slice(0, 30)) {
  console.log(`  obra ${String(v.obra_id).padStart(5)}  ${String(v.idioma).padEnd(3)} ` +
    `${String(v.fonte).padEnd(13)} ${String(v.palavras ?? 0).padStart(7)} pal  ${String(v.titulo).slice(0, 44)}`)
}

writeFileSync('/tmp/textos-vazios.json', JSON.stringify({ feito_em: new Date().toISOString(), vazios }, null, 1))
console.log('\nlista inteira em /tmp/textos-vazios.json')
