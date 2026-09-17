// A imagem que um leitor manda: capa ou página de publicação.
//
// **O que se aceita.** JPEG, PNG e WebP estático — e nada mais. SVG não (é
// documento com script dentro), GIF não, HEIC não. O tipo é decidido pelos
// BYTES, nunca pelo nome do arquivo nem pelo `content-type` que o navegador
// diz: quem manda escolhe o que escrever nos dois.
//
// **O que se faz com ela.** Não se decodifica a imagem (não há biblioteca de
// imagem aqui, e decodificar é justamente onde mora a falha de biblioteca).
// Em vez disso o arquivo é DESMONTADO nos seus blocos e remontado só com os
// blocos que desenham a imagem:
//
//   - some o que vem depois do fim da imagem (é onde se esconde o arquivo
//     "poliglota": um JPEG válido com um HTML ou um ZIP colado atrás);
//   - somem os metadados — EXIF, XMP, comentários, texto de PNG. Além de
//     esconderijo, o EXIF de foto de celular traz o GPS de onde ela foi tirada;
//   - bloco malformado, tamanho que não fecha, CRC errado: recusa inteira.
//
// Depois disso ela é servida com o tipo que ESTE arquivo decidiu, `nosniff` e
// uma CSP que proíbe tudo — ver `servirArquivo` em publicacoes.mjs.

import { crc32 } from 'node:zlib'

export class ImagemRecusada extends Error {
  constructor(msg) { super(msg); this.status = 415 }
}

const recusa = (msg) => { throw new ImagemRecusada(msg) }

export const MAX_LADO = 16000          // tirinha de webtoon é alta; mais que isso é armadilha
export const MAX_PIXELS = 90_000_000   // "bomba" de descompressão no navegador de quem lê

/** Que tipo é, olhando os primeiros bytes. */
export function tipoDe(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return null
}

export const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export const EXTENSAO = { jpeg: 'jpg', png: 'png', webp: 'webp' }

function conferirLados(largura, altura) {
  if (!(largura > 0 && altura > 0)) recusa('A imagem não diz o próprio tamanho.')
  if (largura > MAX_LADO || altura > MAX_LADO) recusa(`Imagem grande demais: até ${MAX_LADO} px de lado.`)
  if (largura * altura > MAX_PIXELS) recusa('Imagem grande demais em pixels.')
  return { largura, altura }
}

// ── PNG ──────────────────────────────────────────────────────
// Blocos que desenham. O resto (tEXt, iTXt, zTXt, eXIf, tIME e os privados)
// cai fora. APNG (acTL/fcTL/fdAT) não entra: animação não é página.
const PNG_FICA = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD'])

function limparPng(b) {
  const partes = [b.subarray(0, 8)]
  let p = 8, dims = null, viuIend = false, primeiro = true
  while (p < b.length) {
    if (p + 12 > b.length) recusa('PNG cortado.')
    const tam = b.readUInt32BE(p)
    const tipo = b.toString('latin1', p + 4, p + 8)
    if (!/^[A-Za-z]{4}$/.test(tipo)) recusa('PNG com bloco estranho.')
    const fim = p + 12 + tam
    if (tam > 0x7fffffff || fim > b.length) recusa('PNG com bloco maior que o arquivo.')
    const crcLido = b.readUInt32BE(p + 8 + tam)
    if (crc32(b.subarray(p + 4, p + 8 + tam)) !== crcLido) recusa('PNG corrompido (CRC).')
    if (primeiro && tipo !== 'IHDR') recusa('PNG sem cabeçalho.')
    if (tipo === 'acTL') recusa('PNG animado não é aceito.')
    if (tipo === 'IHDR') {
      if (!primeiro || tam !== 13) recusa('PNG com cabeçalho estranho.')
      dims = conferirLados(b.readUInt32BE(p + 8), b.readUInt32BE(p + 12))
    }
    primeiro = false
    if (PNG_FICA.has(tipo)) partes.push(b.subarray(p, fim))
    p = fim
    if (tipo === 'IEND') { viuIend = true; break } // o que vier depois fica para trás
  }
  if (!viuIend || !dims) recusa('PNG incompleto.')
  return { bytes: Buffer.concat(partes), ...dims }
}

// ── JPEG ─────────────────────────────────────────────────────
// Ficam as tabelas, os quadros e os dados; APP0 (JFIF), APP2 (perfil de cor)
// e APP14 (Adobe, que diz como ler as cores). Saem APP1 (EXIF/XMP), os outros
// APPn e os comentários.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function limparJpeg(b) {
  const partes = [Buffer.from([0xff, 0xd8])]
  let p = 2, dims = null, viuEoi = false, viuScan = false
  while (p < b.length) {
    if (b[p] !== 0xff) recusa('JPEG malformado.')
    while (b[p] === 0xff && p < b.length) p++ // preenchimento entre marcadores
    const m = b[p]; p++
    if (m === undefined) break
    if (m === 0xd9) { partes.push(Buffer.from([0xff, 0xd9])); viuEoi = true; break }
    if (m >= 0xd0 && m <= 0xd7) continue
    if (m === 0x01 || m === 0xd8) recusa('JPEG malformado.')
    if (p + 2 > b.length) recusa('JPEG cortado.')
    const tam = b.readUInt16BE(p)
    if (tam < 2 || p + tam > b.length) recusa('JPEG com bloco maior que o arquivo.')
    const bloco = b.subarray(p - 2, p + tam)
    if (SOF.has(m)) {
      if (tam < 8) recusa('JPEG com quadro estranho.')
      dims = conferirLados(b.readUInt16BE(p + 5), b.readUInt16BE(p + 3))
    }
    const fica = SOF.has(m) || [0xc4, 0xcc, 0xdb, 0xdd, 0xda, 0xe0, 0xe2, 0xee].includes(m)
    if (fica) partes.push(bloco)
    p += tam
    if (m === 0xda) {
      // Depois do cabeçalho do scan vêm os dados codificados, que não têm
      // tamanho: andam até o próximo marcador que não seja FF00 nem RSTn.
      viuScan = true
      const inicio = p
      while (p < b.length) {
        if (b[p] === 0xff) {
          const s = b[p + 1]
          if (s === 0x00 || (s >= 0xd0 && s <= 0xd7) || s === 0xff) { p += s === 0xff ? 1 : 2; continue }
          break
        }
        p++
      }
      partes.push(b.subarray(inicio, p))
    }
  }
  if (!viuEoi || !viuScan || !dims) recusa('JPEG incompleto.')
  return { bytes: Buffer.concat(partes), ...dims }
}

// ── WebP ─────────────────────────────────────────────────────
function limparWebp(b) {
  const declarado = b.readUInt32LE(4) + 8
  if (declarado > b.length || declarado < 20) recusa('WebP cortado.')
  const corpo = [], p0 = 12
  let p = p0, dims = null, vp8x = null
  while (p + 8 <= declarado) {
    const tipo = b.toString('latin1', p, p + 4)
    const tam = b.readUInt32LE(p + 4)
    const fim = p + 8 + tam + (tam & 1)
    if (fim > declarado) recusa('WebP com bloco maior que o arquivo.')
    const dados = b.subarray(p + 8, p + 8 + tam)
    if (tipo === 'ANIM' || tipo === 'ANMF') recusa('WebP animado não é aceito.')
    if (tipo === 'VP8X') {
      if (tam < 10) recusa('WebP com cabeçalho estranho.')
      vp8x = Buffer.from(b.subarray(p, fim))
      dims = conferirLados(1 + dados.readUIntLE(4, 3), 1 + dados.readUIntLE(7, 3))
    } else if (tipo === 'VP8 ') {
      if (tam < 10 || dados[3] !== 0x9d || dados[4] !== 0x01 || dados[5] !== 0x2a) recusa('WebP com imagem estranha.')
      dims ??= conferirLados(dados.readUInt16LE(6) & 0x3fff, dados.readUInt16LE(8) & 0x3fff)
      corpo.push(b.subarray(p, fim))
    } else if (tipo === 'VP8L') {
      if (tam < 5 || dados[0] !== 0x2f) recusa('WebP com imagem estranha.')
      const bits = dados.readUInt32LE(1)
      dims ??= conferirLados((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
      corpo.push(b.subarray(p, fim))
    } else if (tipo === 'ALPH' || tipo === 'ICCP') {
      corpo.push(b.subarray(p, fim))
    } // EXIF, XMP e o resto: fora
    p = fim
  }
  if (!dims || !corpo.some((c) => /^VP8[ L]/.test(c.toString('latin1', 0, 4)))) recusa('WebP sem imagem.')
  if (vp8x) vp8x[8] &= ~(0x08 | 0x04 | 0x02) // sem EXIF, sem XMP, sem animação
  const tudo = Buffer.concat([...(vp8x ? [vp8x] : []), ...corpo])
  const cab = Buffer.alloc(12)
  cab.write('RIFF', 0, 'latin1'); cab.writeUInt32LE(tudo.length + 4, 4); cab.write('WEBP', 8, 'latin1')
  return { bytes: Buffer.concat([cab, tudo]), ...dims }
}

/**
 * Confere e limpa. Devolve `{ tipo, mime, extensao, bytes, largura, altura }`
 * ou lança `ImagemRecusada` com um motivo que dá para mostrar a quem enviou.
 */
export function limparImagem(bytes, { teto = 5 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) recusa('Arquivo vazio.')
  if (bytes.length > teto) recusa(`Imagem grande demais: até ${Math.round(teto / 1024 / 1024)} MB.`)
  const tipo = tipoDe(bytes)
  if (!tipo) recusa('Só aceitamos imagem JPG, PNG ou WebP.')
  let r
  try {
    r = tipo === 'png' ? limparPng(bytes) : tipo === 'jpeg' ? limparJpeg(bytes) : limparWebp(bytes)
  } catch (e) {
    if (e instanceof ImagemRecusada) throw e
    recusa('Imagem corrompida ou malformada.') // leitura fora do buffer etc.
  }
  if (tipoDe(r.bytes) !== tipo) recusa('Imagem malformada.')
  return { tipo, mime: MIME[tipo], extensao: EXTENSAO[tipo], ...r }
}
