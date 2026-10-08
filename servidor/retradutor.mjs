// O trabalhador da retradução (06/10/2026): serviço `retradutora` do compose.
//
// Pega o próximo livro (servidor/retraducao.mjs: do inglês, dos mais lidos
// para os menos), traduz de novo pelo tradutor local, passa no PORTÃO e só
// então troca no site. Segurado, o site fica como estava. Um livro por vez.
//
// Liga e desliga pelo ajuste `retradutora` (parada | ligada), no painel. Nasce
// PARADA: quem liga sou eu, depois de olhar os primeiros livros.
//
//   node servidor/retradutor.mjs                 o serviço
//   node servidor/retradutor.mjs --so 5055,5048  só estes textos, agora, e sai
//                                                (o piloto: roda mesmo parada)

import { mkdirSync, appendFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { abrir } from './banco/base.mjs'
import * as ajustes from './ajustes.mjs'
import * as re from './retraducao.mjs'
import { traduzirLivro } from './servicos/traducao.mjs'
import { localDisponivel } from './servicos/tradutor-local.mjs'

const PASTA = process.env.FIO_RETRADUCAO || '/dados/retraducao'
const MIN = 60_000
const banco = abrir()
banco.exec('PRAGMA busy_timeout = 30000')
re.garantirTabelas(banco)
mkdirSync(PASTA, { recursive: true })

const log = (...a) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${a.join(' ')}`)
let parar = false
let emCurso = null
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => {
  parar = true
  log(`${s}: parando (o caderno guarda o que já saiu)`)
  emCurso?.abort(new Error('parada'))
  setTimeout(() => process.exit(0), 10_000).unref()
})
process.on('unhandledRejection', (e) => { console.error('promessa rejeitada:', e); process.exit(1) })
const dormir = async (ms) => { const ate = Date.now() + ms; while (!parar && Date.now() < ate) await new Promise((r) => setTimeout(r, Math.min(5000, ate - Date.now()))) }

// livro que estava no meio quando o serviço caiu volta para a fila (o caderno retoma)
banco.prepare("DELETE FROM retraducao WHERE estado = 'traduzindo'").run()

async function retraduzir(c) {
  const nome = `re${c.texto_id}`
  log(`texto ${c.texto_id} — ${c.titulo} (${c.palavras} palavras, aberto ${c.lido}× em 60 dias)`)
  re.marcar(banco, c.texto_id, 'traduzindo')
  const duvidas = join(PASTA, `${nome}.duvidas.jsonl`)
  writeFileSync(duvidas, '')
  emCurso = new AbortController()
  const t0 = Date.now()
  try {
    const { livro } = await traduzirLivro({
      fonte: c.fonte, de: 'en', titulo: c.titulo, nome, pasta: PASTA, motor: 'local', paralelo: 12, sinal: emCurso.signal,
      aoDuvidar: (d) => appendFileSync(duvidas, JSON.stringify(d) + '\n'),
      aoDizer: (l) => { if (/capítulos|ficaram no original|seguradas/.test(l)) log('   ' + l.slice(0, 160)) },
    })
    const antigos = banco.prepare('SELECT ordem, palavras, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem').all(c.texto_id)
    let novos = livro.capitulos.map((x) => ({ ordem: x.ordem, palavras: x.palavras, corpo: x.corpo }))
    // O divisor de capítulos mudou desde a tradução antiga (Robin Hood saiu com
    // 1 capítulo contra 24), mas os PARÁGRAFOS são os mesmos, um por um, do
    // mesmo original. Com o mesmo total, a tradução nova é recortada nos
    // capítulos de sempre — e o progresso de quem lê não se mexe.
    if (novos.length !== antigos.length) {
      const pars = (h) => h.split('</p>').filter((p) => p.trim()).map((p) => p + '</p>')
      const todos = novos.flatMap((x) => pars(x.corpo))
      const contagem = antigos.map((x) => pars(x.corpo).length)
      if (todos.length === contagem.reduce((s, n) => s + n, 0)) {
        let i = 0
        novos = antigos.map((x, k) => {
          const corpo = todos.slice(i, i + contagem[k]).join('')
          i += contagem[k]
          return { ordem: x.ordem, corpo, palavras: corpo.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length }
        })
        log(`   capítulos refeitos no corte de sempre (${livro.capitulos.length} → ${antigos.length})`)
      }
    }
    // mesmo número de capítulos: casa pela POSIÇÃO, não pelo número — o site
    // de Os Três Mosqueteiros não começa no capítulo 1 ("capítulo 1 não existe")
    if (novos.length === antigos.length) novos = novos.map((x, k) => ({ ...x, ordem: antigos[k].ordem }))
    const v = re.avaliar(antigos, novos, livro.registro)
    const m = { ...v.metricas, minutos: Math.round((Date.now() - t0) / MIN) }
    if (v.passa) {
      re.promover(banco, c.texto_id, novos, m)
      log(`   ✓ no site: ${m.frases} frases, ${m.alternativa} pela 2ª-4ª alternativa, ${m.ficouIngles} com palavra em inglês, ${m.socorroMint} pelo motor antigo, inglês ${m.inglesAntes}→${m.inglesAgora}/mil, ${m.minutos} min`)
    } else {
      re.marcar(banco, c.texto_id, 'segurada', v.motivos.join('; '), m)
      log(`   ✋ segurado (o site não mudou): ${v.motivos.join('; ')}`)
    }
  } catch (e) {
    re.marcar(banco, c.texto_id, 'erro', String(e.message).slice(0, 300))
    log(`   ! erro: ${e.message}`)
  } finally { emCurso = null }
}

const so = process.argv.includes('--so') ? process.argv[process.argv.indexOf('--so') + 1].split(',').map(Number) : null
if (so) {
  // o piloto: estes textos, agora, mesmo com a retradutora parada
  const todos = re.candidatos(banco, 1000)
  for (const id of so) {
    const c = todos.find((x) => x.texto_id === id)
    if (!c) { log(`texto ${id}: não é candidato (sem original em inglês, ou já feito)`); continue }
    await retraduzir(c)
    if (parar) break
  }
  process.exit(0)
}

log('retradutora de pé. modo: ' + (ajustes.ler(banco, 'retradutora') ?? 'parada'))
while (!parar) {
  if ((ajustes.ler(banco, 'retradutora') ?? 'parada') !== 'ligada') { await dormir(MIN); continue }
  if (!(await localDisponivel('en'))) { log('tradutor local fora do ar; olho de novo em 5 min'); await dormir(5 * MIN); continue }
  const [c] = re.candidatos(banco, 1)
  if (c) { await retraduzir(c); continue }
  // fila no fim: os segurados ganham UMA segunda volta, do zero (as travas
  // podem ter sido consertadas depois); capítulo a mais ou a menos não muda
  // com tradução nova, esses ficam
  const s = banco.prepare(`SELECT r.texto_id FROM retraducao r WHERE r.estado = 'segurada' AND r.tentativas = 0
    AND r.motivo NOT LIKE 'capítulos:%' ORDER BY r.em LIMIT 1`).get()
  if (!s) { await dormir(30 * MIN); continue }
  for (const ext of ['caderno.jsonl', 'json']) rmSync(join(PASTA, `re${s.texto_id}.${ext}`), { force: true })
  banco.prepare("UPDATE retraducao SET tentativas = 1, estado = 'erro', motivo = 'segunda volta' WHERE texto_id = ?").run(s.texto_id)
  const de2 = banco.prepare(`SELECT t.id texto_id, t.obra_id, COALESCE(o.titulo_pt, o.titulo) titulo, f.fonte, 0 lido,
      (SELECT COALESCE(SUM(palavras),0) FROM capitulo c WHERE c.texto_id = t.id) palavras
    FROM texto t JOIN obra o ON o.id = t.obra_id
    JOIN fila_traducao f ON f.id = (SELECT MAX(id) FROM fila_traducao x WHERE x.obra_id = t.obra_id AND x.estado = 'pronto')
    WHERE t.id = ?`).get(s.texto_id)
  if (de2) await retraduzir(de2)
}
