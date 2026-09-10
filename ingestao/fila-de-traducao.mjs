// A fila: quais obras do catálogo podemos traduzir, e por quê.
//
//   node ingestao/fila-de-traducao.mjs --banco dados/catalogo.db [--preencher]
//
// ─────────────────────────────────────────────────────────────
// O QUE DECIDE, E POR QUE É UMA COLUNA VAZIA QUE TRAVA TUDO
//
// A pergunta "podemos traduzir esta obra?" tem uma resposta só, e ela é o ano
// da morte do autor. Lei 9.610/98, art. 41: setenta anos contados de 1º de
// janeiro do ano seguinte. Morreu em 1950, é livre desde 2021.
//
// Sabendo o ano, tudo o mais sai por conta: `direito.livre_em` já existe no
// esquema, a fila do ano que vem vira uma consulta, e ninguém precisa lembrar.
//
// Só que `pessoa.morte` está vazia em 1.267 dos 1.606 autores. Sem ela, o
// sistema não sabe distinguir Kafka, que é livre desde 1995, de Foucault, que
// só será em 2055 — e na dúvida não faz nada, que é o certo e é paralisante.
//
// `--preencher` vai buscar os anos que faltam no Wikidata. É o passo que
// destrava a fila inteira, e ele roda uma vez.
// ─────────────────────────────────────────────────────────────
//
// SOBRE A FONTE DO ORIGINAL, que é a outra metade
//
// A língua não importa: já traduzimos do alemão, do grego, do chinês, do
// russo, do italiano e do francês. O que importa é o texto de PARTIDA ser o
// ORIGINAL do autor, e não a tradução de outra pessoa.
//
// Esse é o erro fácil de cometer procurando "domínio público" na internet.
// Dostoiévski é livre; a tradução da Constance Garnett também, porque ela
// morreu em 1946. Mas uma tradução brasileira dos anos 90 do mesmo livro NÃO
// é, e traduzir a partir dela seria fazer obra derivada de obra protegida.
//
// A regra prática: da obra do autor, sim. Da tradução de alguém, só se essa
// tradução também já tiver caído.

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const tem = (n) => process.argv.includes(`--${n}`)

const banco = arg('banco', join(RAIZ, 'dados', 'catalogo.db'))
const ANO = new Date().getFullYear()
const db = new DatabaseSync(banco)

// ─────────────────────────────────────────────────────────────
// Buscar no Wikidata o que falta
// ─────────────────────────────────────────────────────────────

const SPARQL = 'https://query.wikidata.org/sparql'
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

/**
 * Um lote de nomes vira uma consulta só.
 *
 * Exigimos que seja HUMANO (Q5) e que o rótulo bata EXATO, em português ou
 * inglês. Busca por semelhança já custou caro neste projeto — a da Open
 * Library deu a capa de "Desenhos Astrais" para o Frankl. Aqui o estrago
 * seria pior: um ano de morte errado libera para tradução uma obra que ainda
 * tem dono.
 *
 * Nome que casa com mais de uma pessoa é descartado, pelo mesmo motivo.
 */
// Ofícios de quem escreve livro. Sem este filtro, o casamento por nome pega
// XARÁ — e xará é o pior erro possível aqui.
//
// Aconteceu: "Ludwig Wittgenstein" voltou com 1925, e o filósofo morreu em
// 1951. Existe outro Ludwig Wittgenstein no Wikidata, e como só ele casou, a
// trava de ambiguidade não disparou: ela pega "mais de um resultado", não
// pega "um resultado, da pessoa errada".
//
// No caso do Wittgenstein não mudou nada, porque as duas datas já caíram em
// domínio público. Mas o erro simétrico é grave: um homônimo morto no século
// XIX libera para tradução a obra de um autor que ainda tem herdeiros.
const OFICIOS = [
  'Q36180',    // escritor
  'Q4964182',  // filósofo
  'Q49757',    // poeta
  'Q6625963',  // romancista
  'Q11774202', // ensaísta
  'Q214917',   // dramaturgo
  'Q201788',   // historiador
  'Q1930187',  // jornalista
  'Q185351',   // jurista
  'Q4263842',  // figura literária / autor
  'Q1622272',  // professor universitário
]

async function mortesDe(nomes) {
  const valores = nomes.map((n) => `"${n.replace(/["\\]/g, '')}"@pt "${n.replace(/["\\]/g, '')}"@en`).join(' ')
  const oficios = OFICIOS.map((q) => `wd:${q}`).join(' ')
  const consulta = `
    SELECT ?nome ?morte WHERE {
      VALUES ?nome { ${valores} }
      VALUES ?oficio { ${oficios} }
      ?p rdfs:label ?nome ; wdt:P31 wd:Q5 ; wdt:P570 ?data ; wdt:P106 ?oficio .
      BIND(YEAR(?data) AS ?morte)
    }`

  const r = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(consulta)}`,
    { headers: { 'user-agent': UA, accept: 'application/sparql-results+json' } })
  if (!r.ok) throw new Error(`Wikidata respondeu ${r.status}`)

  const { results } = await r.json()
  const porNome = new Map()
  for (const linha of results.bindings) {
    const nome = linha.nome.value
    const morte = Number(linha.morte.value)
    if (!porNome.has(nome)) porNome.set(nome, new Set())
    porNome.get(nome).add(morte)
  }
  // ambiguidade não decide
  const limpo = new Map()
  for (const [nome, anos] of porNome) if (anos.size === 1) limpo.set(nome, [...anos][0])
  return limpo
}

async function preencher() {
  const faltam = db.prepare(`
    SELECT DISTINCT p.id, p.nome FROM pessoa p
      JOIN obra_pessoa op ON op.pessoa_id = p.id AND op.papel = 'autor'
     WHERE p.morte IS NULL AND length(p.nome) > 4
     ORDER BY p.nome`).all()

  console.log(`${faltam.length} autores sem ano de morte`)
  const grava = db.prepare('UPDATE pessoa SET morte = ? WHERE id = ?')
  let achados = 0

  for (let i = 0; i < faltam.length; i += 60) {
    const lote = faltam.slice(i, i + 60)
    let mortes
    try { mortes = await mortesDe(lote.map((p) => p.nome)) } catch (e) {
      console.log(`\n  lote ${i}: ${e.message} — seguindo`)
      continue
    }
    for (const p of lote) {
      const ano = mortes.get(p.nome)
      if (ano && ano > 0 && ano <= ANO) { grava.run(ano, p.id); achados++ }
    }
    process.stdout.write(`\r  ${Math.min(i + 60, faltam.length)}/${faltam.length}, ${achados} encontrados   `)
    await new Promise((r) => setTimeout(r, 1200))   // o endpoint é público e gratuito
  }
  console.log()
}

// ─────────────────────────────────────────────────────────────
// A fila
// ─────────────────────────────────────────────────────────────

function fila() {
  const linhas = db.prepare(`
    SELECT o.id, o.titulo, o.trilho, p.nome autor, p.morte,
           (SELECT COUNT(*) FROM trilha_item ti WHERE ti.obra_id = o.id) em_trilha
      FROM obra o
      LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      LEFT JOIN pessoa p ON p.id = op.pessoa_id
     WHERE NOT EXISTS (SELECT 1 FROM texto t WHERE t.obra_id = o.id AND t.normalizado = 1)
       AND o.publicada = 1`).all()

  const pode = [], espera = [], semDado = []
  for (const l of linhas) {
    if (l.morte == null) { semDado.push(l); continue }
    const livreEm = l.morte + 71
    ;(livreEm <= ANO ? pode : espera).push({ ...l, livreEm })
  }

  // O que está numa prateleira vem primeiro: é o que alguém já vai procurar.
  pode.sort((a, b) => b.em_trilha - a.em_trilha || String(a.autor).localeCompare(String(b.autor)))

  console.log(`\n${linhas.length} obras publicadas sem texto para ler\n`)
  console.log(`  PODEMOS TRADUZIR HOJE .... ${pode.length}`)
  console.log(`  ainda protegidas ......... ${espera.length}`)
  console.log(`  sem ano de morte ......... ${semDado.length}  (rode --preencher)`)

  console.log('\n── os que estão em alguma prateleira, e podem ser traduzidos ──')
  for (const l of pode.filter((x) => x.em_trilha)) {
    console.log(`  ${String(l.id).padStart(5)}  ${String(l.autor).slice(0, 26).padEnd(26)} ${String(l.morte).padStart(5)}  ${String(l.titulo).slice(0, 40)}`)
  }

  console.log('\n── em prateleira e SEM caminho, para a ficha dizer até quando ──')
  for (const l of espera.filter((x) => x.em_trilha).sort((a, b) => a.livreEm - b.livreEm)) {
    console.log(`  ${String(l.autor).slice(0, 26).padEnd(26)} livre em ${l.livreEm}  ${String(l.titulo).slice(0, 34)}`)
  }
}

/**
 * Reconferir o que já está gravado, com o casamento apertado.
 *
 * A primeira rodada usou só nome + humano + data de morte, e isso pegou xará:
 * o único "Ludwig Wittgenstein" com esse rótulo exato no Wikidata é um
 * empresário morto em 1925, e não o filósofo. Naquele caso não mudou nada,
 * porque as duas datas já caíram — mas o erro simétrico liberaria para
 * tradução a obra de alguém que ainda tem herdeiros.
 *
 * Então tudo que entrou por dedução volta para a mesa. O que a consulta
 * apertada confirmar fica; o que ela contradisser é corrigido; e o que ela
 * não souber responder VOLTA A SER NULO, porque no fim a coluna vazia é
 * honesta e a coluna errada não é.
 */
async function refazer() {
  const gravados = db.prepare(`
    SELECT DISTINCT p.id, p.nome, p.morte FROM pessoa p
      JOIN obra_pessoa op ON op.pessoa_id = p.id AND op.papel = 'autor'
     WHERE p.morte IS NOT NULL ORDER BY p.nome`).all()

  console.log(`reconferindo ${gravados.length} autores com ano gravado`)
  const grava = db.prepare('UPDATE pessoa SET morte = ? WHERE id = ?')
  let iguais = 0, corrigidos = 0, apagados = 0

  for (let i = 0; i < gravados.length; i += 60) {
    const lote = gravados.slice(i, i + 60)
    let mortes
    try { mortes = await mortesDe(lote.map((p) => p.nome)) } catch { continue }
    for (const p of lote) {
      const ano = mortes.get(p.nome)
      if (ano == null) { grava.run(null, p.id); apagados++ }
      else if (ano === p.morte) iguais++
      else {
        console.log(`\n  ${p.nome}: ${p.morte} → ${ano}`)
        grava.run(ano, p.id); corrigidos++
      }
    }
    process.stdout.write(`\r  ${Math.min(i + 60, gravados.length)}/${gravados.length}  ${iguais} confirmados, ${corrigidos} corrigidos, ${apagados} devolvidos a nulo   `)
    await new Promise((r) => setTimeout(r, 1200))
  }
  console.log()
}

if (tem('refazer')) await refazer()
if (tem('preencher')) await preencher()
fila()
