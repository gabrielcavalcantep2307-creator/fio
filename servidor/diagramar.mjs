// A diagramação: o capítulo como página de livro, e não como texto bruto
// (19/09/2026).
//
// O dono abriu livros e viu "um emaranhado de textos". O raio-x do acervo
// inteiro (90.775 capítulos, 3,4 milhões de parágrafos) mostrou de onde vem:
//
//   archive.org (45 mil capítulos, OCR de livro escaneado) — cada LINHA da
//   página virou um parágrafo: 197 mil frases cortadas ao meio, o número da
//   página e o cabeçalho corrido ("314 ESTUDOS DA EDADE MEDIA") no meio do
//   texto, e "nSo" no lugar de "não".
//   Nas outras fontes: quebra de linha (<br>) no meio da prosa, verso que
//   chegou como prosa, epígrafe igual a parágrafo comum, separador de cena
//   solto ("* * * * *"), nota "[1]" crua, capítulo sem título na página.
//
// Consertar livro a livro não acaba nunca. Este módulo arruma NA ENTREGA, com
// regras que valem para todos — e para os que a esteira ainda vai traduzir.
// O banco continua com o texto como veio (a busca e o EPUB de origem não
// mudam); se uma regra errar, desfazer é tirar a regra, não restaurar backup.
//
// Cuidado com o que mexe no TEXTO: as marcações do leitor guardam a posição
// da letra dentro do capítulo. Em 19/09 não havia nenhuma marcação salva, por
// isso foi a hora de mudar. Depois do lançamento, regra nova que muda texto
// desloca marcação velha — o título do capítulo, por isso, entra como
// atributo (desenhado pelo CSS) e não como texto.

const TERMINA_FRASE = /[.!?…:»"”’)\]]$/
const COMECA_MINUSCULA = /^[a-zà-ÿ]/
// Só a cauda: um parágrafo emendado de mil linhas não é relido a cada linha.
const terminaFrase = (t) => TERMINA_FRASE.test(t.slice(-4))
const SO_NUMERO = /^\[?\d{1,4}\]?$/
// "314 ESTUDOS DA EDADE MEDIA", "AS SABICHONAS 187": página + cabeçalho corrido
const CABECALHO_COM_PAGINA = /^(\d{1,4}\s+[A-ZÀ-Ý][A-ZÀ-Ý0-9 .,;:'’-]{3,}|[A-ZÀ-Ý][A-ZÀ-Ý0-9 .,;:'’-]{3,}\s+\d{1,4})$/
const SEPARADOR = /^[*·•.~#=—–\s-]{1,24}$/
const BLOCO = /<(p|h[1-6]|blockquote|ul|ol|table|pre)(\s[^>]*)?>[\s\S]*?<\/\1>|<hr\s*\/?>/g

const texto = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#\d+;/g, 'x').replace(/\s+/g, ' ').trim()
const ehCaixaAlta = (t) => t.length > 2 && t === t.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(t)
const chaveDeTitulo = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

/** Quebra o corpo em blocos de primeiro nível: { tag, cls, attrs, html }. */
function blocos(corpo) {
  const saida = []
  let fim = 0
  const solto = (trecho) => {
    // texto fora de parágrafo (capítulo sem <p>, o "capítulo do muro"): vira
    // parágrafos pelas linhas em branco e, se houver, pelas quebras <br>
    const partes = trecho.includes('<br') ? [trecho] : trecho.split(/\n\s*\n/)
    for (const p of partes) if (texto(p)) saida.push({ tag: 'p', cls: '', attrs: '', html: p.trim() })
  }
  for (const m of corpo.matchAll(BLOCO)) {
    if (m.index > fim) solto(corpo.slice(fim, m.index))
    fim = m.index + m[0].length
    if (m[0].startsWith('<hr')) { saida.push({ tag: 'hr', cls: '', attrs: '', html: '' }); continue }
    const tag = m[1].toLowerCase()
    const attrs = m[2] ?? ''
    const cls = attrs.match(/class="([^"]*)"/)?.[1] ?? ''
    const html = m[0].slice(m[0].indexOf('>') + 1, m[0].length - tag.length - 3)
    saida.push({ tag, cls, attrs, html })
  }
  if (fim < corpo.length) solto(corpo.slice(fim))
  return saida
}

function montar(b) {
  if (b.tag === 'hr') return '<hr>'
  let attrs = b.attrs.replace(/\s*class="[^"]*"/, '')
  if (b.cls) attrs = ` class="${b.cls}"${attrs}`
  if (b.dados) for (const [k, v] of Object.entries(b.dados)) attrs += ` data-${k}="${String(v).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c])}"`
  return `<${b.tag}${attrs}>${b.html}</${b.tag}>`
}

const prosa = (b) => b && b.tag === 'p' && !b.cls

/** Um <p> de prosa com <br> dentro: verso, parágrafos colados ou linha quebrada. */
function desfazerQuebras(b) {
  const partes = b.html.split(/\s*<br\s*\/?>\s*/i).map((s) => s.trim()).filter((s) => texto(s))
  if (partes.length < 2) return [{ ...b, html: partes[0] ?? b.html }]
  const tamanhos = partes.map((s) => texto(s).length)
  const media = tamanhos.reduce((a, n) => a + n, 0) / tamanhos.length
  // Linhas curtas: é verso — a não ser que quase toda linha feche uma frase,
  // que é prosa com uma fala por linha ("Quando elle acabou, repetiu:<br>—
  // Quem?"). Verso de verdade termina muita linha em vírgula ou em nada.
  const fecham = partes.filter((s) => /[.!?…:»"”]$/.test(texto(s))).length / partes.length
  if (media <= 55 && Math.max(...tamanhos) <= 95 && fecham < 0.75) return [{ ...b, cls: 'estrofe', html: partes.join('<br>') }]
  const saida = []
  let atual = partes[0]
  let fim = texto(partes[0])
  for (const s of partes.slice(1)) {
    const ts = texto(s)
    if (terminaFrase(fim) || /^[—–-]/.test(ts)) { saida.push(atual); atual = s }
    else atual = juntar(atual, s, ts)
    fim = ts
  }
  saida.push(atual)
  return saida.map((html) => ({ ...b, html }))
}

/** Emenda duas linhas: tira o hífen de fim de linha ("commer-" + "cial"). */
function juntar(a, b, tb = texto(b)) {
  if (/[a-zà-ÿ]-/.test(a.slice(-2)) && COMECA_MINUSCULA.test(tb)) return a.slice(0, -1) + b
  return `${a} ${b}`
}

/** Os erros de OCR que se repetem em todo livro escaneado, e só os seguros. */
function limparOcr(html) {
  return html
    // "nSo", "entSo", "inspiraçSo": o til que o OCR leu como S
    .replace(/([a-zà-ÿ])S(?=os?(?![a-zà-ÿ]))/g, '$1ã')
    // "d^entre" → "d'entre"; "Garrett^" → "Garrett"
    .replace(/([A-Za-zÀ-ÿ])\^([a-zà-ÿ])/g, "$1'$2")
    .replace(/([A-Za-zÀ-ÿ.])\^(?=[\s,.;:)]|$)/g, '$1')
}

/**
 * Arruma os capítulos de um livro.
 * @param {Array<{ordem, titulo, corpo, palavras}>} capitulos
 * @param {{ fonte?: string, titulo?: boolean }} opcoes  titulo: false no EPUB,
 *   que escreve o próprio título de cada capítulo
 */
export function diagramar(capitulos, { fonte = '', titulo: comTitulo = true } = {}) {
  const escaneado = fonte === 'archive'
  const todos = capitulos.map((c) => blocos(c.corpo ?? ''))

  // Cabeçalho corrido: linha curta em caixa alta que se repete pelo livro.
  const vezes = new Map()
  for (const bs of todos) for (const b of bs) {
    if (!prosa(b)) continue
    const t = texto(b.html)
    if (t.length <= 60 && ehCaixaAlta(t) && !TERMINA_FRASE.test(t)) vezes.set(t, (vezes.get(t) ?? 0) + 1)
  }
  const corrido = new Set([...vezes].filter(([, n]) => n >= 3).map(([t]) => t))

  return capitulos.map((c, i) => {
    let bs = todos[i]
    if (!bs.length) return c

    // 1. limpar pontas e espaços; OCR; <br> dentro da prosa
    bs = bs.flatMap((b) => {
      if (b.tag !== 'p') return [b]
      let html = b.html.replace(/[ \t\r\n]+/g, ' ').trim()
      if (escaneado) html = limparOcr(html)
      html = html.replace(/([^\s>])\[(\d{1,3})\]/g, '$1<sup class="nota">$2</sup>')
      const limpo = { ...b, html }
      return prosa(limpo) && /<br/i.test(html) ? desfazerQuebras(limpo) : [limpo]
    })

    // 2. tirar o que interrompe a frase: número de página, cabeçalho corrido
    const lixo = (b) => {
      if (!prosa(b)) return false
      const t = texto(b.html)
      return CABECALHO_COM_PAGINA.test(t) || SO_NUMERO.test(t) || corrido.has(t)
    }
    const ficam = []
    for (let k = 0; k < bs.length; k++) {
      const b = bs[k]
      if (lixo(b)) {
        const t = texto(b.html)
        const antes = ficam.at(-1), depois = bs[k + 1]
        const cortaFrase = prosa(antes) && !terminaFrase(texto(antes.html))
        const continuaMinuscula = prosa(depois) && COMECA_MINUSCULA.test(texto(depois.html))
        // cabeçalho com página é sempre lixo; número solto e cabeçalho repetido
        // só quando cortam uma frase (ou no livro escaneado, onde é a regra)
        if (CABECALHO_COM_PAGINA.test(t) || cortaFrase || continuaMinuscula || (escaneado && SO_NUMERO.test(t))) continue
      }
      ficam.push(b)
    }
    bs = ficam

    // 3. emendar a frase cortada ao meio
    const tamanhos = bs.filter(prosa).map((b) => texto(b.html).length).sort((a, b) => a - b)
    const mediana = tamanhos[tamanhos.length >> 1] ?? 0
    const ehVerso = mediana > 0 && mediana < 45
    const emendados = []
    let fimAntes = ''
    for (const b of bs) {
      const antes = emendados.at(-1)
      const tb = prosa(b) ? texto(b.html) : ''
      if (!ehVerso && tb && prosa(antes) && fimAntes && !terminaFrase(fimAntes) &&
          (COMECA_MINUSCULA.test(tb) || (escaneado && !/^[—–-]/.test(tb)))) {
        antes.html = juntar(antes.html, b.html, tb)
        fimAntes = tb
        continue
      }
      emendados.push({ ...b })
      fimAntes = tb
    }
    bs = emendados

    // 4. separador de cena
    for (const b of bs) {
      if (!prosa(b)) continue
      const t = texto(b.html)
      if (t && SEPARADOR.test(t) && /[*·•~#]|[—–-]{3}/.test(t)) { b.cls = 'pausa'; b.html = '* * *' }
    }

    // 5. epígrafe no começo do capítulo: citação + quem disse
    for (let k = 0; k < Math.min(bs.length - 1, 8); k++) {
      const b = bs[k], prox = bs[k + 1]
      if (!prosa(b)) break
      const t = texto(b.html)
      if (!/^[«"“]/.test(t) || t.length > 600) break
      const tp = prox && prosa(prox) ? texto(prox.html) : ''
      // só com a atribuição logo depois: capítulo que começa com uma fala
      // entre aspas não é epígrafe
      if (!(tp && tp.length <= 160 && (/^\(.*\)\.?$/.test(tp) || /^[—–-]\s*\S/.test(tp)))) break
      b.cls = 'epigrafe'
      prox.cls = 'atribuicao'
      k++
    }

    // 5b. o índice do livro impresso: lista centralizada e menor, não verso
    if (/^(í|i)ndice|^sum[áa]rio|^conte[úu]do|^contents?$|^table of contents/i.test(String(c.titulo ?? '').trim())) {
      for (const b of bs) if (b.tag === 'p' && (!b.cls || b.cls === 'estrofe')) b.cls = 'indice'
    }

    // 6. o título do capítulo na página. Se o corpo já começa com ele, esse
    // bloco vira o título; se não, entra um título desenhado pelo CSS (sem
    // texto no HTML — ver o topo: não desloca marcação).
    const titulo = String(c.titulo ?? '').split(/[\r\n]/)[0].trim()
    const primeiro = bs[0]
    const tituloNoCorpo = primeiro && (primeiro.tag === 'p' || /^h[1-6]$/.test(primeiro.tag)) &&
      titulo && chaveDeTitulo(texto(primeiro.html)).endsWith(chaveDeTitulo(titulo)) && texto(primeiro.html).length <= 90
    if (tituloNoCorpo) {
      primeiro.cls = [primeiro.cls, 'fio-cap'].filter(Boolean).join(' ')
    } else if (comTitulo && titulo && titulo.length <= 120) {
      const soNumero = /^([IVXLCDM]+|\d{1,3})\.?$/i.test(titulo)
      bs.unshift({ tag: 'p', cls: 'fio-cap', attrs: ' aria-hidden="true"', html: '', dados: soNumero ? { rot: 'Capítulo', titulo: titulo.replace(/\.$/, '') } : { titulo } })
    }

    return { ...c, corpo: bs.map(montar).join('') }
  })
}
