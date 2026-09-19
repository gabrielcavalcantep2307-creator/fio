// O trabalhador da esteira: traduz a fila para sempre, sozinho, na VPS.
//
//   node servidor/esteira-trabalhador.mjs                       # o laço eterno
//   node servidor/esteira-trabalhador.mjs --importar lote.json  # põe um lote na fila e sai
//
// Roda num container PRÓPRIO (serviço `esteira` do docker-compose), da mesma
// imagem da API e no mesmo banco. É um processo à parte, e não uma rota dentro
// da API, por três razões:
//
//   1. `node:sqlite` é síncrono. Instalar um livro de 400 mil palavras e
//      refazer o catálogo são dezenas de segundos de CPU; dentro da API,
//      seriam dezenas de segundos em que o site não responde a ninguém.
//   2. Memória. A API vive em 320 MB e é o que o leitor vê. Um livro grande
//      estourando a memória tem que derrubar a esteira, não o site.
//   3. Morrer e voltar. O Docker religa este container sozinho
//      (`restart: unless-stopped`), e tudo aqui é refazível: o caderno de cada
//      livro guarda cada parágrafo já traduzido, e a fila no banco guarda o
//      que falta. Cair no meio de um livro custa só o parágrafo em voo.
//
// ─────────────────────────────────────────────────────────────
// A VOLTA, e quem faz cada passo
//
//   1. promove o que o painel e os assinantes pediram ('espera' → obra)  esteira.mjs
//   2. se pausada no painel, espera
//   3. mede o tamanho das fontes novas (HEAD; ordem menor→maior)
//   4. escolhe o próximo; se não há, põe o catálogo em dia e dorme
//   5. traduz                                                             servicos/traducao.mjs
//   6. instala no banco e na busca, e marca pronto                        servicos/acervo.mjs
//   7. publica a obra no catálogo do site (só ela, em milissegundos)      servicos/catalogo.mjs
//
// Tudo no mesmo processo, por chamada de função (19/09/2026). Até então cada
// livro era um `node traduzir-obra.mjs` à parte, o andamento vinha de uma
// expressão regular sobre o texto que ele imprimia, e o catálogo era outro
// `node publicar.mjs` de 30 s a cada livro. Agora o andamento chega por
// callback, parar é um AbortSignal, e o catálogo inteiro só é refeito quando
// a esteira fica ociosa (ou a cada 6 h de trabalho seguido).
//
// O pulso: o estado vai direto para a tabela `esteira_pulso` a cada ~20 s, e
// o painel mostra ao vivo.
// ─────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrir } from './banco/base.mjs'
import * as esteira from './esteira.mjs'
import { traduzirLivro, traducaoPronta } from './servicos/traducao.mjs'
import { instalarLivro } from './servicos/acervo.mjs'
import { publicarCatalogo, publicarObra } from './servicos/catalogo.mjs'
import { traduzir, saldoDeepL } from './servicos/motor-traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = process.env.FIO_TRADUCOES || join(RAIZ, 'dados', 'traducoes')
// A pasta `dados/` do site (catalogo.json e fichas/). Sem ela o livro entra no
// banco e na busca, mas não na vitrine — e o trabalhador avisa no log.
const SITE_DADOS = process.env.FIO_SITE_DADOS || null
const JURISDICAO = process.env.FIO_JURISDICAO || 'BR'
const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.com.br)'

const MIN = 60_000
const OCIOSA_MIN = Number(process.env.FIO_ESTEIRA_OCIOSA_MIN || 5)        // fila vazia: olha de novo a cada 5 min
const SEM_SINAL_MIN = Number(process.env.FIO_ESTEIRA_SEM_SINAL_MIN || 60) // livro sem avançar 1 h: travou
const TETO_LIVRO_H = 36                                                     // nenhum livro leva mais que isso
const CATALOGO_INTEIRO_H = 6                                                // em trabalho seguido, refaz tudo a cada 6 h

const banco = abrir()
// A API escreve no mesmo banco. Esperar até 30 s pela vez é melhor que
// perder uma instalação por SQLITE_BUSY.
banco.exec('PRAGMA busy_timeout = 30000')
esteira.garantirTabelas(banco)
mkdirSync(PASTA, { recursive: true })

// ─────────────────────────────────────────────────────────────
// Log e pulso
// ─────────────────────────────────────────────────────────────

const pulso = { estado: 'medindo', rodada: {}, plano: {}, atual: null, ultimos: [], log: [] }
let ultimoPulso = 0

function log(...a) {
  const linha = a.join(' ')
  console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${linha}`)
  for (const l of linha.split('\n')) {
    const t = l.replace(/\r/g, '').trim()
    if (t) pulso.log.push(t.slice(0, 200))
  }
  if (pulso.log.length > 12) pulso.log.splice(0, pulso.log.length - 12)
}

function pulsar(parcial = {}, agora = false) {
  Object.assign(pulso, parcial)
  if (!agora && Date.now() - ultimoPulso < 20_000) return
  ultimoPulso = Date.now()
  try {
    const plano = esteira.contagem(banco)
    pulso.plano = { total: plano.total, traduzidos: plano.traduzidos }
    esteira.guardarPulso(banco, { ...pulso, enviado: new Date().toISOString() })
  } catch (e) { console.error('pulso:', e.message) } // banco ocupado agora; o próximo vai
}

const inicio = new Date().toISOString()
const rodada = { feitos: 0, falhas: 0 }
const pulsoRodada = () => {
  const c = esteira.contagem(banco)
  return { total: rodada.feitos + rodada.falhas + c.faltam, feitos: rodada.feitos, falhas: rodada.falhas, inicio }
}
function lembrar(u) { pulso.ultimos.unshift(u); pulso.ultimos.splice(8) }

// ─────────────────────────────────────────────────────────────
// Parar direito, e os vigias
// ─────────────────────────────────────────────────────────────

let parar = false
let livroEmCurso = null // o AbortController do livro de agora
let ultimoAvanco = Date.now()
const avancou = () => { ultimoAvanco = Date.now() }

// O `docker stop` manda SIGTERM. O livro em curso para de pedir parágrafos
// novos — o caderno já guardou cada um que saiu — e o próximo começo continua dali.
function encerrar(sinal) {
  if (parar) return
  parar = true
  log(`${sinal}: parando (o caderno guarda o que já saiu)`)
  livroEmCurso?.abort(new Error('a esteira foi parada'))
  try { pulsar({ estado: 'parada', atual: null }, true) } catch {}
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', () => encerrar('SIGTERM'))
process.on('SIGINT', () => encerrar('SIGINT'))

// Qualquer coisa que escape vira saída com erro — e o Docker religa. Um
// processo meio-vivo, que não traduz e não morre, é o único estado que não se
// conserta sozinho.
process.on('uncaughtException', (e) => { console.error('erro não tratado:', e); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error('promessa rejeitada:', e); process.exit(1) })

// O vigia geral: se nada avançou em 3 horas — nem livro, nem volta do laço —,
// algo travou de um jeito que nenhum prazo abaixo previu. Sair é o conserto.
setInterval(() => {
  if (Date.now() - ultimoAvanco > 3 * 60 * MIN) {
    console.error('nada avançou em 3 h; saindo para o Docker religar')
    process.exit(1)
  }
}, 5 * MIN).unref()

async function dormir(ms) {
  const ate = Date.now() + ms
  while (!parar && Date.now() < ate) {
    await new Promise((r) => setTimeout(r, Math.min(5_000, ate - Date.now())))
    pulsar() // batida: é o que mostra "viva" no painel
  }
}

// O que não melhora esperando: fonte que não é livro, endereço que não existe.
const PERMANENTE = /esta fonte não é um livro|a fonte respondeu (404|410)|Isto não é um livro|não existe no banco/

// ─────────────────────────────────────────────────────────────
// As etapas
// ─────────────────────────────────────────────────────────────

/**
 * O tamanho de cada fonte nova, perguntado antes de baixar. Decide a ordem, e
 * por isso mede TODAS antes de escolher: medir só uma parte fazia o primeiro
 * livro sair de uma amostra, e não da fila.
 *
 * O `accept-encoding: identity` é o que faz o Gutenberg dizer o tamanho: o
 * `fetch` do Node pede gzip por padrão, e com gzip o HEAD volta SEM
 * content-length. Sem ele todos empatavam no "tamanho desconhecido" e a ordem
 * virava a de cadastro — foi assim que Moby Dick saiu na frente de contos.
 */
async function medirTamanhos() {
  for (let lote = esteira.semTamanho(banco); lote.length && !parar; lote = esteira.semTamanho(banco)) {
    for (const it of lote) {
      let bytes = 2_000_000_000 // sem resposta: vai para o fim da fila, mas vai
      try {
        const r = await fetch(it.fonte, {
          method: 'HEAD', headers: { 'user-agent': UA, 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(15_000),
        })
        const n = Number(r.headers.get('content-length'))
        if (r.ok && n > 0) bytes = n
      } catch { /* fica no fim */ }
      esteira.guardarTamanho(banco, it.id, bytes)
    }
    avancou()
  }
}

/**
 * O serviço de tradução está de pé? Se o MinT não responde e o DeepL não tem
 * saldo, começar um livro é gastar uma tentativa dele à toa: cada parágrafo
 * falharia, o livro também, e ele iria esperar horas por nada.
 */
async function servicoResponde(de) {
  if (de === 'pt') return true
  try {
    const t = await Promise.race([
      traduzir('Good morning.', { de: 'en', para: 'pt' }),
      new Promise((_, nao) => setTimeout(() => nao(new Error('sem resposta em 30 s')), 30_000).unref()),
    ])
    if (t && t.trim()) return true
  } catch { /* olha o DeepL */ }
  const saldo = await saldoDeepL()
  return !!saldo && saldo.sobra > 50_000
}

/**
 * Traduz um livro com dois vigias: sem avançar por `SEM_SINAL_MIN`, ou passado
 * o teto, o livro é parado (o caderno guarda o que saiu) e volta mais tarde.
 */
async function traduzirComVigia(item, nome) {
  const atual = { obra: item.obra_id, titulo: item.titulo, de: item.idioma, feitas: 0, total: null, minRestantes: null, inicio: new Date().toISOString() }
  pulsar({ estado: 'traduzindo', atual, rodada: pulsoRodada() }, true)
  const controle = new AbortController()
  livroEmCurso = controle
  let sinal = Date.now()
  const vigia = setInterval(() => {
    if (Date.now() - sinal > SEM_SINAL_MIN * MIN) controle.abort(new Error(`travou: sem avançar há ${SEM_SINAL_MIN} min`))
  }, 30_000)
  const teto = setTimeout(() => controle.abort(new Error(`travou: passou de ${TETO_LIVRO_H} h`)), TETO_LIVRO_H * 60 * MIN)
  try {
    return await traduzirLivro({
      fonte: item.fonte, de: item.idioma, titulo: item.titulo, nome, pasta: PASTA, sinal: controle.signal,
      aoDizer: (l) => { if (/^motor:|^\(|ficaram no original/.test(l)) log(`   ${l.slice(0, 160)}`) },
      aoAndar: (feitas, total, minRestantes) => {
        sinal = Date.now()
        avancou()
        pulsar({ atual: { ...atual, feitas, total, minRestantes } })
      },
    })
  } finally {
    clearInterval(vigia)
    clearTimeout(teto)
    livroEmCurso = null
  }
}

// ── o catálogo do site ──
//
// Cada livro pronto entra na hora, sozinho (`publicarObra`, milissegundos). O
// catálogo INTEIRO — que é o que acerta as coleções da home — é refeito na
// partida, quando a fila esvazia e, em trabalho seguido, a cada 6 h.
let catalogoSujo = true          // na partida, uma vez: garante que nada ficou para trás
let ultimoInteiro = 0

function publicarLivro(obraId) {
  if (!SITE_DADOS) return
  try {
    publicarObra(banco, SITE_DADOS, obraId, { jurisdicao: JURISDICAO })
    catalogoSujo = true
  } catch (e) {
    // não perde nada: o catálogo inteiro da próxima vez inclui esta obra
    log(`   ! não publiquei a obra ${obraId} no catálogo (${e.message}); vai no próximo inteiro`)
    catalogoSujo = true
  }
}

function publicarInteiro() {
  if (!SITE_DADOS) {
    if (catalogoSujo) log('sem FIO_SITE_DADOS: o catálogo do site não é publicado daqui')
    catalogoSujo = false
    return
  }
  pulsar({ estado: 'publicando', atual: null }, true)
  const t0 = Date.now()
  try {
    const n = publicarCatalogo(banco, SITE_DADOS, { jurisdicao: JURISDICAO })
    log(n.trocou
      ? `   ↑ catálogo inteiro republicado: ${n.obras} obras, ${n.legiveis} para ler (${Math.round((Date.now() - t0) / 1000)} s)`
      : `   ! catálogo novo com ${n.obras} obras contra ${n.noAr} no ar; não troquei`)
    catalogoSujo = false
    ultimoInteiro = Date.now()
  } catch (e) {
    log(`   ! o catálogo não republicou (${e.message}); tento de novo depois`)
  }
  avancou()
}

async function processar(item) {
  const nome = `obra${item.obra_id}`
  const cabeca = `obra ${item.obra_id} — ${item.titulo}`
  const t0 = Date.now()
  const falha = (erro, etapa = '') => {
    const f = esteira.falhou(banco, item.id, `${etapa}${erro}`, { permanente: PERMANENTE.test(erro) })
    rodada.falhas++
    lembrar({ titulo: item.titulo, min: Math.round((Date.now() - t0) / MIN), palavras: 0, ok: false })
    log(`   FALHOU${etapa ? ` ao ${etapa.replace(/: $/, '')}` : ''}: ${String(erro).slice(0, 140)}`)
    log(f?.estado === 'erro' ? '   → marcado como erro (o painel pode mandar tentar de novo)' : `   → tenta de novo em ${f?.esperaMin} min`)
    pulsar({ atual: null, rodada: pulsoRodada() }, true)
  }

  // Uma tradução pronta que ainda não entrou (o container caiu entre traduzir
  // e instalar, ou veio do PC) é instalada sem traduzir de novo.
  let livro = traducaoPronta(PASTA, nome)
  if (livro) log(`${cabeca}: tradução já pronta, instalando`)
  else {
    log(`${cabeca}\n   de ${item.idioma}, ${item.fonte}${item.tentativas ? ` (tentativa ${item.tentativas + 1})` : ''}`)
    try {
      livro = (await traduzirComVigia(item, nome)).livro
    } catch (e) {
      if (parar) return // parada pedida: o livro volta como estava, sem contar falha
      return falha(e.message)
    }
  }

  pulsar({ estado: 'instalando' }, true)
  try {
    const r = instalarLivro(banco, livro, { obraId: item.obra_id, jurisdicao: JURISDICAO, aoDizer: log })
    esteira.marcarPronto(banco, item.id)
    esteira.reconciliar(banco) // avisa quem pediu
    rodada.feitos++
    lembrar({ titulo: item.titulo, min: Math.round((Date.now() - t0) / MIN), palavras: r.palavras, ok: true })
    log(`   pronto: ${r.capitulos} capítulos, ${r.palavras} palavras, ${r.indexados} na busca, ${Math.round((Date.now() - t0) / MIN)} min`)
    avancou()
  } catch (e) {
    return falha(e.message, 'instalar: ')
  }
  publicarLivro(item.obra_id)
  pulsar({ atual: null, rodada: pulsoRodada() }, true)
}

/**
 * O próximo livro. Pedido de assinante vem antes de tudo; depois, o que já
 * foi começado — tradução pronta esperando instalar, caderno pela metade (o
 * container caiu, ou veio do PC) —, e só então a ordem normal da fila.
 * Terminar o que se começou é o que mantém a pasta dos cadernos pequena.
 */
function escolher() {
  const normal = esteira.proximo(banco)
  if (normal?.prioridade > 0) return normal
  const comecadas = new Map()
  for (const f of readdirSync(PASTA)) {
    const m = f.match(/^obra(\d+)\.(json|caderno\.jsonl)$/)
    if (m) comecadas.set(Number(m[1]), (comecadas.get(Number(m[1])) ?? false) || m[2] === 'json')
  }
  if (!comecadas.size) return normal
  const pega = banco.prepare(`SELECT * FROM fila_traducao WHERE estado = 'na_esteira' AND obra_id = ?
      AND (tentar_depois IS NULL OR tentar_depois <= datetime('now'))`)
  const candidatas = [...comecadas.keys()].map((id) => pega.get(id)).filter(Boolean)
    .sort((a, b) => Number(comecadas.get(b.obra_id)) - Number(comecadas.get(a.obra_id))
      || (a.bytes ?? 9e9) - (b.bytes ?? 9e9))
  return candidatas[0] ?? normal
}

async function volta() {
  const promovidos = esteira.promover(banco)
  if (promovidos) log(`${promovidos} livro(s) novo(s) do painel entraram na fila`)
  esteira.reconciliar(banco)
  avancou()

  if (esteira.pausada(banco)) {
    pulsar({ estado: 'pausada', atual: null })
    return dormir(MIN)
  }

  await medirTamanhos()
  const item = escolher()
  if (!item) {
    if (catalogoSujo) publicarInteiro()
    pulsar({ estado: 'ociosa', atual: null, rodada: pulsoRodada() }, true)
    return dormir(OCIOSA_MIN * MIN)
  }
  if (catalogoSujo && Date.now() - ultimoInteiro > CATALOGO_INTEIRO_H * 60 * MIN) publicarInteiro()

  if (!(await servicoResponde(item.idioma))) {
    log('o serviço de tradução não responde; espero 10 min antes de começar outro livro')
    pulsar({ estado: 'esperando', atual: null }, true)
    return dormir(10 * MIN)
  }
  await processar(item)
}

async function laco() {
  log(`esteira no ar: fila em ${esteira.contagem(banco).faltam} livro(s), cadernos em ${PASTA}`)
  pulsar({ estado: 'medindo', rodada: pulsoRodada() }, true)
  publicarInteiro()
  while (!parar) {
    try {
      await volta()
    } catch (e) {
      // Um erro fora do livro (banco ocupado demais, disco, rede): anota e
      // segue na próxima volta. O laço não termina por nenhum motivo.
      log(`erro na volta: ${e.message}`)
      await dormir(MIN)
    }
  }
}

// ─────────────────────────────────────────────────────────────

const iImportar = process.argv.indexOf('--importar')
if (iImportar > 0) {
  const j = JSON.parse(readFileSync(process.argv[iImportar + 1], 'utf8'))
  const r = esteira.importarPlano(banco, j.plano ?? j.livros ?? j)
  console.log(`entraram ${r.entraram}, já estavam ${r.jaEstavam}, recusados ${r.recusados.length}`)
  for (const x of r.recusados) console.log(`  recusado: ${x.obra ? `obra ${x.obra} ` : ''}${x.titulo} — ${x.porque}`)
  console.log(JSON.stringify(esteira.contagem(banco)))
} else {
  await laco()
  process.exit(0)
}
