// A modernizadora (08/10/2026): serviço da VPS que leva o acervo, aos poucos,
// para o português de 2026 — sem gastar crédito, sem encher a memória e sem
// tomar a máquina.
//
// Uma volta (a cada dia; a primeira, 10 minutos depois de subir):
//   1. conta as palavras do acervo      ortografia.mjs exportar   (palavras.tsv)
//   2. conta as dos escaneados          ocr-lista.mjs exportar    (digitado/so-no-scan)
//   3. grafia: palavra velha que só existe em livro antigo e tem forma de hoje
//      bem usada no texto moderno       modernizar-grafia.mjs
//   4. scan: s longo, hífen de fim de linha, til/ff/est/col  ocr-longo-s/hifen/classes
//   5. PORTÃO: as listas novas passam num teste antes de valer (abaixo)
//   6. troca as listas em /dados/mapas (a anterior fica como .anterior.json);
//      o servidor relê sozinho, em até 1 minuto
//   7. refaz a medida de qualidade (qualidade.json) e escreve o estado.json
// Não mexe no banco: as listas valem NA ENTREGA, como as lidas à mão; desfazer
// é voltar o .anterior.json ou desligar o ajuste `modernizadora`.
//
// Contra gastar a máquina: o compose dá 0,25 núcleo e 768 MB; cada passo roda
// como processo filho com teto de heap e só começa com a máquina folgada
// (carga de 1 minuto abaixo de 1,0); entre passos, uma pausa.
//
// O PORTÃO: o que sai do gerador não vale por si. Antes de trocar:
//   - nenhuma chave pode estar nas listas lidas, nem ser igual ao valor;
//   - a lista não pode encolher mais de 30% nem crescer mais de 3x (as duas
//     coisas dizem que a entrada mudou, não o acervo);
//   - aplicada em 300 capítulos de livros antigos, não pode mudar mais de 4%
//     das palavras, e o número de palavras do capítulo tem de ficar o mesmo.
// Reprovou: ficam as listas de antes e o motivo vai para o estado.json.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadavg } from 'node:os'
import { abrir } from './banco/base.mjs'
import * as ajustes from './ajustes.mjs'

const MAPAS = process.env.FIO_MAPAS || '/dados/mapas'
const ORTO = process.env.FIO_ORTOGRAFIA || '/dados/ortografia'
const OCR = process.env.FIO_OCR || '/dados/ocr'
const A_CADA = Number(process.env.FIO_MODERNIZAR_DIAS || 1) * 24 * 3600_000
const MIN = 60_000
const raiz = new URL('..', import.meta.url).pathname
const banco = abrir()
banco.exec('PRAGMA busy_timeout = 30000')
for (const p of [MAPAS, ORTO, OCR]) mkdirSync(p, { recursive: true })

const log = (...a) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${a.join(' ')}`)
let parar = false
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { parar = true; log(s + ': parando'); setTimeout(() => process.exit(0), 5000).unref() })
const dormir = async (ms) => { const ate = Date.now() + ms; while (!parar && Date.now() < ate) await new Promise((r) => setTimeout(r, Math.min(5000, ate - Date.now()))) }
const folgada = () => loadavg()[0] < Number(process.env.FIO_MODERNIZAR_CARGA || 1.0)
async function esperarFolga() { while (!parar && !folgada()) { log(`máquina ocupada (carga ${loadavg()[0].toFixed(2)}); espero 2 min`); await dormir(2 * MIN) } }

function rodar(script, args = [], heap = 600) {
  return new Promise((resolve, reject) => {
    const saida = []
    const f = spawn(process.execPath, [`--max-old-space-size=${heap}`, join(raiz, script), ...args], { env: process.env })
    const guarda = (d) => { saida.push(String(d)); if (saida.length > 50) saida.shift() }
    f.stdout.on('data', guarda)
    f.stderr.on('data', guarda)
    f.on('close', (c) => (c === 0 ? resolve(saida.join('')) : reject(new Error(`${script} saiu com ${c}: ${saida.join('').slice(-300)}`))))
  })
}
const json = (c, padrao = {}) => { try { return JSON.parse(readFileSync(c, 'utf8')) } catch { return padrao } }
const estadoCaminho = join(MAPAS, 'estado.json')
const estado = () => json(estadoCaminho, {})
const gravarEstado = (e) => writeFileSync(estadoCaminho, JSON.stringify(e))

// ── o portão ──
function portao(novo, atual, lidas) {
  const chaves = Object.keys(novo)
  if (!chaves.length) return 'lista vazia'
  for (const [a, b] of Object.entries(novo)) {
    if (a === b) return `${a} troca por ela mesma`
    if (lidas.has(a)) return `${a} já está nas listas lidas`
  }
  const antes = Object.keys(atual).length
  if (antes >= 200 && chaves.length < antes * 0.7) return `encolheu de ${antes} para ${chaves.length}`
  if (antes >= 200 && chaves.length > antes * 3) return `cresceu de ${antes} para ${chaves.length}`
  return null
}

async function testeDeCapitulos(grafia, ocr) {
  // as duas listas novas, vistas pela mesma função que o leitor usa
  const tmp = join(MAPAS, '.teste')
  mkdirSync(tmp, { recursive: true })
  writeFileSync(join(tmp, 'grafia-auto.json'), JSON.stringify(grafia))
  writeFileSync(join(tmp, 'ocr-auto.json'), JSON.stringify(ocr))
  // a linha de base é a entrega SEM as listas automáticas: o teste mede só o que elas mudam
  const vazio = join(MAPAS, '.vazio')
  mkdirSync(vazio, { recursive: true })
  process.env.FIO_MAPAS = vazio
  const { atualizarGrafia: base } = await import('./ortografia.mjs?base=' + Date.now())
  process.env.FIO_MAPAS = tmp
  const { atualizarGrafia } = await import('./ortografia.mjs?teste=' + Date.now())
  const textos = banco.prepare(`SELECT id, fonte FROM texto WHERE dono_id IS NULL AND idioma = 'pt'
    AND fonte IN ('gutenberg','wikisource','archive') ORDER BY (id * 7919) % 1009 LIMIT 150`).all()
  const pega = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem LIMIT 1 OFFSET ?')
  const palavras = (h) => h.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean)
  let total = 0, mudou = 0, caps = 0
  try {
    for (const t of textos) {
      for (const off of [0, 3]) {
        const c = pega.get(t.id, off)
        if (!c) continue
        const opc = { ocr: t.fonte === 'archive' }
        const a = palavras(base(c.corpo, opc)), b = palavras(atualizarGrafia(c.corpo, opc))
        if (a.length !== b.length) return `capítulo de ${t.id} mudou de ${a.length} para ${b.length} palavras`
        total += a.length; caps++
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mudou++
      }
    }
  } finally { process.env.FIO_MAPAS = MAPAS }
  const taxa = total ? mudou / total : 0
  log(`   teste: ${caps} capítulos, ${total} palavras, ${(taxa * 100).toFixed(2)}% mudaram`)
  return taxa > 0.04 ? `o teste mudou ${(taxa * 100).toFixed(1)}% das palavras (teto 4%)` : null
}

function trocar(nome, novo) {
  const alvo = join(MAPAS, nome)
  if (existsSync(alvo)) copyFileSync(alvo, alvo.replace(/\.json$/, '.anterior.json'))
  writeFileSync(alvo + '.novo', JSON.stringify(novo))
  renameSync(alvo + '.novo', alvo)
}

async function volta() {
  const t0 = Date.now()
  gravarEstado({ ...estado(), comecou: new Date().toISOString(), situacao: 'rodando' })
  const passo = async (nome, script, args, heap) => {
    await esperarFolga()
    if (parar) throw new Error('parada')
    log(`→ ${nome}`)
    await rodar(script, args, heap)
    await dormir(20_000)
  }
  await passo('contar as palavras do acervo', 'ingestao/ortografia.mjs', ['exportar', ORTO], 700)
  await passo('contar as palavras dos escaneados', 'ingestao/ocr-lista.mjs', ['exportar', OCR], 700)
  await passo('grafia de 2026', 'ingestao/modernizar-grafia.mjs', [ORTO, join(MAPAS, '.grafia-novo.json')], 600)
  await passo('s longo dos escaneados', 'ingestao/ocr-longo-s.mjs', [OCR], 500)
  await passo('hífen de fim de linha', 'ingestao/ocr-hifen.mjs', [OCR], 500)
  await passo('til, ff, est e col', 'ingestao/ocr-classes.mjs', [OCR], 500)

  const grafia = json(join(MAPAS, '.grafia-novo.json'))
  const ocr = {}
  for (const f of ['longo-s.tsv', 'hifen.tsv', 'classes.tsv']) {
    const c = join(OCR, f)
    if (existsSync(c)) for (const l of readFileSync(c, 'utf8').split('\n')) { const [a, b] = l.split('\t'); if (a && b) ocr[a] = b }
  }
  const antesG = json(join(MAPAS, 'grafia-auto.json')), antesO = json(join(MAPAS, 'ocr-auto.json'))
  const lidasG = new Set(Object.keys(json(join(raiz, 'servidor/ortografia-atualizada.json'), { trocas: {} }).trocas))
  const lidasO = new Set(Object.keys(json(join(raiz, 'servidor/ocr-correcoes.json'))))
  const motivos = []
  const mg = portao(grafia, antesG, lidasG)
  const mo = portao(ocr, antesO, lidasO)
  if (mg) motivos.push('grafia: ' + mg)
  if (mo) motivos.push('ocr: ' + mo)
  if (!motivos.length) { const m = await testeDeCapitulos(grafia, ocr); if (m) motivos.push(m) }

  const novas = { grafia: Object.keys(grafia).filter((k) => !(k in antesG)).length, ocr: Object.keys(ocr).filter((k) => !(k in antesO)).length }
  if (motivos.length) {
    log('✋ portão reprovou: ' + motivos.join('; ') + ' — ficam as listas de antes')
  } else {
    trocar('grafia-auto.json', grafia)
    trocar('ocr-auto.json', ocr)
    log(`✓ listas trocadas: grafia ${Object.keys(grafia).length} (+${novas.grafia}), scan ${Object.keys(ocr).length} (+${novas.ocr})`)
  }
  await passo('medir a qualidade do acervo', 'ingestao/qualidade-acervo.mjs', [], 700)
  const por = {}
  for (const v of Object.values(json('/dados/qualidade.json', { obras: {} }).obras)) por[v[0]] = (por[v[0]] ?? 0) + 1
  gravarEstado({
    situacao: motivos.length ? 'portão reprovou' : 'em dia', motivos, quando: new Date().toISOString(),
    minutos: Math.round((Date.now() - t0) / MIN),
    grafia: Object.keys(motivos.length ? antesG : grafia).length, ocr: Object.keys(motivos.length ? antesO : ocr).length,
    novas: motivos.length ? { grafia: 0, ocr: 0 } : novas, obras: por,
    estavel: !motivos.length && novas.grafia === 0 && novas.ocr === 0,
  })
}

log('modernizadora de pé')
while (!parar) {
  if ((ajustes.ler(banco, 'modernizadora') ?? 'ligada') !== 'ligada') { await dormir(MIN); continue }
  const ultimo = estado().quando ? Date.parse(estado().quando) || 0 : 0
  if (Date.now() - ultimo < A_CADA) { await dormir(30 * MIN); continue }
  if (!ultimo) { log('primeira volta em 10 min'); await dormir(10 * MIN); if (parar) break }
  try { await volta() } catch (err) {
    log('! volta interrompida: ' + err.message)
    gravarEstado({ ...estado(), situacao: 'interrompida', motivos: [String(err.message).slice(0, 300)], quando: new Date().toISOString() })
    await dormir(6 * 3600_000)
  }
}
