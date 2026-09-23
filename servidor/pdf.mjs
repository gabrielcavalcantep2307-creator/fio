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
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerTtf } from './fonte-ttf.mjs'
import { capaDe } from './capa-pdf.mjs'

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
// O que não cabe em 256 posições não pode virar "?" calado. A ficha técnica
// de um livro trazia "(70 anos a partir de 1º/1 do ano seguinte) ? livre em":
// o "?" ali era uma seta ⇒, e quem lesse não teria como adivinhar. Estas são
// as marcas que aparecem em texto nosso e em livro digitalizado; cada uma
// recebe o equivalente que o leitor entende, e sobra uma letra em vez de uma
// dúvida. O que não estiver aqui continua virando "?", que é honesto: o
// arquivo diz que não soube, em vez de fingir.
const EQUIVALENTE = {
  '⇒': '=>', '→': '->', '←': '<-', '↔': '<->', '⇔': '<=>',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '×': 'x', '·': '.',
  '′': "'", '″': '"', '‹': '<', '›': '>', '−': '-', '‑': '-', '‒': '-',
  '№': 'no.', '℮': 'e', '∞': 'infinito', '†': '+', '‡': '++',
}
const paraWinAnsi = (cp) => (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) ? cp : (WIN_ANSI_ALTO[cp] ?? 0x3f)

/**
 * O texto em bytes do WinAnsi. Antes de converter, tira o que a tabela não
 * tem: o acento decomposto (NFC junta "a"+"~" no "ã" que existe em Latin-1)
 * e as marcas com equivalente escrito.
 */
const bytesWinAnsi = (s) => {
  let t = String(s ?? '').normalize('NFC')
  for (const [de, para] of Object.entries(EQUIVALENTE)) {
    if (t.includes(de)) t = t.split(de).join(para)
  }
  return Buffer.from(Array.from(t).map((c) => paraWinAnsi(c.codePointAt(0))))
}

// ─────────────────────────────────────────────────────────────
// A FONTE DO SITE, DENTRO DO ARQUIVO
//
// Até 22/09 isto usava Times, uma das catorze fontes que todo leitor de PDF
// já tem: o arquivo saía leve e abria igual em qualquer lugar, mas não tinha
// cara nenhuma. Agora vai a Literata, que é a fonte com que se lê no site —
// o PDF que a pessoa leva é o mesmo texto com a mesma letra.
//
// Embutir custa 145 KB por arquivo, e só isso porque o que vai é o recorte
// latino que o Google serve (48 KB por estilo, contra ~300 KB da família
// inteira). Latin-1 inteiro cabe nele, que é exatamente o que o
// WinAnsiEncoding endereça — nada do que este arquivo escreve fica de fora.
//
// A largura de cada letra vem da própria fonte (ver `fonte-ttf.mjs`), e não
// mais de uma tabela copiada à mão: com fonte embutida, chutar largura
// desalinha a justificação e o sumário inteiro.
// ─────────────────────────────────────────────────────────────

const PASTA_FONTES = join(dirname(fileURLToPath(import.meta.url)), 'fontes')

// De byte do WinAnsi para o caractere que ele representa — o caminho inverso
// de `paraWinAnsi`, necessário para perguntar à fonte a largura de cada
// posição da tabela de 256.
const DO_WIN_ANSI = new Map()
for (let b = 32; b <= 255; b++) if (b < 0x80 || b >= 0xa0) DO_WIN_ANSI.set(b, b)
for (const [uni, byte] of Object.entries(WIN_ANSI_ALTO)) DO_WIN_ANSI.set(byte, Number(uni))

function carregarFonte(arquivo, nome) {
  const bytes = readFileSync(join(PASTA_FONTES, arquivo))
  const ttf = lerTtf(bytes)
  const larguras = new Map()
  for (const [byte, cp] of DO_WIN_ANSI) larguras.set(byte, ttf.avancoDe(cp) ?? 500)
  return { nome, bytes, ttf, larguras }
}

const FONTES = {
  F1: carregarFonte('literata-regular.ttf', 'Literata'),
  F2: carregarFonte('literata-bold.ttf', 'Literata-Bold'),
  F3: carregarFonte('literata-italic.ttf', 'Literata-Italic'),
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

const CINZA_ROTULO = '#8a8a86'
const CINZA_LINHA = '#c9c5ba'

/**
 * Monta o PDF de um livro.
 *
 * `livro` é `{ id, titulo, autor, temas, tituloOriginal, tradutor, fonte,
 * fonteUrl, revisao, direito, capitulos: [{ordem, titulo, corpo}] }`.
 */
function dimensoesJpeg(buf) {
  let i = 2
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) return null
    const marcador = buf[i + 1]
    if (marcador >= 0xc0 && marcador <= 0xc3) {
      return { largura: buf.readUInt16BE(i + 7), altura: buf.readUInt16BE(i + 5) }
    }
    const tam = buf.readUInt16BE(i + 2)
    i += 2 + tam
  }
  return null
}

export function montarPdf(livro) {
  // ── capa original do livro (se houver imagem JPEG) ──
  let capaOriginal = null
  if (livro.capaImagem) {
    try {
      const jpegBuf = typeof livro.capaImagem === 'string'
        ? readFileSync(livro.capaImagem)
        : livro.capaImagem
      const dim = dimensoesJpeg(jpegBuf)
      if (dim) capaOriginal = { jpeg: jpegBuf, ...dim }
    } catch {}
  }

  // ── nossa capa (sempre presente) ──
  const capa = novoDocumento()
  capa.novaPagina()
  const { fundo, claro: textoClaro, acento, formas } = capaDe(livro.id, livro.temas)
  const autorCapa = (livro.autor || 'AUTORIA NÃO IDENTIFICADA').toUpperCase()
  const linhasTitulo = quebrarLinhas(livro.titulo || 'Sem título', 'F2', 21, COLUNA + 30)

  capa.retangulo(0, 0, LARGURA_PAGINA, ALTURA_PAGINA, fundo)
  // filete duplo por dentro da borda, como uma encadernação
  capa.linhaReta(26, 26, LARGURA_PAGINA - 26, 26, acento, 0.5)
  capa.linhaReta(26, ALTURA_PAGINA - 26, LARGURA_PAGINA - 26, ALTURA_PAGINA - 26, acento, 0.5)
  capa.linhaReta(26, 26, 26, ALTURA_PAGINA - 26, acento, 0.5)
  capa.linhaReta(LARGURA_PAGINA - 26, 26, LARGURA_PAGINA - 26, ALTURA_PAGINA - 26, acento, 0.5)

  for (const f of formas) {
    const cor = f.cor === 'claro' ? textoClaro : acento
    if (f.tipo === 'ret') {
      capa.retangulo(f.x * LARGURA_PAGINA, f.y * ALTURA_PAGINA, f.w * LARGURA_PAGINA, f.h * ALTURA_PAGINA, cor)
    } else {
      capa.linhaReta(f.x1 * LARGURA_PAGINA, f.y1 * ALTURA_PAGINA, f.x2 * LARGURA_PAGINA, f.y2 * ALTURA_PAGINA, cor, f.espessura ?? 0.6)
    }
  }

  const meio = ALTURA_PAGINA / 2
  capa.textoLivre(autorCapa, 0, meio + 42, { fonte: 'F2', tamanho: 12, tc: 1.8, cor: acento, centralizado: true })
  const yTitulo = meio - 6
  linhasTitulo.forEach((l, i) => {
    capa.textoLivre(l.palavras.join(' '), 0, yTitulo - i * 30, { fonte: 'F2', tamanho: 23, cor: textoClaro, centralizado: true })
  })
  const yRegua = yTitulo - linhasTitulo.length * 30 - 6
  capa.linhaReta(LARGURA_PAGINA / 2 - 40, yRegua, LARGURA_PAGINA / 2 + 40, yRegua, acento, 0.75)
  capa.textoLivre('FIOLIB', 0, 58, { fonte: 'F2', tamanho: 11, tc: 1.6, cor: acento, centralizado: true })
  capa.textoLivre(String(new Date().getFullYear()), 0, 42, { fonte: 'F1', tamanho: 10, cor: textoClaro, centralizado: true })

  // ── ficha técnica + sobre esta edição + licença ──
  const info = novoDocumento()
  info.novaPagina()
  info.espaco(20)
  info.linhaCentralizada('FICHA TÉCNICA', { fonte: 'F2', tamanho: 13, tc: 2.0 })
  const yReguaInfo = info.y() - 4
  info.linhaReta(MARGEM + COLUNA / 2 - 46, yReguaInfo, MARGEM + COLUNA / 2 + 46, yReguaInfo, CINZA_LINHA, 0.75)
  info.espaco(24)
  const campo = (rotulo, valor) => {
    if (!valor) return
    info.linha(rotulo.toUpperCase(), { fonte: 'F2', tamanho: 9, tc: 1.5, cor: CINZA_ROTULO })
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
  info.linhaCentralizada('SOBRE ESTA EDIÇÃO', { fonte: 'F2', tamanho: 13, tc: 2.0 })
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

  // ── junta tudo: [capa original] → nossa capa → info → sumário → corpo ──
  const paginasAntes = []
  if (capaOriginal) paginasAntes.push({ ops: [], vetor: [], linhas: [], annots: [], _imagem: capaOriginal })
  const todas = [...paginasAntes, ...capa.paginas, ...info.paginas, ...sumario.paginas, ...corpo.paginas]
  const offsetSumario = paginasAntes.length + capa.paginas.length + info.paginas.length
  const offsetCorpo = offsetSumario + sumario.paginas.length
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

  return montarBytes(todas, { titulo: livro.titulo, autor: livro.autor })
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
  // ── a fonte embutida ──
  //
  // Três objetos por estilo: o arquivo da fonte (`/FontFile2`, o .ttf inteiro
  // comprimido), o descritor (as medidas que o leitor usa para encaixar a
  // linha) e a fonte em si, com a largura de cada uma das 224 posições que o
  // WinAnsiEncoding endereça.
  //
  // `/Length1` é o tamanho do .ttf DESCOMPRIMIDO. Sem ele o leitor não sabe
  // onde a fonte acaba, e alguns simplesmente desistem de desenhar.
  const embutir = (f, italico) => {
    const zip = deflateSync(f.bytes)
    const idArquivo = novoObj({
      streamZip: zip,
      cabecalho: `<< /Length ${zip.length} /Filter /FlateDecode /Length1 ${f.bytes.length} >>`,
    })
    const idDescritor = novoObj(
      `<< /Type /FontDescriptor /FontName /${f.nome} /Flags ${italico ? 96 : 32} ` +
      `/FontBBox [${f.ttf.bbox.join(' ')}] /ItalicAngle ${f.ttf.italicAngle} ` +
      `/Ascent ${f.ttf.ascent} /Descent ${f.ttf.descent} /CapHeight ${f.ttf.capHeight} ` +
      `/StemV 80 /FontFile2 ${idArquivo} 0 R >>`)
    const larguras = []
    for (let b = 32; b <= 255; b++) larguras.push(f.larguras.get(b) ?? 500)
    return novoObj(
      `<< /Type /Font /Subtype /TrueType /BaseFont /${f.nome} /FirstChar 32 /LastChar 255 ` +
      `/Widths [${larguras.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${idDescritor} 0 R >>`)
  }
  const idFonteRoman = embutir(FONTES.F1, false)
  const idFonteBold = embutir(FONTES.F2, false)
  const idFonteItalic = embutir(FONTES.F3, true)

  const recursosFonte = `<< /Font << /F1 ${idFonteRoman} 0 R /F2 ${idFonteBold} 0 R /F3 ${idFonteItalic} 0 R >> >>`

  const idPaginas = paginas.map(() => novoObj(null))
  const idConteudos = paginas.map((p, i) => {
    if (p._imagem) {
      const img = p._imagem
      const idImg = novoObj({
        streamCru: img.jpeg,
        cabecalho: `<< /Type /XObject /Subtype /Image /Width ${img.largura} /Height ${img.altura} /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${img.jpeg.length} >>`,
      })
      const escalaX = LARGURA_PAGINA / img.largura
      const escalaY = ALTURA_PAGINA / img.altura
      const escala = Math.min(escalaX, escalaY)
      const w = img.largura * escala
      const h = img.altura * escala
      const x = (LARGURA_PAGINA - w) / 2
      const y = (ALTURA_PAGINA - h) / 2
      const stream = `q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Img0 Do\nQ\n`
      const comprimido = deflateSync(Buffer.from(stream, 'latin1'))
      p._recursoExtra = `<< /XObject << /Img0 ${idImg} 0 R >> >>`
      return novoObj({ streamZip: comprimido })
    }
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
    const rec = p._recursoExtra || recursosFonte
    objetos[idPaginas[i] - 1].corpo =
      `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${LARGURA_PAGINA} ${ALTURA_PAGINA}] ` +
      `/Resources ${rec} /Contents ${idConteudos[i]} 0 R` +
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
      const dicionario = o.corpo.cabecalho ?? `<< /Length ${o.corpo.streamZip.length} /Filter /FlateDecode >>`
      const cab = `${o.id} 0 obj\n${dicionario}\nstream\n`
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
