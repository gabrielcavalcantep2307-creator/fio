// O trabalhador da esteira: traduz a fila para sempre, sozinho, na VPS.
//
//   node servidor/esteira-trabalhador.mjs                     # o laço eterno
//   node servidor/esteira-trabalhador.mjs --importar plano.json  # traz um esteira.json antigo para a fila
//
// Roda num container PRÓPRIO (serviço `esteira` do docker-compose), da mesma
// imagem da API e no mesmo banco. É um processo à parte, e não uma rota dentro
// da API, por três razões:
//
//   1. `node:sqlite` é síncrono. Instalar um livro de 400 mil palavras e
//      republicar o catálogo são dezenas de segundos de CPU; dentro da API,
//      seriam dezenas de segundos em que o site não responde a ninguém.
//   2. Memória. A API vive em 320 MB e é o que o leitor vê. Um livro grande
//      estourando a memória tem que derrubar a esteira, não o site.
//   3. Morrer e voltar. O Docker religa este container sozinho
//      (`restart: unless-stopped`), e tudo aqui é refazível: o caderno de cada
//      livro guarda cada parágrafo já traduzido, e a fila no banco guarda o
//      que falta. Cair no meio de um livro custa só o parágrafo em voo.
//
// ─────────────────────────────────────────────────────────────
// A VOLTA
//
//   1. promove o que o painel e os assinantes pediram ('espera' → obra);
//   2. se pausada no painel, espera;
//   3. mede o tamanho das fontes novas (um HEAD, para a ordem menor→maior);
//   4. pega o próximo livro; se não há, publica o que faltar e dorme;
//   5. traduz (ingestao/traduzir-obra.mjs, num processo filho — o mesmo de
//      sempre, com o caderno e o freio que já provaram funcionar);
//   6. instala no banco, põe na busca (só aquele livro) e marca pronto;
//   7. republica o catálogo estático do site, para ele aparecer na vitrine.
//
// E o pulso: o estado vai direto para a tabela `esteira_pulso` a cada ~20 s,
// e o painel mostra ao vivo, como mostrava a esteira do PC.
// ─────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrir } from './banco/base.mjs'
import * as esteira from './esteira.mjs'
import { indexarTexto, indexarObra } from './reindexar.mjs'
import { instalarTraducao } from '../ingestao/instalar-traducao.mjs'
import { traduzir, saldoDeepL } from '../ingestao/motor-traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = process.env.FIO_TRADUCOES || join(RAIZ, 'dados', 'traducoes')
// A pasta `dados/` do site (catalogo.json e fichas/). Sem ela o livro entra no
// banco e na busca, mas não na vitrine — e o trabalhador avisa no log.
const SITE_DADOS = process.env.FIO_SITE_DADOS || null
const JURISDICAO = process.env.FIO_JURISDICAO || 'BR'
const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.com.br)'

const MIN = 60_000
const OCIOSA_MIN = Number(process.env.FIO_ESTEIRA_OCIOSA_MIN || 5)   // fila vazia: olha de novo a cada 5 min
const SEM_SINAL_MIN = Number(process.env.FIO_ESTEIRA_SEM_SINAL_MIN || 60) // livro sem avançar 1 h: travou
const TETO_LIVRO_H = 36                                                // nenhum livro leva mais que isso
const PUBLICAR_TETO_MIN = 15

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
    esteira.receberPulso(banco, { ...pulso, enviado: new Date().toISOString() })
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
// Parar direito, e o vigia
// ─────────────────────────────────────────────────────────────

let parar = false
let filho = null
let ultimoAvanco = Date.now()
const avancou = () => { ultimoAvanco = Date.now() }

// O `docker stop` manda SIGTERM. O livro em curso para onde está — o caderno
// já guardou cada parágrafo — e o próximo começo continua dali.
function encerrar(sinal) {
  if (parar) return
  parar = true
  log(`${sinal}: parando (o caderno guarda o que já saiu)`)
  if (filho) filho.kill('SIGTERM')
  try { pulsar({ estado: 'parada', atual: null }, true) } catch {}
  setTimeout(() => process.exit(0), 5_000).unref()
}
process.on('SIGTERM', () => encerrar('SIGTERM'))
process.on('SIGINT', () => encerrar('SIGINT'))

// Qualquer coisa que escape vira saída com erro — e o Docker religa. Um
// processo meio-vivo, que não traduz e não morre, é o único estado que não se
// conserta sozinho.
process.on('uncaughtException', (e) => { console.error('erro não tratado:', e); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error('promessa rejeitada:', e); process.exit(1) })

// O vigia: se nada avançou em 3 horas — nem livro, nem volta do laço —, algo
// travou de um jeito que nenhum prazo abaixo previu. Sair é o conserto.
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

// ─────────────────────────────────────────────────────────────
// Um processo filho, sem deixar ninguém sem saída
//
// O `error` não é zelo: um filho que não consegue nem nascer emite `error` e
// nunca `close`, e `error` sem ouvinte derruba o processo inteiro (foi o que
// levou a esteira do PC em 14/09/2026).
// ─────────────────────────────────────────────────────────────

function rodar(args, { aoFalar, semSinalMs, tetoMs } = {}) {
  return new Promise((pronto) => {
    const p = spawn(process.execPath, args, {
      cwd: RAIZ, env: { ...process.env, FIO_TRADUCOES: PASTA }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    filho = p
    let saida = ''
    let sinal = Date.now()
    let motivo = null
    const guardar = (d) => { saida = (saida + d).slice(-20_000) }
    p.stdout.on('data', (d) => { guardar(d); sinal = Date.now(); aoFalar?.(String(d)) })
    p.stderr.on('data', guardar)
    const matar = (porque) => {
      motivo = porque
      p.kill('SIGTERM')
      setTimeout(() => { try { p.kill('SIGKILL') } catch {} }, 10_000).unref()
    }
    const relogio = setInterval(() => {
      if (semSinalMs && Date.now() - sinal > semSinalMs) matar(`sem avançar há ${Math.round(semSinalMs / MIN)} min`)
    }, 30_000)
    const teto = tetoMs ? setTimeout(() => matar(`passou de ${Math.round(tetoMs / MIN)} min`), tetoMs) : null
    const fim = (codigo, extra = '') => {
      clearInterval(relogio); if (teto) clearTimeout(teto)
      filho = null
      pronto({ codigo, saida: saida + extra, motivo })
    }
    p.on('error', (e) => fim(-1, `\nErro: não deu para rodar o node: ${e.message}`))
    p.on('close', (codigo) => fim(codigo ?? -1))
  })
}

/** A primeira linha que parece erro — a última, num processo morto, é "Node.js v22". */
function primeiroErro(saida) {
  const linhas = saida.split('\n').map((l) => l.trim()).filter(Boolean)
  return linhas.find((l) => /^\w*Error\b|^Erro\b|palavras — esta fonte|não deu para baixar|parágrafos não traduziram/.test(l))
    ?? linhas.filter((l) => !/^Node\.js v|^at |ExperimentalWarning|--trace-warnings/.test(l)).at(-1)
    ?? 'sem mensagem'
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
    for (const it of lote) await medirUm(it)
    avancou()
  }
}

async function medirUm(it) {
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
      new Promise((_, nao) => setTimeout(() => nao(new Error('sem resposta em 30 s')), 30_000)),
    ])
    if (t && t.trim()) return true
  } catch { /* olha o DeepL */ }
  const saldo = await saldoDeepL()
  return !!saldo && saldo.sobra > 50_000
}

async function traduzirLivro(item, saida) {
  const atual = { obra: item.obra_id, titulo: item.titulo, de: item.idioma, feitas: 0, total: null, minRestantes: null, inicio: new Date().toISOString() }
  pulsar({ estado: 'traduzindo', atual, rodada: pulsoRodada() }, true)
  const t0 = Date.now()
  const r = await rodar([
    join(RAIZ, 'ingestao', 'traduzir-obra.mjs'),
    '--fonte', item.fonte, '--de', item.idioma, '--titulo', item.titulo, '--saida', saida,
  ], {
    semSinalMs: SEM_SINAL_MIN * MIN,
    tetoMs: TETO_LIVRO_H * 60 * MIN,
    aoFalar: (pedaco) => {
      // "  120/860  ~14 min restantes" — a última que apareceu neste pedaço
      const m = [...pedaco.matchAll(/(\d+)\/(\d+)\s+~(\d+) min/g)].at(-1)
      if (m) {
        avancou()
        pulsar({ atual: { ...atual, feitas: Number(m[1]), total: Number(m[2]), minRestantes: Number(m[3]) } })
      }
      const motor = pedaco.match(/motor: ([^\n]+)/)
      if (motor) log(`   motor: ${motor[1].trim().slice(0, 150)}`)
    },
  })
  const min = Math.round((Date.now() - t0) / MIN)
  if (r.codigo === 0 && existsSync(join(PASTA, `${saida}.json`))) return { ok: true, min }
  return { ok: false, min, erro: r.motivo ? `travou: ${r.motivo}` : primeiroErro(r.saida) }
}

/** O ano de morte que vai para a linha de direito: o do autor mais recente. */
const morteDe = (obraId) => banco.prepare(`
  SELECT MAX(p.morte) morte FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
   WHERE op.obra_id = ? AND op.papel = 'autor'`).get(obraId)?.morte ?? 0

function instalar(item, saida) {
  const t = JSON.parse(readFileSync(join(PASTA, `${saida}.json`), 'utf8'))
  const r = instalarTraducao(banco, t, { obraId: item.obra_id, morte: morteDe(item.obra_id), jurisdicao: JURISDICAO, aoDizer: log })
  const caps = indexarTexto(banco, r.textoId)
  indexarObra(banco, item.obra_id)
  // Devolve o espaço do WAL aos poucos, sem travar ninguém (PASSIVE não espera).
  try { banco.exec('PRAGMA wal_checkpoint(PASSIVE)') } catch {}
  return { ...r, indexados: caps }
}

/**
 * Reescreve `catalogo.json` e `fichas/` do site a partir do banco.
 *
 * `publicar.mjs` roda num processo filho (130 MB e ~30 s, que não precisam
 * morar aqui) e escreve numa pasta ao lado; a troca é por `rename`, no mesmo
 * disco, para o site nunca servir um catálogo pela metade.
 */
let precisaPublicar = true // na partida, uma vez: garante que nada ficou para trás
async function publicarCatalogo() {
  if (!SITE_DADOS) {
    if (precisaPublicar) log('sem FIO_SITE_DADOS: o catálogo do site não é republicado daqui')
    precisaPublicar = false
    return true
  }
  pulsar({ estado: 'publicando', atual: null }, true)
  const t0 = Date.now()
  const novo = join(SITE_DADOS, '.esteira-novo')
  rmSync(novo, { recursive: true, force: true })
  const r = await rodar([join(RAIZ, 'ingestao', 'publicar.mjs'), '--saida', novo], { tetoMs: PUBLICAR_TETO_MIN * MIN })
  const cat = join(novo, 'catalogo.json')
  if (r.codigo !== 0 || !existsSync(cat) || !existsSync(join(novo, 'fichas'))) {
    log(`   ! o catálogo não republicou (${r.motivo ?? primeiroErro(r.saida)}); tento de novo depois`)
    rmSync(novo, { recursive: true, force: true })
    return false
  }
  // Trava do catálogo encolhido: um banco que respondeu pela metade não pode
  // apagar metade do site. Se o novo tem bem menos obras que o atual, fica o atual.
  try {
    const obras = (f) => JSON.parse(readFileSync(f, 'utf8')).obras?.length ?? 0
    const atual = existsSync(join(SITE_DADOS, 'catalogo.json')) ? obras(join(SITE_DADOS, 'catalogo.json')) : 0
    const nova = obras(cat)
    if (nova < atual * 0.9) {
      log(`   ! catálogo novo com ${nova} obras contra ${atual} no ar; não troco`)
      rmSync(novo, { recursive: true, force: true })
      precisaPublicar = false
      return false
    }
  } catch (e) { log(`   ! catálogo novo ilegível (${e.message})`); rmSync(novo, { recursive: true, force: true }); return false }

  const velhas = join(SITE_DADOS, '.fichas-velhas')
  rmSync(velhas, { recursive: true, force: true })
  if (existsSync(join(SITE_DADOS, 'fichas'))) renameSync(join(SITE_DADOS, 'fichas'), velhas)
  renameSync(join(novo, 'fichas'), join(SITE_DADOS, 'fichas'))
  renameSync(cat, join(SITE_DADOS, 'catalogo.json'))
  rmSync(velhas, { recursive: true, force: true })
  rmSync(novo, { recursive: true, force: true })
  precisaPublicar = false
  log(`   ↑ catálogo do site republicado (${Math.round((Date.now() - t0) / 1000)} s)`)
  return true
}

async function processar(item) {
  const saida = `obra${item.obra_id}`
  const cabeca = `obra ${item.obra_id} — ${item.titulo}`
  const t0 = Date.now()

  // Uma tradução pronta que ainda não entrou (o container caiu entre traduzir
  // e instalar, ou veio do PC) é instalada sem traduzir de novo.
  if (!existsSync(join(PASTA, `${saida}.json`))) {
    log(`${cabeca}\n   de ${item.idioma}, ${item.fonte}${item.tentativas ? ` (tentativa ${item.tentativas + 1})` : ''}`)
    const t = await traduzirLivro(item, saida)
    if (parar) return
    if (!t.ok) {
      const f = esteira.falhou(banco, item.id, t.erro, { permanente: PERMANENTE.test(t.erro) })
      rodada.falhas++
      lembrar({ titulo: item.titulo, min: t.min, palavras: 0, ok: false })
      log(`   FALHOU (${t.min} min): ${t.erro.slice(0, 140)}`)
      log(f?.estado === 'erro' ? '   → marcado como erro (o painel pode mandar tentar de novo)' : `   → tenta de novo em ${f?.esperaMin} min`)
      pulsar({ atual: null, rodada: pulsoRodada() }, true)
      return
    }
  } else {
    log(`${cabeca}: tradução já pronta, instalando`)
  }

  pulsar({ estado: 'instalando' }, true)
  try {
    const r = instalar(item, saida)
    esteira.marcarPronto(banco, item.id)
    esteira.reconciliar(banco) // avisa quem pediu
    rodada.feitos++
    lembrar({ titulo: item.titulo, min: Math.round((Date.now() - t0) / MIN), palavras: r.palavras, ok: true })
    log(`   pronto: ${r.capitulos} capítulos, ${r.palavras} palavras, ${r.indexados} na busca`)
    precisaPublicar = true
    avancou()
  } catch (e) {
    const f = esteira.falhou(banco, item.id, `instalar: ${e.message}`, { permanente: PERMANENTE.test(e.message) })
    rodada.falhas++
    lembrar({ titulo: item.titulo, min: 0, palavras: 0, ok: false })
    log(`   FALHOU ao instalar: ${e.message.slice(0, 140)} → ${f?.estado === 'erro' ? 'erro' : `de novo em ${f?.esperaMin} min`}`)
  }
  pulsar({ atual: null, rodada: pulsoRodada() }, true)
  if (precisaPublicar) await publicarCatalogo()
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
    if (precisaPublicar) await publicarCatalogo()
    pulsar({ estado: 'ociosa', atual: null, rodada: pulsoRodada() }, true)
    return dormir(OCIOSA_MIN * MIN)
  }

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
  if (precisaPublicar) await publicarCatalogo()
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
  const arquivo = process.argv[iImportar + 1]
  const j = JSON.parse(readFileSync(arquivo, 'utf8'))
  const r = esteira.importarPlano(banco, j.plano ?? j)
  console.log(`entraram ${r.entraram}, já estavam ${r.jaEstavam}, recusados ${r.recusados.length}`)
  for (const x of r.recusados) console.log(`  recusado: obra ${x.obra} ${x.titulo} — ${x.porque}`)
  console.log(JSON.stringify(esteira.contagem(banco)))
} else {
  await laco()
  process.exit(0)
}
