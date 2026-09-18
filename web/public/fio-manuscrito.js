// Importar manuscrito: .docx, .epub, .txt e .md viram capítulos.
//
// Tudo no navegador, sem biblioteca: .docx e .epub são ZIP, e o ZIP é lido
// pelo diretório central com `DecompressionStream('deflate-raw')`, que todo
// navegador atual tem. O arquivo nunca sai do aparelho — só os capítulos que a
// pessoa confirmar vão para o servidor, como texto.
//
// Marcação que o leitor do Fio entende: parágrafo separado por linha em
// branco, **negrito**, _itálico_ e `***` sozinho numa linha para quebra de cena.

/* exported lerManuscrito, marcacaoParaNos */

async function lerZip(buffer) {
  const v = new DataView(buffer)
  let fim = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break }
  }
  if (fim < 0) throw new Error('Arquivo corrompido (não é um ZIP válido).')
  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const arquivos = new Map()
  const dec = new TextDecoder()
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP malformado.')
    const metodo = v.getUint16(p + 10, true)
    const tamComp = v.getUint32(p + 20, true)
    const nomeLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), comLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    // zips feitos no Windows às vezes guardam "word\document.xml"
    const nome = dec.decode(new Uint8Array(buffer, p + 46, nomeLen)).replace(/\\/g, '/')
    arquivos.set(nome, { metodo, tamComp, local })
    p += 46 + nomeLen + extraLen + comLen
  }
  return {
    nomes: [...arquivos.keys()],
    async texto(nome) {
      const a = arquivos.get(nome)
      if (!a) return null
      const nl = v.getUint16(a.local + 26, true), el = v.getUint16(a.local + 28, true)
      const dados = new Uint8Array(buffer, a.local + 30 + nl + el, a.tamComp)
      if (a.metodo === 0) return dec.decode(dados)
      if (a.metodo !== 8) throw new Error('Compressão do arquivo não suportada.')
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return await new Response(fluxo).text()
    },
  }
}

const palavras = (t) => (t.match(/\S+/g) ?? []).length

// ── .docx: parágrafos de word/document.xml; título = estilo de título ──
async function lerDocx(buffer) {
  const zip = await lerZip(buffer)
  const xml = await zip.texto('word/document.xml')
  if (!xml) throw new Error('Não achei o texto dentro do .docx.')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const blocos = []
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    const estilo = p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? ''
    let texto = ''
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      const t = [...r.getElementsByTagNameNS(W, 't')].map((x) => x.textContent).join('')
      if (!t) { if (r.getElementsByTagNameNS(W, 'br').length) texto += ' '; continue }
      const rpr = r.getElementsByTagNameNS(W, 'rPr')[0]
      const negrito = rpr && rpr.getElementsByTagNameNS(W, 'b').length && rpr.getElementsByTagNameNS(W, 'b')[0].getAttributeNS(W, 'val') !== '0'
      const italico = rpr && rpr.getElementsByTagNameNS(W, 'i').length && rpr.getElementsByTagNameNS(W, 'i')[0].getAttributeNS(W, 'val') !== '0'
      let pedaco = t
      if (italico && t.trim()) pedaco = `_${pedaco.trim()}_${/\s$/.test(t) ? ' ' : ''}`
      if (negrito && t.trim()) pedaco = `**${pedaco.trim()}**${/\s$/.test(t) ? ' ' : ''}`
      texto += pedaco
    }
    texto = texto.replace(/\s+/g, ' ').trim()
    const titulo = /^(Heading|Ttulo|Título|Titulo|Title)\s?[12]?$/i.test(estilo) || /^heading[12]$/i.test(estilo)
    blocos.push({ texto, titulo: titulo && texto.length > 0 && texto.length < 140 })
  }
  return dividir(blocos)
}

// ── .epub: cada documento da espinha é um capítulo ──
async function lerEpub(buffer) {
  const zip = await lerZip(buffer)
  const container = await zip.texto('META-INF/container.xml')
  const opfCaminho = container?.match(/full-path="([^"]+)"/)?.[1]
  if (!opfCaminho) throw new Error('EPUB sem índice (container.xml).')
  const opf = new DOMParser().parseFromString(await zip.texto(opfCaminho), 'application/xml')
  const base = opfCaminho.includes('/') ? opfCaminho.slice(0, opfCaminho.lastIndexOf('/') + 1) : ''
  const itens = new Map([...opf.getElementsByTagName('item')].map((i) => [i.getAttribute('id'), i.getAttribute('href')]))
  const capitulos = []
  for (const ref of opf.getElementsByTagName('itemref')) {
    const href = itens.get(ref.getAttribute('idref'))
    if (!href) continue
    const caminho = decodeURIComponent(base + href.split('#')[0])
    const html = await zip.texto(caminho)
    if (!html) continue
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const titulo = doc.querySelector('h1,h2,h3')?.textContent.replace(/\s+/g, ' ').trim()
    const paras = [...doc.querySelectorAll('p, blockquote, li')].map((p) => {
      let t = ''
      for (const n of p.childNodes) {
        const s = n.textContent
        if (n.nodeName === 'STRONG' || n.nodeName === 'B') t += s.trim() ? `**${s.trim()}** ` : s
        else if (n.nodeName === 'EM' || n.nodeName === 'I') t += s.trim() ? `_${s.trim()}_ ` : s
        else t += s
      }
      return t.replace(/\s+/g, ' ').trim()
    }).filter(Boolean)
    const texto = paras.join('\n\n')
    // capa, sumário, folha de rosto — mas capítulo curto com título fica
    if (doc.querySelector('nav') || palavras(texto) < (titulo ? 15 : 40)) continue
    capitulos.push({ titulo: titulo || `Capítulo ${capitulos.length + 1}`, texto })
  }
  if (!capitulos.length) throw new Error('Não achei capítulos com texto neste EPUB.')
  return capitulos
}

// ── .txt e .md: título = linha "# …", "Capítulo …" ou "CAPÍTULO …" ──
function lerTexto(texto) {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  const blocos = []
  let paragrafo = []
  const fecha = () => { if (paragrafo.length) { blocos.push({ texto: paragrafo.join(' ').trim(), titulo: false }); paragrafo = [] } }
  for (const l of linhas) {
    const t = l.trim()
    const ehTitulo = /^#{1,3}\s+\S/.test(t) || /^(cap[íi]tulo|parte|pr[óo]logo|ep[íi]logo)\b.{0,80}$/i.test(t)
    if (ehTitulo) { fecha(); blocos.push({ texto: t.replace(/^#{1,3}\s+/, ''), titulo: true }); continue }
    if (!t) { fecha(); continue }
    paragrafo.push(t)
  }
  fecha()
  return dividir(blocos)
}

function dividir(blocos) {
  const capitulos = []
  let atual = null
  for (const b of blocos) {
    if (b.titulo) { atual = { titulo: b.texto.replace(/[*_]/g, ''), paras: [] }; capitulos.push(atual); continue }
    if (!b.texto) continue
    if (!atual) { atual = { titulo: 'Capítulo 1', paras: [] }; capitulos.push(atual) }
    atual.paras.push(/^(\*\s*){3,}$|^[-–—]{3,}$|^#$/.test(b.texto) ? '***' : b.texto)
  }
  const prontos = capitulos.map((c) => ({ titulo: c.titulo, texto: c.paras.join('\n\n') })).filter((c) => palavras(c.texto) > 0)
  if (!prontos.length) throw new Error('O arquivo parece vazio.')
  return prontos
}

async function lerManuscrito(arquivo) {
  const nome = arquivo.name.toLowerCase()
  if (arquivo.size > 30 * 1024 * 1024) throw new Error('Arquivo grande demais (até 30 MB).')
  if (nome.endsWith('.docx')) return lerDocx(await arquivo.arrayBuffer())
  if (nome.endsWith('.epub')) return lerEpub(await arquivo.arrayBuffer())
  if (nome.endsWith('.txt') || nome.endsWith('.md') || nome.endsWith('.markdown')) return lerTexto(await arquivo.text())
  throw new Error('Formatos aceitos: .docx, .epub, .txt e .md.')
}

/**
 * A marcação simples virando nós: parágrafos, **negrito**, _itálico_ e ***.
 * Nunca HTML: cada pedaço entra como nó de texto dentro de <strong>/<em>.
 */
function marcacaoParaNos(texto) {
  const nos = []
  for (const bloco of String(texto ?? '').split(/\n\s*\n/)) {
    const t = bloco.replace(/\s*\n\s*/g, ' ').trim()
    if (!t) continue
    const p = document.createElement('p')
    if (/^(\*\s*){3,}$/.test(t)) { p.className = 'cena'; p.textContent = '* * *'; nos.push(p); continue }
    const re = /\*\*([^*]+)\*\*|_([^_]+)_/g
    let i = 0, m
    while ((m = re.exec(t))) {
      if (m.index > i) p.append(document.createTextNode(t.slice(i, m.index)))
      const forte = document.createElement(m[1] ? 'strong' : 'em')
      forte.textContent = m[1] ?? m[2]
      p.append(forte)
      i = m.index + m[0].length
    }
    if (i < t.length) p.append(document.createTextNode(t.slice(i)))
    nos.push(p)
  }
  return nos
}
