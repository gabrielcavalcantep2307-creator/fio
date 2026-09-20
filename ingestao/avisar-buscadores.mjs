// Avisar os buscadores, um por um, de cada página que existe (IndexNow).
//
//   node ingestao/avisar-buscadores.mjs            # avisa tudo que está no sitemap
//   node ingestao/avisar-buscadores.mjs --so 50    # só as 50 primeiras (teste)
//
// IndexNow é o protocolo que Bing, Yandex, Seznam e Naver aceitam para o dono
// do site dizer "esta página é nova/mudou" em vez de esperar o robô passar.
// O Google não usa (lá quem manda é o Search Console), mas o Bing alimenta
// também o DuckDuckGo, o Ecosia e as respostas do ChatGPT.
//
// Como o buscador sabe que somos o dono: uma chave sorteada fica num arquivo
// texto no próprio site (https://fiolib.com.br/<chave>.txt). É por isso que
// isto NÃO é spam nem truque: só funciona para quem pode escrever no site.
//
// Rodar quando: depois de publicar páginas novas (a esteira traduz um livro
// novo quase toda hora). Uma vez por dia basta.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SITE = process.env.FIO_SITE || 'https://fiolib.com.br'
const HOST = new URL(SITE).host
const ESTATICO = process.env.FIO_ESTATICO || '/opt/fio/site'
const POR_VEZ = 5000

// A chave vive no site; se não existir, nasce aqui.
function chave() {
  const arquivo = join(ESTATICO, 'indexnow.chave')
  if (existsSync(arquivo)) return readFileSync(arquivo, 'utf8').trim()
  const nova = randomBytes(16).toString('hex')
  mkdirSync(ESTATICO, { recursive: true })
  writeFileSync(arquivo, nova)
  writeFileSync(join(ESTATICO, `${nova}.txt`), nova)
  console.log(`chave nova: ${SITE}/${nova}.txt`)
  return nova
}

async function enderecos() {
  const r = await fetch(`${SITE}/sitemap.xml`)
  if (!r.ok) throw new Error(`sitemap respondeu ${r.status}`)
  const xml = await r.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
}

const k = chave()
let lista = await enderecos()
const so = Number(process.argv[process.argv.indexOf('--so') + 1])
if (Number.isInteger(so) && so > 0) lista = lista.slice(0, so)
console.log(`${lista.length} endereços; chave em ${SITE}/${k}.txt`)

for (let i = 0; i < lista.length; i += POR_VEZ) {
  const pedaco = lista.slice(i, i + POR_VEZ)
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: k, keyLocation: `${SITE}/${k}.txt`, urlList: pedaco }),
  })
  // 200 = aceito; 202 = aceito, chave ainda sendo conferida; 429 = devagar
  console.log(`  ${pedaco.length} endereços → ${r.status} ${r.statusText}`)
  if (r.status === 429) { console.log('  (o buscador pediu calma; pare por hoje)'); break }
  await new Promise((s) => setTimeout(s, 1500))
}
