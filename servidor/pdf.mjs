// Um PDF montado na hora, no MESMO espírito do EPUB (servidor/epub.mjs):
// zero dependência, formato escrito à mão — sem lib de PDF, sem processo
// externo, sem Chromium. O site inteiro roda em Node puro numa VPS de 2
// núcleos que já serve tráfego ao vivo; gerar PDF chamando um navegador por
// baixo pesaria demais nessa máquina, e uma biblioteca de fora quebraria a
// única regra que o projeto nunca abriu exceção até hoje.
//
// Por que existe, apesar de epub.mjs explicar por que o LEITOR daqui não usa
// PDF (página fixa, ruim no celular): isto não é para ler aqui, é para levar
// — capa, ficha técnica e sumário, do jeito que uma edição impressa comum
// chega. Quem quer ler no aparelho pede o EPUB; os dois convivem.
//
// O que este arquivo NÃO tenta imitar: hifenização (silabação certa exige
// dicionário), kerning por par de letras, capitulares. A justificação é por
// espaço entre palavras (Tw), que é como a grande maioria dos PDFs gerados
// por software já faz.

import { deflateSync } from 'node:zlib'

// ─────────────────────────────────────────────────────────────
// WinAnsiEncoding — os únicos 256 caracteres que uma fonte padrão do PDF
// conhece, sem embutir fonte nenhuma. A faixa A0-FF é igual a Latin-1, então
// todo acento do português (á é í ó ú ã õ â ê ô ç ü) cai direto. A faixa
// 80-9F é onde o Windows-1252 diverge — é ali que moram aspas e travessão
// tipográficos.
// ─────────────────────────────────────────────────────────────

const WIN_ANSI_ALTO = {
  0x20ac: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94,
  0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x0152: 0x8c, 0x0153: 0x9c,
  0x0178: 0x9f, 0x0160: 0x8a, 0x0161: 0x9a, 0x017d: 0x8e, 0x017e: 0x9e,
  0x2022: 0x95, 0x2039: 0x8b, 0x203a: 0x9b, 0x02c6: 0x88, 0x02dc: 0x98,
}
const paraWinAnsi = (cp) => (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) ? cp : (WIN_ANSI_ALTO[cp] ?? 0x3f)
const bytesWinAnsi = (s) => Buffer.from(Array.from(String(s ?? '')).map((c) => paraWinAnsi(c.codePointAt(0))))

// ─────────────────────────────────────────────────────────────
// Largura dos glifos (Times, os 14 padrão do PDF — nenhuma fonte embutida).
// Tabela ASCII é a métrica publicada da Adobe (AFM), igual em todo leitor de
// PDF. A faixa acentuada herda a largura da letra-base (é como o AFM real
// trata acento: o desenho muda, a largura não), e os símbolos tipográficos
// (aspas, travessão) ganham valor à parte.
// ─────────────────────────────────────────────────────────────

const ASCII_ROMAN = {
  32: 250, 33: 333, 34: 408, 35: 500, 36: 500, 37: 833, 38: 778, 39: 180, 40: 333, 41: 333,
  42: 500, 43: 564, 44: 250, 45: 333, 46: 250, 47: 278,
  48: 500, 49: 500, 50: 500, 51: 500, 52: 500, 53: 500, 54: 500, 55: 500, 56: 500, 57: 500,
  58: 278, 59: 278, 60: 564, 61: 564, 62: 564, 63: 444, 64: 921,
  65: 722, 66: 667, 67: 667, 68: 722, 69: 611, 70: 556, 71: 722, 72: 722, 73: 333, 74: 389,
  75: 722, 76: 611, 77: 889, 78: 722, 79: 722, 80: 556, 81: 722, 82: 667, 83: 556, 84: 611,
  85: 722, 86: 722, 87: 944, 88: 722, 89: 722, 90: 611,
  91: 333, 92: 278, 93: 333, 94: 469, 95: 500, 96: 333,
  97: 444, 98: 500, 99: 444, 100: 500, 101: 444, 102: 333, 103: 500, 104: 500, 105: 278, 106: 278,
  107: 500, 108: 278, 109: 778, 110: 500, 111: 500, 112: 500, 113: 500, 114: 333, 115: 389, 116: 278,
  117: 500, 118: 500, 119: 722, 120: 500, 121: 500, 122: 444,
  123: 480, 124: 200, 125: 480, 126: 541,
}
const ASCII_BOLD = {
  32: 250, 33: 333, 34: 555, 35: 500, 36: 500, 37: 1000, 38: 833, 39: 278, 40: 333, 41: 333,
  42: 500, 43: 570, 44: 250, 45: 333, 46: 250, 47: 278,
  48: 500, 49: 500, 50: 500, 51: 500, 52: 500, 53: 500, 54: 500, 55: 500, 56: 500, 57: 500,
  58: 333, 59: 333, 60: 570, 61: 570, 62: 570, 63: 500, 64: 930,
  65: 722, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778, 72: 778, 73: 389, 74: 500,
  75: 778, 76: 667, 77: 944, 78: 722, 79: 778, 80: 611, 81: 778, 82: 722, 83: 556, 84: 667,
  85: 722, 86: 722, 87: 1000, 88: 722, 89: 722, 90: 667,
  91: 333, 92: 278, 93: 333, 94: 581, 95: 500, 96: 333,
  97: 500, 98: 556, 99: 444, 100: 556, 101: 444, 102: 333, 103: 500, 104: 556, 105: 278, 106: 333,
  107: 556, 108: 278, 109: 833, 110: 556, 111: 500, 112: 556, 113: 556, 114: 444, 115: 389, 116: 333,
  117: 556, 118: 500, 119: 722, 120: 500, 121: 500, 122: 444,
  123: 394, 124: 220, 125: 394, 126: 520,
}
const ASCII_ITALIC = {
  32: 250, 33: 333, 34: 420, 35: 500, 36: 500, 37: 833, 38: 778, 39: 214, 40: 333, 41: 333,
  42: 500, 43: 675, 44: 250, 45: 333, 46: 250, 47: 278,
  48: 500, 49: 500, 50: 500, 51: 500, 52: 500, 53: 500, 54: 500, 55: 500, 56: 500, 57: 500,
  58: 333, 59: 333, 60: 675, 61: 675, 62: 675, 63: 500, 64: 920,
  65: 611, 66: 611, 67: 667, 68: 722, 69: 611, 70: 611, 71: 722, 72: 722, 73: 333, 74: 444,
  75: 667, 76: 556, 77: 833, 78: 667, 79: 722, 80: 611, 81: 722, 82: 611, 83: 500, 84: 556,
  85: 722, 86: 611, 87: 833, 88: 611, 89: 556, 90: 556,
  91: 389, 92: 278, 93: 389, 94: 422, 95: 500, 96: 333,
  97: 500, 98: 500, 99: 444, 100: 500, 101: 444, 102: 278, 103: 500, 104: 500, 105: 278, 106: 278,
  107: 444, 108: 278, 109: 722, 110: 500, 111: 500, 112: 500, 113: 500, 114: 389, 115: 389, 116: 278,
  117: 500, 118: 444, 119: 667, 120: 444, 121: 444, 122: 389,
  123: 400, 124: 275, 125: 400, 126: 541,
}
// acento: a largura segue a letra-base ('á' pesa como 'a')
const BASE_DE_ACENTO = {
  0xc0:65,0xc1:65,0xc2:65,0xc3:65,0xc4:65,0xc5:65, 0xe0:97,0xe1:97,0xe2:97,0xe3:97,0xe4:97,0xe5:97,
  0xc8:69,0xc9:69,0xca:69,0xcb:69, 0xe8:101,0xe9:101,0xea:101,0xeb:101,
  0xcc:73,0xcd:73,0xce:73,0xcf:73, 0xec:105,0xed:105,0xee:105,0xef:105,
  0xd2:79,0xd3:79,0xd4:79,0xd5:79,0xd6:79, 0xf2:111,0xf3:111,0xf4:111,0xf5:111,0xf6:111,
  0xd9:85,0xda:85,0xdb:85,0xdc:85, 0xf9:117,0xfa:117,0xfb:117,0xfc:117,
  0xc7:67, 0xe7:99, 0xd1:78, 0xf1:110, 0xdd:89, 0xfd:121, 0xff:121,
}
const EXTRAS = { 0x91: 180, 0x92: 180, 0x93: 408, 0x94: 408, 0x96: 500, 0x97: 1000, 0x85: 1000, 0x95: 350, 0xa7: 500, 0xb0: 400, 0xaa: 300, 0xba: 300 }

function construirLargura(base) {
  const t = new Map(Object.entries(base).map(([k, v]) => [Number(k), v]))
  for (const [cod, letra] of Object.entries(BASE_DE_ACENTO)) t.set(Number(cod), base[letra] ?? 500)
  for (const [cod, larg] of Object.entries(EXTRAS)) if (!t.has(Number(cod))) t.set(Number(cod), larg)
  return t
}
const FONTES = {
  F1: { base: 'Times-Roman', larguras: construirLargura(ASCII_ROMAN) },
  F2: { base: 'Times-Bold', larguras: construirLargura(ASCII_BOLD) },
  F3: { base: 'Times-Italic', larguras: construirLargura(ASCII_ITALIC) },
}
function largura(fonte, texto, tamanho) {
  const t = FONTES[fonte].larguras
  let soma = 0
  for (const b of bytesWinAnsi(texto)) soma += (t.get(b) ?? 500)
  return (soma / 1000) * tamanho
}

// ─────────────────────────────────────────────────────────────
// Quebra de linha e justificação
// ─────────────────────────────────────────────────────────────

/** Parte um parágrafo em linhas que cabem em `maxLargura`, sem hifenizar. */
function quebrarLinhas(texto, fonte, tamanho, maxLargura) {
  const palavras = String(texto ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const linhas = []
  let atual = []
  let larguraAtual = 0
  const espaco = largura(fonte, ' ', tamanho)
  for (const p of palavras) {
    const lp = largura(fonte, p, tamanho)
    const comEspaco = atual.length ? larguraAtual + espaco + lp : lp
    if (atual.length && comEspaco > maxLargura) {
      linhas.push({ palavras: atual, largura: larguraAtual })
      atual = [p]; larguraAtual = lp
    } else {
      atual.push(p); larguraAtual = comEspaco
    }
  }
  if (atual.length) linhas.push({ palavras: atual, largura: larguraAtual })
  return linhas
}

const escaparPdf = (buf) => {
  const partes = []
  for (const b of buf) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) partes.push(0x5c, b)
    else partes.push(b)
  }
  return Buffer.from(partes)
}
const corRgb = (hex) => {
  const h = String(hex ?? '#000000').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3))
}
const opTexto = (fonte, tamanho, x, y, tw, texto, { cor = '#000000', tc = 0 } = {}) => {
  const [r, g, b] = corRgb(cor)
  return `${r} ${g} ${b} rg\n/${fonte} ${tamanho} Tf\n${tc.toFixed(2)} Tc\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n${tw.toFixed(3)} Tw\n(${escaparPdf(bytesWinAnsi(texto)).toString('latin1')}) Tj\n`
}
/** Retângulo preenchido — ops de CAMINHO, têm que ficar FORA de BT/ET. */
const opRetangulo = (x, y, w, h, cor) => {
  const [r, g, b] = corRgb(cor)
  return `${r} ${g} ${b} rg\n${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\nf\n`
}
/** Linha reta, cheia ou tracejada (o traço pontilhado do sumário). */
const opLinhaReta = (x1, y1, x2, y2, cor, espessura = 0.75, tracejada = false) => {
  const [r, g, b] = corRgb(cor)
  return `${r} ${g} ${b} RG\n${espessura} w\n${tracejada ? '[1 2] 0' : '[] 0'} d\n${x1.toFixed(2)} ${y1.toFixed(2)} m\n${x2.toFixed(2)} ${y2.toFixed(2)} l\nS\n[] 0 d\n`
}
const opImagem = (nome, x, y, w, h) => `q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/${nome} Do\nQ\n`

/**
 * Largura e nº de componentes de cor de um JPEG, lendo só os marcadores —
 * sem decodificar a imagem. `null` se não for JPEG ou não achar o SOF.
 */
function dimensoesJpeg(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marca = buf[i + 1]
    if (marca === 0xd8 || marca === 0xd9 || (marca >= 0xd0 && marca <= 0xd7) || marca === 0x01) { i += 2; continue }
    const tam = buf.readUInt16BE(i + 2)
    const ehSOF = marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc
    if (ehSOF) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7), componentes: buf[i + 9] }
    }
    i += 2 + tam
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// O documento: página a página, com paginação automática
// ─────────────────────────────────────────────────────────────

const LARGURA_PAGINA = 421.32  // A5 em pontos (148x210mm) — cabe bem numa tela de celular
const ALTURA_PAGINA = 595.28
const MARGEM = 54
const COLUNA = LARGURA_PAGINA - MARGEM * 2

// `topoExtra`: espaço reservado no topo de TODA página do documento (não só
// a primeira) — para o cabeçalho corrido, que é desenhado DEPOIS (unshift),
// numa página que a quebra automática de linha já pode ter criado no meio
// de um capítulo. Sem isso, só a 1ª página de cada capítulo tinha respiro;
// uma quebra no meio do texto começava colada no cabeçalho.
function novoDocumento(topoExtra = 0) {
  const paginas = []
  let atual = null
  const nova = () => { atual = { ops: [], vetor: [], linhas: [], annots: [] }; paginas.push(atual); return atual }
  let y = 0
  const doc = {
    paginas,
    paginaAtual: () => atual,
    novaPagina() { nova(); y = ALTURA_PAGINA - MARGEM - topoExtra; return atual },
    y: () => y,
    ehTopoDePagina: () => y >= ALTURA_PAGINA - MARGEM - topoExtra - 0.01,
    linha(texto, { fonte = 'F1', tamanho = 11, leading = tamanho * 1.4, x = MARGEM, cor = '#000000', tc = 0, justificar = false, larguraAlvo = 0 } = {}) {
      if (!atual) this.novaPagina()
      if (y - leading < MARGEM) this.novaPagina()
      const tw = justificar && larguraAlvo > 0 ? Math.max(0, (larguraAlvo - largura(fonte, texto, tamanho)) / Math.max(1, (texto.match(/ /g) || []).length)) : 0
      atual.ops.push(opTexto(fonte, tamanho, x, y, tw, texto, { cor, tc }))
      const rect = [x, y - 2, x + Math.max(largura(fonte, texto, tamanho), larguraAlvo || 0), y + tamanho]
      atual.linhas.push({ texto, rect })
      y -= leading
      return { pagina: paginas.length - 1, rect, y }
    },
    linhaCentralizada(texto, opts = {}) {
      const tamanho = opts.tamanho ?? 11
      const fonte = opts.fonte ?? 'F1'
      const l = largura(fonte, texto, tamanho)
      return this.linha(texto, { ...opts, x: MARGEM + Math.max(0, (COLUNA - l) / 2) })
    },
    espaco(pts) { y -= pts; if (y < MARGEM) this.novaPagina() },
    retangulo(x, y2, w, h, cor) { if (!atual) this.novaPagina(); atual.vetor.push(opRetangulo(x, y2, w, h, cor)) },
    linhaReta(x1, y1, x2, y2, cor, espessura, tracejada) { if (!atual) this.novaPagina(); atual.vetor.push(opLinhaReta(x1, y1, x2, y2, cor, espessura, tracejada)) },
    imagem(nome, x, y2, w, h) { if (!atual) this.novaPagina(); atual.vetor.push(opImagem(nome, x, y2, w, h)) },
    paragrafo(texto, { fonte = 'F1', tamanho = 11, leading = tamanho * 1.45, indent = 16, justificar = true, cor = '#000000' } = {}) {
      const primeiraColuna = COLUNA - indent
      // a 1ª linha some no recuo (coluna mais estreita); as seguintes usam a
      // coluna cheia. Quebra duas vezes e descarta da ordem original as
      // palavras que a 1ª linha já usou.
      const linhas = quebrarLinhas(texto, fonte, tamanho, COLUNA)
      const linhaUm = quebrarLinhas(texto, fonte, tamanho, primeiraColuna)[0] ?? { palavras: [], largura: 0 }
      const usei = linhaUm.palavras.length
      const restoTexto = linhas.flatMap((l) => l.palavras).slice(usei).join(' ')
      const linhasRestantes = restoTexto ? quebrarLinhas(restoTexto, fonte, tamanho, COLUNA) : []
      const todasLinhas = [{ ...linhaUm, recuo: true }, ...linhasRestantes]
      todasLinhas.forEach((l, i) => {
        const ultima = i === todasLinhas.length - 1
        const x = i === 0 ? MARGEM + indent : MARGEM
        const alvo = i === 0 ? primeiraColuna : COLUNA
        this.linha(l.palavras.join(' '), { fonte, tamanho, leading, x, cor, justificar: justificar && !ultima, larguraAlvo: alvo })
      })
    },
    tituloCapitulo(texto) {
      this.espaco(18)
      this.linhaCentralizada(texto || 'Sem título', { fonte: 'F2', tamanho: 13.5, leading: 20 })
      this.espaco(14)
    },
    // Escreve numa posição EXATA, sem mexer no cursor nem checar quebra de
    // página — só para os layouts livres (a capa, com faixa de cor e texto
    // sobreposto em posições fixas, não flui como o resto do documento).
    textoLivre(texto, x, y2, { fonte = 'F1', tamanho = 11, cor = '#000000', tc = 0, centralizado = false } = {}) {
      if (!atual) this.novaPagina()
      const l = largura(fonte, texto, tamanho)
      const xx = centralizado ? MARGEM + Math.max(0, (COLUNA - l) / 2) : x
      atual.ops.push(opTexto(fonte, tamanho, xx, y2, 0, texto, { cor, tc }))
      return { largura: l }
    },
  }
  return doc
}

// ─────────────────────────────────────────────────────────────
// O livro inteiro
// ─────────────────────────────────────────────────────────────

const semTags = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/[ \t]+/g, ' ')

// Uma cor só, neutra e elegante, para o livro que não tem foto de capa real
// (a maioria do acervo: capa desenhada por tema, em SVG — que este arquivo
// não sabe rasterizar sem uma dependência nova). Não tenta casar com a cor
// do tema do site; é o equivalente em PDF da folha de rosto tipográfica
// simples, só que com fundo de cor em vez de branco.
const PALETA_CAPA = ['#242b2e', '#efece4', '#b9a06b'] // fundo, texto claro, acento dourado
const CINZA_ROTULO = '#8a8a86'
const CINZA_LINHA = '#c9c5ba'

/**
 * Monta o PDF de um livro.
 *
 * `livro` é `{ id, titulo, autor, tituloOriginal, tradutor, fonte, fonteUrl,
 * revisao, direito, capaJpeg, capitulos: [{ordem, titulo, corpo}] }`.
 * `capaJpeg`, se vier, é o BUFFER cru do arquivo — só entra se for JPEG de
 * verdade (checado por assinatura, não pela extensão do nome).
 */
export function montarPdf(livro) {
  // ── capa ──
  const capa = novoDocumento()
  capa.novaPagina()
  const [fundo, textoClaro, acento] = PALETA_CAPA
  const jpeg = dimensoesJpeg(livro.capaJpeg)
  const autorCapa = (livro.autor || 'AUTORIA NÃO IDENTIFICADA').toUpperCase()
  const linhasTitulo = quebrarLinhas(livro.titulo || 'Sem título', 'F2', 21, COLUNA + 30)

  if (jpeg && jpeg.componentes !== 4) {
    // a imagem cobre a página inteira (como background-size:cover — pode
    // sobrar por fora da MediaBox, e a página corta sozinha o que sobra)
    const escala = Math.max(LARGURA_PAGINA / jpeg.largura, ALTURA_PAGINA / jpeg.altura)
    const w = jpeg.largura * escala, h = jpeg.altura * escala
    capa.imagem('CapaFoto', (LARGURA_PAGINA - w) / 2, (ALTURA_PAGINA - h) / 2, w, h)
    // faixa de cor embaixo, para o título não brigar com a imagem
    const faixaH = 74 + linhasTitulo.length * 26
    capa.retangulo(0, 0, LARGURA_PAGINA, faixaH, fundo)
    capa.textoLivre(autorCapa, 0, faixaH - 28, { fonte: 'F2', tamanho: 10.5, tc: 1.4, cor: acento, centralizado: true })
    linhasTitulo.forEach((l, i) => {
      capa.textoLivre(l.palavras.join(' '), 0, faixaH - 54 - i * 26, { fonte: 'F2', tamanho: 18, cor: textoClaro, centralizado: true })
    })
    capa.textoLivre('FIOLIB', 0, 22, { fonte: 'F2', tamanho: 9, tc: 1.2, cor: acento, centralizado: true })
  } else {
    // sem foto: painel de cor lisa, como uma folha de rosto tipográfica
    capa.retangulo(0, 0, LARGURA_PAGINA, ALTURA_PAGINA, fundo)
    const meio = ALTURA_PAGINA / 2
    capa.textoLivre(autorCapa, 0, meio + 90, { fonte: 'F2', tamanho: 12, tc: 1.8, cor: acento, centralizado: true })
    const yTitulo = meio + 40
    linhasTitulo.forEach((l, i) => {
      capa.textoLivre(l.palavras.join(' '), 0, yTitulo - i * 30, { fonte: 'F2', tamanho: 23, cor: textoClaro, centralizado: true })
    })
    const yRegua = yTitulo - linhasTitulo.length * 30 - 14
    capa.linhaReta(LARGURA_PAGINA / 2 - 40, yRegua, LARGURA_PAGINA / 2 + 40, yRegua, acento, 0.75)
    capa.textoLivre('FIOLIB', 0, meio - 130, { fonte: 'F2', tamanho: 11, tc: 1.6, cor: acento, centralizado: true })
    capa.textoLivre(String(new Date().getFullYear()), 0, meio - 148, { fonte: 'F1', tamanho: 10, cor: textoClaro, centralizado: true })
  }

  // ── ficha técnica + sobre esta edição + licença ──
  const info = novoDocumento()
  info.novaPagina()
  info.espaco(20)
  info.linhaCentralizada('FICHA TÉCNICA', { fonte: 'F2', tamanho: 12, tc: 1.5 })
  const yReguaInfo = info.y() - 4
  info.linhaReta(MARGEM + COLUNA / 2 - 46, yReguaInfo, MARGEM + COLUNA / 2 + 46, yReguaInfo, CINZA_LINHA, 0.75)
  info.espaco(24)
  const campo = (rotulo, valor) => {
    if (!valor) return
    info.linha(rotulo.toUpperCase(), { fonte: 'F2', tamanho: 8.5, tc: 1.3, cor: CINZA_ROTULO })
    info.espaco(2)
    info.paragrafo(String(valor), { fonte: 'F1', tamanho: 11, indent: 0, justificar: false })
    info.espaco(13)
  }
  campo('Título', livro.titulo)
  if (livro.tituloOriginal && livro.tituloOriginal !== livro.titulo) campo('Título original', livro.tituloOriginal)
  campo('Autor', livro.autor)
  campo('Tradução', livro.revisao ? (livro.tradutor || 'Esteira de tradução do Fio (automática)') : null)
  campo('Fonte do texto original', livro.fonteUrl)
  campo('Direitos', livro.direito || 'Domínio público no Brasil.')
  campo('Edição', `Fiolib, ${new Date().getFullYear()}`)
  info.espaco(6)
  info.linhaCentralizada('SOBRE ESTA EDIÇÃO', { fonte: 'F2', tamanho: 12, tc: 1.5 })
  info.espaco(18)
  info.paragrafo(
    livro.revisao
      ? 'O texto em português desta edição foi traduzido pela esteira automática do Fio a partir do original em domínio público, e passa por um serviço de revisão que só troca o que dá para provar. Pode haver trechos ainda não revisados.'
      : 'O texto desta edição é o que está disponível em domínio público, preparado para leitura pelo Fio.',
    { fonte: 'F1', tamanho: 10.5, justificar: true },
  )
  info.espaco(16)
  info.linhaCentralizada('LICENÇA DE USO', { fonte: 'F2', tamanho: 12, tc: 1.5 })
  info.espaco(18)
  info.paragrafo(
    'Disponibilização gratuita por meio da Fiolib (fiolib.com.br), uma biblioteca digital em português. Esta obra está em domínio público ou sob licença livre no Brasil; a tradução, quando houver, é do próprio Fio. Baixe outros livros gratuitamente em fiolib.com.br.',
    { fonte: 'F1', tamanho: 10.5, justificar: true },
  )

  // ── corpo: um capítulo por vez, cabeçalho corrido + número de página ──
  // topoExtra reserva o espaço do cabeçalho em TODA página, não só a 1ª de
  // cada capítulo — ver o comentário de novoDocumento().
  const corpo = novoDocumento(22)
  const inicioCapitulo = []
  livro.capitulos.forEach((c, i) => {
    corpo.novaPagina()
    inicioCapitulo[i] = corpo.paginas.length - 1
    corpo.tituloCapitulo(c.titulo)
    const texto = semTags(c.corpo)
    for (const par of texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      corpo.paragrafo(par, { fonte: 'F1', tamanho: 10.5, leading: 15.2, indent: 16, justificar: true })
    }
  })

  // ── sumário: uma linha por capítulo, com linha pontilhada até o número
  // da página — a numeração real só dá para escrever DEPOIS de saber quanto
  // o próprio sumário ocupa, então as linhas de texto entram agora e os
  // números entram como uma segunda passada mais abaixo, sem refazer a
  // quebra de linha (o número fica numa coluna à parte, reservada, então
  // não influencia onde o título quebra).
  const sumario = novoDocumento()
  sumario.novaPagina()
  sumario.linhaCentralizada('SUMÁRIO', { fonte: 'F2', tamanho: 14, tc: 1.5 })
  const yReguaSumario = sumario.y() - 4
  sumario.linhaReta(MARGEM + COLUNA / 2 - 46, yReguaSumario, MARGEM + COLUNA / 2 + 46, yReguaSumario, CINZA_LINHA, 0.75)
  sumario.espaco(24)
  const COLUNA_NUMERO = 34
  const linksPendentes = []
  const entradasNumero = []
  livro.capitulos.forEach((c, i) => {
    const titulo = c.titulo || `Parte ${i + 1}`
    // título comprido demais pra uma linha (acontece: alguns livros herdam
    // como "capítulo" uma citação inteira) quebra em várias — cada linha
    // vira parte do mesmo link, senão o texto vazava da página
    const quebrado = quebrarLinhas(titulo, 'F1', 10.5, COLUNA - COLUNA_NUMERO)
    quebrado.forEach((l, k) => {
      const { pagina, rect } = sumario.linha(l.palavras.join(' '), { fonte: 'F1', tamanho: 10.5, leading: 17 })
      linksPendentes.push({ pagina, rect: [rect[0], rect[1], rect[2] + COLUNA_NUMERO, rect[3]], capituloIndex: i })
      if (k === quebrado.length - 1) entradasNumero.push({ capituloIndex: i, pagina, y: rect[1] + 2, fimTitulo: rect[2] })
    })
  })

  // ── junta tudo, resolve os links e os números do sumário para a página
  // final de cada capítulo ──
  const todas = [...capa.paginas, ...info.paginas, ...sumario.paginas, ...corpo.paginas]
  const offsetCorpo = capa.paginas.length + info.paginas.length + sumario.paginas.length
  for (const l of linksPendentes) {
    const paginaAlvo = offsetCorpo + inicioCapitulo[l.capituloIndex]
    sumario.paginas[l.pagina].annots.push({ rect: l.rect, destPagina: paginaAlvo })
  }
  for (const e of entradasNumero) {
    const numero = String(offsetCorpo + inicioCapitulo[e.capituloIndex] + 1)
    const xNumero = MARGEM + COLUNA - largura('F1', numero, 10.5)
    sumario.paginas[e.pagina].vetor.push(opLinhaReta(e.fimTitulo + 4, e.y + 3, xNumero - 5, e.y + 3, CINZA_LINHA, 0.6, true))
    sumario.paginas[e.pagina].ops.push(opTexto('F1', 10.5, xNumero, e.y, 0, numero, {}))
  }

  // ── cabeçalho corrido (à direita, como uma edição impressa) e número de
  // página, só nas páginas do corpo ──
  const tituloCurto = (livro.titulo || '').slice(0, 50).toUpperCase()
  const larguraCabecalho = largura('F3', tituloCurto, 8.5)
  corpo.paginas.forEach((p, i) => {
    p.ops.unshift(opTexto('F3', 8.5, MARGEM + COLUNA - larguraCabecalho, ALTURA_PAGINA - MARGEM + 14, 0, tituloCurto, { cor: '#555555', tc: 0.6 }))
    const num = String(offsetCorpo + i + 1)
    const lnum = largura('F1', num, 9)
    p.ops.push(opTexto('F1', 9, MARGEM + (COLUNA - lnum) / 2, MARGEM - 24, 0, num, {}))
  })

  return montarBytes(todas, { titulo: livro.titulo, autor: livro.autor, capaFoto: jpeg && jpeg.componentes !== 4 ? { buf: livro.capaJpeg, ...jpeg } : null })
}

// ─────────────────────────────────────────────────────────────
// Serialização do PDF (objetos, xref, outline)
// ─────────────────────────────────────────────────────────────

function montarBytes(paginas, meta) {
  const objetos = []               // { id, corpo: string|Buffer }
  const novoObj = (corpo) => { objetos.push({ id: objetos.length + 1, corpo }); return objetos.length }

  const idCatalogo = novoObj(null)
  const idPages = novoObj(null)
  const idInfo = novoObj(null)
  const idFonteRoman = novoObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>`)
  const idFonteBold = novoObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>`)
  const idFonteItalic = novoObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>`)

  // A foto da capa (se veio uma JPEG de verdade): entra como Image XObject,
  // com os BYTES CRUS do arquivo — DCTDecode é literalmente o formato JPEG,
  // então não há recodificação nenhuma, só embrulhar num objeto de PDF.
  let idImagemCapa = null
  if (meta.capaFoto) {
    const espaco = meta.capaFoto.componentes === 1 ? '/DeviceGray' : '/DeviceRGB'
    idImagemCapa = novoObj({
      streamCru: meta.capaFoto.buf,
      cabecalho: `<< /Type /XObject /Subtype /Image /Width ${meta.capaFoto.largura} /Height ${meta.capaFoto.altura} /ColorSpace ${espaco} /BitsPerComponent 8 /Filter /DCTDecode /Length ${meta.capaFoto.buf.length} >>`,
    })
  }
  const recursos = `<< /Font << /F1 ${idFonteRoman} 0 R /F2 ${idFonteBold} 0 R /F3 ${idFonteItalic} 0 R >> ` +
    (idImagemCapa ? `/XObject << /CapaFoto ${idImagemCapa} 0 R >> ` : '') + '>>'

  const idPaginas = paginas.map(() => novoObj(null))
  const idConteudos = paginas.map((p, i) => {
    const stream = p.vetor.join('') + 'BT\n' + p.ops.join('') + 'ET\n'
    const comprimido = deflateSync(Buffer.from(stream, 'latin1'))
    return novoObj({ streamZip: comprimido })
  })
  paginas.forEach((p, i) => {
    const annots = p.annots.map((a) => {
      const idAnnot = novoObj(
        `<< /Type /Annot /Subtype /Link /Rect [${a.rect.map((n) => n.toFixed(2)).join(' ')}] /Border [0 0 0] ` +
        `/Dest [${idPaginas[a.destPagina]} 0 R /Fit] >>`,
      )
      return idAnnot
    })
    objetos[idPaginas[i] - 1].corpo =
      `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${LARGURA_PAGINA} ${ALTURA_PAGINA}] ` +
      `/Resources ${recursos} /Contents ${idConteudos[i]} 0 R` +
      (annots.length ? ` /Annots [${annots.map((a) => a + ' 0 R').join(' ')}]` : '') + ' >>'
  })

  objetos[idPages - 1].corpo = `<< /Type /Pages /Kids [${idPaginas.map((n) => n + ' 0 R').join(' ')}] /Count ${idPaginas.length} >>`
  objetos[idCatalogo - 1].corpo = `<< /Type /Catalog /Pages ${idPages} 0 R >>`
  objetos[idInfo - 1].corpo = `<< /Title (${escaparPdf(bytesWinAnsi(meta.titulo || '')).toString('latin1')}) /Author (${escaparPdf(bytesWinAnsi(meta.autor || '')).toString('latin1')}) /Producer (Fiolib) >>`

  // ── grava ──
  const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]
  const offsets = new Array(objetos.length + 1).fill(0)
  let pos = partes[0].length
  for (const o of objetos) {
    offsets[o.id] = pos
    let bloco
    if (o.corpo && o.corpo.streamZip) {
      const cab = `${o.id} 0 obj\n<< /Length ${o.corpo.streamZip.length} /Filter /FlateDecode >>\nstream\n`
      bloco = Buffer.concat([Buffer.from(cab, 'latin1'), o.corpo.streamZip, Buffer.from('\nendstream\nendobj\n', 'latin1')])
    } else if (o.corpo && o.corpo.streamCru) {
      const cab = `${o.id} 0 obj\n${o.corpo.cabecalho}\nstream\n`
      bloco = Buffer.concat([Buffer.from(cab, 'latin1'), o.corpo.streamCru, Buffer.from('\nendstream\nendobj\n', 'latin1')])
    } else {
      bloco = Buffer.from(`${o.id} 0 obj\n${o.corpo}\nendobj\n`, 'latin1')
    }
    partes.push(bloco)
    pos += bloco.length
  }
  const xrefPos = pos
  const linhas = ['xref', `0 ${objetos.length + 1}`, '0000000000 65535 f ']
  for (let i = 1; i <= objetos.length; i++) linhas.push(String(offsets[i]).padStart(10, '0') + ' 00000 n ')
  const trailer = `trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R /Info ${idInfo} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`
  partes.push(Buffer.from(linhas.join('\n') + '\n' + trailer, 'latin1'))

  return Buffer.concat(partes)
}

/** O nome do arquivo que a pessoa vê na pasta de downloads. */
export function nomeDeArquivoPdf(livro) {
  const limpo = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '-')
  return `${limpo(livro.autor)}-${limpo(livro.titulo)}.pdf`.replace(/^-+/, '').slice(0, 120)
}
