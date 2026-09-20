// O trabalhador da revisora: conserta as traduções para sempre, sozinho.
//
//   node servidor/revisor-trabalhador.mjs              # o laço eterno
//   node servidor/revisor-trabalhador.mjs --uma-volta   # uma volta e sai
//   node servidor/revisor-trabalhador.mjs --livro 4983  # só este, e sai
//   node servidor/revisor-trabalhador.mjs --desfazer    # desfaz tudo o que aplicou
//   node servidor/revisor-trabalhador.mjs --desfazer --livro 4983
//
// Irmão de servidor/esteira-trabalhador.mjs, e pelas mesmas razões: container
// próprio, mesma imagem, mesmo banco; `node:sqlite` é síncrono e não pode
// prender o site; morrer e voltar é barato porque o estado todo está no banco.
//
// A diferença é o risco. A esteira ACRESCENTA livro: se ela erra, o acervo
// ganha um livro ruim e a gente esconde. A revisora MEXE no que já está no ar:
// se ela erra, o acervo perde livro bom, e em silêncio. Por isso ela é a
// única coisa deste projeto que nasce DESLIGADA e em modo de proposta.
//
// ─────────────────────────────────────────────────────────────
// OS DOIS MODOS
//
//   FIO_REVISORA=propor   (padrão)  mede, grava a proposta em `revisao_troca`
//                                   e NÃO encosta no capítulo. É o modo de
//                                   quem quer ver a lista antes.
//   FIO_REVISORA=aplicar            grava a proposta E troca o texto, sempre
//                                   guardando o capítulo inteiro como estava.
//   FIO_REVISORA=parada             não faz nada (o botão do painel).
//
// Mudar de modo não precisa de deploy: é uma linha do .env e um restart do
// container, ou o interruptor do painel.
//
// ─────────────────────────────────────────────────────────────
// A VOLTA
//
//   1. lê o modo; se `parada`, dorme
//   2. enche a fila com o que a esteira traduziu e ninguém revisou
//   3. pega UM livro
//   4. para cada capítulo:
//        a. glossário e números (troca mecânica, sem rede)
//        b. parágrafo que ficou na língua de origem → manda ao motor
//      cada troca passa pelas travas de servidor/revisao.mjs antes de existir
//   5. bate no teto de trocas? marca o livro `suspeito` e PARA o livro inteiro
//   6. marca pronto, dorme um pouco, e vai para o próximo
//
// O passo 5 é o que protege contra mim mesmo: se eu puser no glossário uma
// entrada ruim que case dez mil vezes, ela não é aplicada dez mil vezes — ela
// bate no teto no primeiro livro e o serviço para de mexer naquele livro.
// ─────────────────────────────────────────────────────────────

import { abrir } from './banco/base.mjs'
import * as ajustes from './ajustes.mjs'
import * as revisao from './revisao.mjs'
import { traduzir } from './servicos/motor-traducao.mjs'

const MIN = 60_000
const MODO_PADRAO = 'propor'
const TETO_TROCAS_CAPITULO = Number(process.env.FIO_REVISORA_TETO_CAPITULO || 40)
const TETO_TROCAS_LIVRO = Number(process.env.FIO_REVISORA_TETO_LIVRO || 400)
const TETO_RETRADUCAO_LIVRO = Number(process.env.FIO_REVISORA_TETO_RETRADUCAO || 250)
const PAUSA_ENTRE_LIVROS_S = Number(process.env.FIO_REVISORA_PAUSA_S || 20)
const OCIOSA_MIN = Number(process.env.FIO_REVISORA_OCIOSA_MIN || 30)

const banco = abrir()
banco.exec('PRAGMA busy_timeout = 30000')
revisao.garantirTabelas(banco)

const argumento = (nome) => {
  const i = process.argv.indexOf(nome)
  return i > 0 ? process.argv[i + 1] : null
}
const tem = (nome) => process.argv.includes(nome)

const agora = () => new Date().toISOString().slice(11, 19)
const log = (...a) => console.log('[' + agora() + ']', ...a)

/**
 * O modo. O painel manda mais que o ambiente, porque é o que o dono tem à mão
 * às duas da manhã quando quer que isto pare — trocar o .env exige deploy.
 */
function modoAgora() {
  try {
    const doPainel = ajustes.ler(banco, 'revisora')
    if (doPainel) return String(doPainel).toLowerCase()
  } catch { /* banco ainda sem a tabela: vale o ambiente */ }
  return (process.env.FIO_REVISORA || MODO_PADRAO).toLowerCase()
}

// ─────────────────────────────────────────────────────────────
// Gravar uma troca
// ─────────────────────────────────────────────────────────────

const gravarTroca = banco.prepare(`INSERT INTO revisao_troca
  (texto_id, capitulo_id, tipo, regra, antes, depois, estado, motivo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
const gravarCorpo = banco.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?')

/**
 * Tenta uma troca. Devolve 'aplicada' | 'proposta' | 'recusada'.
 *
 * `antes` e `depois` são o CAPÍTULO INTEIRO, não o parágrafo: é o que a gente
 * escreve, então é o que precisa dar para desfazer. Guardar o parágrafo
 * sozinho deixaria o desfazer dependendo de achar o parágrafo de novo no meio
 * de um texto que já mudou — que é exatamente o tipo de coisa que falha no dia
 * em que precisa funcionar.
 */
function tentar({ textoId, capituloId, tipo, regra, antes, depois, modo, exigirMaisPortugues }) {
  const veredito = revisao.trocaSegura(antes, depois, { exigirMaisPortugues })
  if (!veredito.pode) {
    gravarTroca.run(textoId, capituloId, tipo, regra, antes, depois, 'recusada', veredito.motivo)
    return 'recusada'
  }
  if (modo === 'aplicar') {
    gravarTroca.run(textoId, capituloId, tipo, regra, antes, depois, 'aplicada', null)
    gravarCorpo.run(depois, capituloId)
    return 'aplicada'
  }
  gravarTroca.run(textoId, capituloId, tipo, regra, antes, depois, 'proposta', null)
  return 'proposta'
}

// ─────────────────────────────────────────────────────────────
// Revisar um livro
// ─────────────────────────────────────────────────────────────

const PARAGRAFO = /<p(?:[ ][^>]*)?>[\s\S]*?<\/p>/g

/**
 * Troca o TEXTO de um parágrafo, mantendo a tag de fora como estava.
 *
 * Devolve null quando o parágrafo tem marcação por dentro (<em>, <a>, nota de
 * rodapé): aí não dá para trocar o texto sem decidir onde o itálico recomeça,
 * e decidir isso é exatamente o tipo de palpite que esta revisora não dá.
 * Um parágrafo em itálico que fica em alemão é um defeito que espera;
 * um parágrafo com o itálico no lugar errado é um defeito que ninguém vê.
 */
function trocarTextoDoParagrafo(p, novo) {
  const fim = p.indexOf('>')
  if (fim < 0 || !p.endsWith('</p>')) return null
  const abre = p.slice(0, fim + 1)
  const dentro = p.slice(fim + 1, p.length - 4)
  if (dentro.includes('<')) return null
  return abre + novo + '</p>'
}

/**
 * Traduz um texto comprido em pedaços de frase, e devolve tudo emendado.
 *
 * Um pedido só com 20 mil palavras não dá erro: dá o mesmo texto de volta.
 * Por isso o corte, e por isso cada pedaço é conferido sozinho — se um pedaço
 * voltar na língua de origem, ele fica como estava em vez de contaminar o
 * resto, e o conjunto ainda melhora.
 */
async function traduzirEmPedacos(cru, de) {
  const pedacos = revisao.emPedacos(cru)
  const prontos = []
  for (const p of pedacos) {
    try {
      const veio = String(await traduzir(p, { de, para: 'pt' })).trim()
      const m = revisao.medirLingua(veio)
      prontos.push(veio && m.lingua !== de ? veio : p)
    } catch {
      prontos.push(p)
    }
  }
  return prontos.join(' ')
}

/**
 * O capítulo inteiro ficou na língua de origem: a esteira pulou este pedaço
 * do livro. Reescreve parágrafo a parágrafo, mantendo a marcação de pé.
 */
async function retraduzirCapitulo(corpo, lingua) {
  const ps = corpo.match(PARAGRAFO) ?? []
  let saida = corpo
  let feitos = 0
  for (const p of ps) {
    const cru = revisao.semTags(p)
    if (cru.length < 30) continue
    if (revisao.medirLingua(cru).lingua === 'pt') continue
    const novo = await traduzirEmPedacos(cru, lingua)
    if (!novo || novo === cru) continue
    const trocado = trocarTextoDoParagrafo(p, novo)
    if (!trocado) continue
    saida = saida.replace(p, trocado)
    feitos++
  }
  return { corpo: saida, feitos }
}

async function revisarLivro(livro, modo) {
  const caps = banco.prepare('SELECT id, ordem, titulo, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem').all(livro.texto_id)
  let trocas = 0
  let recusadas = 0
  let retraduzidos = 0
  let suspeito = null

  for (const cap of caps) {
    if (suspeito) break
    let corpo = String(cap.corpo ?? '')
    if (!corpo) continue
    let noCapitulo = 0

    // ── 0. o capítulo INTEIRO ficou na língua de origem ──
    // É o defeito grande, e o mais invisível: não é palavra errada, é um
    // pedaço do livro que a esteira pulou e ninguém abriu desde então. Vale
    // uma troca só, do capítulo inteiro, para que desfazer seja um passo.
    const doCapitulo = revisao.medirLingua(corpo)
    if (doCapitulo.lingua !== 'pt' && doCapitulo.lingua !== 'indefinida' && doCapitulo.pt < 0.12 && doCapitulo.palavras > 200) {
      log('  capítulo ' + cap.ordem + ' está inteiro em ' + doCapitulo.lingua + ' (' + doCapitulo.palavras + ' palavras) — retraduzindo')
      const r = await retraduzirCapitulo(corpo, doCapitulo.lingua)
      if (r.feitos) {
        const fim = tentar({
          textoId: livro.texto_id, capituloId: cap.id, tipo: 'capitulo-perdido',
          regra: doCapitulo.lingua, antes: corpo, depois: r.corpo, modo,
          exigirMaisPortugues: true,
        })
        if (fim === 'recusada') recusadas++
        else { trocas++; retraduzidos += r.feitos; if (modo === 'aplicar') corpo = r.corpo }
      }
      // capítulo inteiro tratado: o resto das regras não se aplica aqui
      continue
    }

    // ── a. glossário e números: mecânico, sem rede ──
    const g = revisao.aplicarGlossarioNoHtml(corpo)
    const n = revisao.consertarNumeros(g.html)
    if (g.usadas.length || n.usadas.length) {
      const quantas = g.usadas.length + n.usadas.length
      if (quantas > TETO_TROCAS_CAPITULO) {
        suspeito = 'capítulo ' + cap.ordem + ' daria ' + quantas + ' trocas (teto ' + TETO_TROCAS_CAPITULO + ')'
        break
      }
      const fim = tentar({
        textoId: livro.texto_id, capituloId: cap.id, tipo: 'glossario',
        regra: [...new Set([...g.usadas, ...n.usadas])].join(','),
        antes: corpo, depois: n.html, modo,
        // troca de palavra da lista não muda a língua do parágrafo, então
        // exigir "ficou mais português" aqui recusaria tudo
        exigirMaisPortugues: false,
      })
      if (fim === 'recusada') recusadas++
      else { trocas++; noCapitulo += quantas; if (modo === 'aplicar') corpo = n.html }
    }

    // ── b. parágrafo que ficou na língua de origem ──
    const ps = corpo.match(PARAGRAFO) ?? []
    for (const p of ps) {
      if (retraduzidos >= TETO_RETRADUCAO_LIVRO) { suspeito = 'passou de ' + TETO_RETRADUCAO_LIVRO + ' parágrafos para retraduzir'; break }
      if (noCapitulo >= TETO_TROCAS_CAPITULO) break
      const lingua = revisao.ficouNaOrigem(p)
      if (!lingua) continue
      const cru = revisao.semTags(p)
      if (cru.length < 60 || cru.length > 4000) continue

      let vindo
      try {
        vindo = await traduzir(cru, { de: lingua, para: 'pt' })
      } catch (e) {
        recusadas++
        gravarTroca.run(livro.texto_id, cap.id, 'retraducao', lingua, p, '', 'recusada', 'motor: ' + e.message)
        continue
      }
      const novoP = p.replace(cru, String(vindo).trim())
      const depois = corpo.replace(p, novoP)
      const fim = tentar({
        textoId: livro.texto_id, capituloId: cap.id, tipo: 'retraducao', regra: lingua,
        antes: corpo, depois, modo, exigirMaisPortugues: true,
      })
      if (fim === 'recusada') recusadas++
      else { trocas++; retraduzidos++; noCapitulo++; if (modo === 'aplicar') corpo = depois }
    }
  }

  if (suspeito) {
    revisao.marcar(banco, livro.texto_id, 'suspeito', { trocas, recusadas, motivo: suspeito })
    log('  !! SUSPEITO:', suspeito, '— livro parado, nada mais foi mexido nele')
    return { trocas, recusadas, suspeito }
  }
  if (trocas > TETO_TROCAS_LIVRO) {
    revisao.marcar(banco, livro.texto_id, 'suspeito', { trocas, recusadas, motivo: trocas + ' trocas no livro' })
    return { trocas, recusadas, suspeito: 'teto do livro' }
  }
  revisao.marcar(banco, livro.texto_id, 'pronto', { trocas, recusadas })
  return { trocas, recusadas, suspeito: null }
}

// ─────────────────────────────────────────────────────────────
// O laço
// ─────────────────────────────────────────────────────────────

async function volta() {
  const modo = modoAgora()
  if (modo === 'parada') {
    revisao.pulsar(banco, { estado: 'parada' })
    return { dormir: 5 * MIN }
  }
  const novos = revisao.encherFila(banco)
  if (novos) log('fila: +' + novos + ' livros')

  const livro = revisao.proximo(banco)
  if (!livro) {
    revisao.pulsar(banco, { estado: 'ociosa', modo })
    return { dormir: OCIOSA_MIN * MIN }
  }

  revisao.marcar(banco, livro.texto_id, 'revisando')
  revisao.pulsar(banco, { estado: 'revisando', modo, livro: livro.titulo, texto: livro.texto_id })
  log(modo + ': ' + livro.titulo + ' (texto ' + livro.texto_id + ')')

  try {
    const r = await revisarLivro(livro, modo)
    log('  ' + r.trocas + ' trocas, ' + r.recusadas + ' recusadas' + (r.suspeito ? ' — SUSPEITO' : ''))
  } catch (e) {
    revisao.marcar(banco, livro.texto_id, 'erro', { motivo: e.message })
    log('  erro:', e.message)
  }
  return { dormir: PAUSA_ENTRE_LIVROS_S * 1000 }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

if (tem('--desfazer')) {
  const id = argumento('--livro')
  const n = revisao.desfazer(banco, { textoId: id ? Number(id) : null })
  log('desfeitas ' + n + ' trocas' + (id ? ' do texto ' + id : ' (todas)'))
  process.exit(0)
}

const soLivro = argumento('--livro')
if (soLivro) {
  revisao.encherFila(banco)
  const l = banco.prepare(`SELECT r.texto_id, coalesce(o.titulo_pt, o.titulo) titulo FROM revisao_livro r
    JOIN texto t ON t.id = r.texto_id JOIN obra o ON o.id = t.obra_id WHERE r.texto_id = ?`).get(Number(soLivro))
  if (!l) { log('texto ' + soLivro + ' não está na fila (só entra tradução nossa)'); process.exit(1) }
  const modo = modoAgora()
  log('modo ' + modo + ' — ' + l.titulo)
  const r = await revisarLivro(l, modo)
  log(JSON.stringify(r))
  process.exit(0)
}

log('revisora de pé. modo: ' + modoAgora())
do {
  const { dormir: ms } = await volta()
  if (tem('--uma-volta')) break
  await dormir(ms)
} while (true)
