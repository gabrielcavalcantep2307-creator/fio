// A esteira dos quadrinhos: lê o texto dos balões, traduz e grava onde cada
// balão está — para o leitor pôr a tradução por cima do original.
//
//   node ingestao/quadrinhos-ocr.mjs --serie little-nemo --de en \
//        --paginas dados/quadrinhos-ocr/little-nemo/paginas.tsv \
//        [--motor google|windows] [--limite 20]
//
// `paginas.tsv`: uma linha por página, `caminho-no-site<TAB>arquivo-local`.
// Saída: `web/public/dados/quadrinhos-traducao/<serie>.json`, que o leitor
// (leitor-quadrinho.js) carrega quando a série tem `traducao`.
//
// ─────────────────────────────────────────────────────────────
// OS MOTORES DE OCR
//
//   google   Google Cloud Vision (DOCUMENT_TEXT_DETECTION). Lê bem letra de
//            quadrinho desenhada à mão e devolve cada balão como um bloco com
//            caixa. Precisa de chave: GOOGLE_VISION_CHAVE ou o arquivo
//            dados/.chave-google-vision (fora do git). 1.000 imagens por mês
//            de graça. Só manda imagem de obra em domínio público ou livre.
//   windows  O OCR que vem no Windows (ingestao/ocr-windows.ps1). Grátis e
//            local, mas em letra desenhada à mão perde boa parte dos balões:
//            serve para quadrinho com letra tipográfica.
//
// Retomável: página que já está no arquivo de saída não é lida de novo.
// Cada bloco guarda o texto original, a tradução e a confiança do OCR; bloco
// de confiança baixa entra marcado (`duvida`) para revisão.
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { traduzir } from './motor-traducao.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }

const serie = arg('serie')
const de = arg('de', 'en')
const motor = arg('motor', 'google')
const limite = Number(arg('limite', 100000))
const listaArq = arg('paginas')
if (!serie || !listaArq) { console.error('uso: --serie <id> --paginas <tsv> [--de en] [--motor google|windows]'); process.exit(2) }

const SAIDA = join(RAIZ, 'web', 'public', 'dados', 'quadrinhos-traducao', `${serie}.json`)
mkdirSync(dirname(SAIDA), { recursive: true })
const dados = existsSync(SAIDA) ? JSON.parse(readFileSync(SAIDA, 'utf8')) : { serie, de, paginas: {} }

// Nomes que não se traduzem nem se põem em minúscula.
const NOMES = ['Nemo', 'Somnus', 'Morpheus', 'Slumberland', 'Oomp', 'Pokoko', 'Flip', 'Impie', 'Dr. Pill', 'Moontown', 'Candy Island', 'Princess', 'King']

// ── motores ──

function chaveGoogle() {
  const arquivo = join(RAIZ, 'dados', '.chave-google-vision')
  return process.env.GOOGLE_VISION_CHAVE || (existsSync(arquivo) ? readFileSync(arquivo, 'utf8').trim() : '')
}

async function ocrGoogle(arquivo) {
  const chave = chaveGoogle()
  if (!chave) throw new Error('sem chave do Google Vision (GOOGLE_VISION_CHAVE ou dados/.chave-google-vision)')
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(chave)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ requests: [{
      image: { content: readFileSync(arquivo).toString('base64') },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: [de] },
    }] }),
  })
  const j = await r.json()
  const resp = j.responses?.[0]
  if (!r.ok || resp?.error) throw new Error(`Google Vision: ${resp?.error?.message ?? j.error?.message ?? r.status}`)
  const pagina = resp.fullTextAnnotation?.pages?.[0]
  if (!pagina) return { largura: 1, altura: 1, blocos: [] }
  const blocos = []
  for (const b of pagina.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      const linhas = []
      let linha = ''
      for (const w of p.words ?? []) {
        for (const s of w.symbols ?? []) {
          linha += s.text
          const quebra = s.property?.detectedBreak?.type
          if (quebra === 'SPACE' || quebra === 'SURE_SPACE') linha += ' '
          else if (quebra === 'EOL_SURE_SPACE' || quebra === 'LINE_BREAK') { linhas.push(linha); linha = '' }
          else if (quebra === 'HYPHEN') { linha += '-'; linhas.push(linha); linha = '' }
        }
      }
      if (linha.trim()) linhas.push(linha)
      const v = p.boundingBox?.vertices ?? []
      const xs = v.map((q) => q.x ?? 0), ys = v.map((q) => q.y ?? 0)
      blocos.push({ linhas, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), confianca: p.confidence ?? null })
    }
  }
  return { largura: pagina.width, altura: pagina.height, blocos: juntarVizinhos(blocos) }
}

function ocrWindows(arquivo) {
  const saida = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(RAIZ, 'ingestao', 'ocr-windows.ps1'),
    '-Imagem', arquivo, '-Idioma', 'pt-BR', '-Escala', '2'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const j = JSON.parse(saida.slice(saida.indexOf('{')))
  return { largura: j.largura, altura: j.altura, blocos: juntarVizinhos(j.linhas.map((l) => ({ linhas: [l.texto], x: l.x, y: l.y, w: l.w, h: l.h, confianca: null }))) }
}

/**
 * Junta pedaços que são do mesmo balão: um logo abaixo do outro, com as
 * caixas se sobrepondo na horizontal. O Vision já agrupa quase sempre; o OCR
 * de linha do Windows precisa disto sempre.
 */
function juntarVizinhos(blocos) {
  const b = blocos.filter((x) => x.linhas.join('').trim()).sort((p, q) => p.y - q.y)
  let mudou = true
  while (mudou) {
    mudou = false
    for (let i = 0; i < b.length && !mudou; i++) {
      for (let k = i + 1; k < b.length; k++) {
        const a = b[i], c = b[k]
        const alturaLinha = Math.max(8, Math.min(a.h / Math.max(1, a.linhas.length), c.h / Math.max(1, c.linhas.length)))
        const vao = c.y - (a.y + a.h)
        const sobrepoe = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0.3 * Math.min(a.w, c.w)
        if (vao < alturaLinha * 0.9 && vao > -alturaLinha && sobrepoe) {
          const x = Math.min(a.x, c.x), y = Math.min(a.y, c.y)
          b[i] = { linhas: [...a.linhas, ...c.linhas], x, y, w: Math.max(a.x + a.w, c.x + c.w) - x, h: Math.max(a.y + a.h, c.y + c.h) - y,
            confianca: a.confianca != null && c.confianca != null ? Math.min(a.confianca, c.confianca) : null }
          b.splice(k, 1)
          mudou = true
          break
        }
      }
    }
  }
  return b
}

// ── o texto: de caixa alta de jornal de 1905 para frase normal ──

function limparTexto(linhas) {
  let t = linhas.map((l) => l.trim()).join('\n')
  t = t.replace(/(\w)-\n(\w)/g, '$1$2')        // palavra partida no fim da linha
  t = t.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()
  const letras = t.replace(/[^A-Za-z]/g, '')
  if (letras && letras === letras.toUpperCase()) {
    t = t.toLowerCase().replace(/(^|[.!?]\s+|["“]\s*)([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bi\b/g, 'I')
    for (const n of NOMES) t = t.replace(new RegExp(`\\b${n}\\b`, 'gi'), n)
  }
  return t
}

// Legenda numerada de rodapé ("1 LITTLE NEMO HAD…") e ruído de OCR.
const eRuido = (t) => t.replace(/[^A-Za-zÀ-ú]/g, '').length < 2 || /copyright|herald co|winsor mc\s?cay/i.test(t)

// ── a volta ──

const pct = (v, total) => Math.round((v / total) * 10000) / 100
const lista = readFileSync(listaArq, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'))
let feitas = 0
for (const [caminho, arquivo] of lista) {
  if (dados.paginas[caminho]) continue
  if (feitas >= limite) break
  const t0 = Date.now()
  const lido = motor === 'windows' ? ocrWindows(arquivo) : await ocrGoogle(arquivo)
  const blocos = []
  for (const b of lido.blocos) {
    const original = limparTexto(b.linhas)
    if (eRuido(original)) continue
    let traducao
    try { traducao = await traduzir(original, { de, para: 'pt' }) } catch (e) { traducao = null; console.log(`   ! não traduziu: ${e.message}`) }
    blocos.push({
      x: pct(b.x, lido.largura), y: pct(b.y, lido.altura), w: pct(b.w, lido.largura), h: pct(b.h, lido.altura),
      o: original, t: traducao, ...(b.confianca != null && b.confianca < 0.7 ? { duvida: true } : {}),
    })
  }
  dados.paginas[caminho] = { motor, blocos }
  dados.atualizadoEm = new Date().toISOString()
  writeFileSync(SAIDA, JSON.stringify(dados))
  feitas++
  console.log(`${caminho}: ${blocos.length} balões em ${Math.round((Date.now() - t0) / 1000)} s`)
}
console.log(`\n${feitas} páginas lidas agora; ${Object.keys(dados.paginas).length} no total em ${SAIDA}`)
