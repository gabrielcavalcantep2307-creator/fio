// Baixar o livro.
//
// Um EPUB montado na hora, a partir dos capítulos que já estão no banco. Sem
// dependência: o formato é um ZIP com quatro arquivos de estrutura dentro, e
// escrever um ZIP são cem linhas.
//
// **Por que EPUB e não PDF.** PDF tem página fixa: no celular vira zoom e
// arrasto. EPUB é o texto com marcação, e quem lê escolhe corpo, margem e
// fonte — que é a mesma razão de o leitor daqui não usar PDF.
//
// **Por que deixar baixar.** Uma biblioteca que só deixa ler dentro dela não
// é uma biblioteca, é um aluguel. Estas obras são de domínio público: elas
// pertencem a quem quiser, e levar embora é o direito que define isso.

import { deflateRawSync } from 'node:zlib'

// ─────────────────────────────────────────────────────────────
// ZIP
// ─────────────────────────────────────────────────────────────

const TABELA = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/**
 * `guardar: true` grava sem compressão.
 *
 * O `mimetype` do EPUB TEM que ser o primeiro arquivo e TEM que estar
 * descomprimido — é assim que um leitor identifica o formato sem abrir o zip
 * inteiro. Comprimi-lo produz um arquivo que abre em alguns programas e é
 * recusado em outros, o que é pior que não abrir em nenhum.
 */
function zipar(arquivos) {
  const locais = []
  const centrais = []
  let deslocamento = 0

  for (const { nome, dados, guardar } of arquivos) {
    const cru = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, 'utf8')
    const corpo = guardar ? cru : deflateRawSync(cru)
    const metodo = guardar ? 0 : 8
    const nomeBuf = Buffer.from(nome, 'utf8')
    const soma = crc32(cru)

    const local = Buffer.alloc(30 + nomeBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // versão necessária
    local.writeUInt16LE(0, 6)           // sem sinalizadores
    local.writeUInt16LE(metodo, 8)
    local.writeUInt16LE(0, 10)          // hora
    local.writeUInt16LE(0x21, 12)       // data: 1º/1/1980, para o zip ser reproduzível
    local.writeUInt32LE(soma, 14)
    local.writeUInt32LE(corpo.length, 18)
    local.writeUInt32LE(cru.length, 22)
    local.writeUInt16LE(nomeBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nomeBuf.copy(local, 30)
    locais.push(local, corpo)

    const central = Buffer.alloc(46 + nomeBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(metodo, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(soma, 16)
    central.writeUInt32LE(corpo.length, 20)
    central.writeUInt32LE(cru.length, 24)
    central.writeUInt16LE(nomeBuf.length, 28)
    central.writeUInt32LE(0, 38)        // atributos externos
    central.writeUInt32LE(deslocamento, 42)
    nomeBuf.copy(central, 46)
    centrais.push(central)

    deslocamento += local.length + corpo.length
  }

  const diretorio = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(arquivos.length, 8)
  fim.writeUInt16LE(arquivos.length, 10)
  fim.writeUInt32LE(diretorio.length, 12)
  fim.writeUInt32LE(deslocamento, 16)

  return Buffer.concat([...locais, diretorio, fim])
}

// ─────────────────────────────────────────────────────────────
// EPUB
// ─────────────────────────────────────────────────────────────

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

// O HTML dos capítulos já veio sanitizado da ingestão — lista de permissão de
// tags, nenhum atributo. Aqui só falta fechar as tags vazias, que XHTML exige
// e HTML não.
const paraXhtml = (html) => String(html ?? '').replace(/<br>/g, '<br />')

const ESTILO = `
@page { margin: 5%; }
body { font-family: Georgia, serif; line-height: 1.7; text-align: justify; hyphens: auto; }
h1 { font-size: 1.3em; font-weight: normal; text-align: center; margin: 2em 0 1.5em; }
h3 { font-size: .8em; font-weight: normal; text-align: center; text-transform: uppercase;
     letter-spacing: .09em; margin: 0 0 1.8em; }
p { margin: 0; text-indent: 1.4em; }
p:first-of-type { text-indent: 0; }
blockquote { margin: 1.2em 1.5em; font-style: italic; }
.rosto { text-align: center; margin-top: 25%; }
.rosto h1 { font-size: 1.8em; }
.fonte { font-size: .8em; color: #555; margin-top: 3em; text-align: left; text-indent: 0; }
`

/**
 * Monta o EPUB de um livro.
 *
 * `livro` é `{ id, titulo, autor, capitulos: [{ordem, titulo, corpo}], direito, fonte, fonteUrl }`.
 */
export function montarEpub(livro) {
  const id = `urn:fio:livro:${livro.id}`
  const caps = livro.capitulos

  const arquivos = [
    // TEM que ser o primeiro, e sem compressão.
    { nome: 'mimetype', dados: 'application/epub+zip', guardar: true },
    {
      nome: 'META-INF/container.xml',
      dados: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/livro.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    { nome: 'OEBPS/estilo.css', dados: ESTILO },
    {
      nome: 'OEBPS/rosto.xhtml',
      dados: pagina('Rosto', `<div class="rosto">
  <h1>${escapar(livro.titulo)}</h1>
  <p style="text-indent:0">${escapar(livro.autor)}</p>
  <p class="fonte">${escapar(livro.direito ?? 'Domínio público.')}${
    livro.fonteUrl ? `<br />Origem do texto: ${escapar(livro.fonteUrl)}` : ''
  }<br />Baixado de fiolib.duckdns.org</p>
</div>`),
    },
    ...caps.map(c => ({
      nome: `OEBPS/cap${c.ordem}.xhtml`,
      dados: pagina(c.titulo ?? `Parte ${c.ordem}`,
        `<h1>${escapar(c.titulo ?? `Parte ${c.ordem}`)}</h1>\n${paraXhtml(c.corpo)}`),
    })),
    {
      nome: 'OEBPS/livro.opf',
      dados: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">${id}</dc:identifier>
    <dc:title>${escapar(livro.titulo)}</dc:title>
    <dc:creator>${escapar(livro.autor)}</dc:creator>
    <dc:language>pt-BR</dc:language>
    <dc:rights>${escapar(livro.direito ?? 'Domínio público')}</dc:rights>
    <meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
  </metadata>
  <manifest>
    <item id="css" href="estilo.css" media-type="text/css"/>
    <item id="nav" href="sumario.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="rosto" href="rosto.xhtml" media-type="application/xhtml+xml"/>
${caps.map(c => `    <item id="c${c.ordem}" href="cap${c.ordem}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine>
    <itemref idref="rosto"/>
    <itemref idref="nav"/>
${caps.map(c => `    <itemref idref="c${c.ordem}"/>`).join('\n')}
  </spine>
</package>`,
    },
    {
      nome: 'OEBPS/sumario.xhtml',
      dados: pagina('Sumário', `<h1>Sumário</h1>
<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc" id="toc"><ol>
${caps.map(c => `<li><a href="cap${c.ordem}.xhtml">${escapar(c.titulo ?? `Parte ${c.ordem}`)}</a></li>`).join('\n')}
</ol></nav>`),
    },
  ]

  return zipar(arquivos)
}

function pagina(titulo, corpo) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR" lang="pt-BR">
<head><meta charset="utf-8"/><title>${escapar(titulo)}</title>
<link rel="stylesheet" type="text/css" href="estilo.css"/></head>
<body>${corpo}</body></html>`
}

/** O nome do arquivo que a pessoa vê na pasta de downloads. */
export function nomeDeArquivo(livro) {
  const limpo = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '-')
  return `${limpo(livro.autor)}-${limpo(livro.titulo)}.epub`.replace(/^-+/, '').slice(0, 120)
}
