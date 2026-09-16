// A capa que a lei nunca teve.
//
//   node ingestao/capas-de-lei.mjs --lista leis.json --saida pasta/
//
// A lei é livre por lei (Lei 9.610/98, art. 8º, IV) e por isso NENHUMA loja
// vende uma edição com capa: não há capa para a Open Library servir, e a capa
// que o site desenha para qualquer livro sem foto trata a Constituição como
// trata um romance obscuro. Uma lei merece cara de lei.
//
// Então desenhamos uma de propósito: uma capa de edição oficial — moldura
// dourada, o TIPO do ato em destaque (Constituição, Código, Lei…), o nome
// inteiro, o ano, e a nota de que o texto é oficial e de domínio público. SVG
// puro, só formas e `<text>` (nada de `<foreignObject>`, que não abre dentro
// de uma `<img>`), e determinístico: a mesma lei sai sempre igual.
//
// Fica em `/capas/lei-{id}.svg`, e como a capa LOCAL vence a desenhada e a da
// Open Library, é ela que aparece na estante e na ficha assim que o catálogo
// é republicado.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

// Fundos sóbrios de edição jurídica. A tinta é sempre o dourado/pergaminho.
const FUNDOS = ['#3a1f2b', '#1f2b44', '#20362b', '#2a2f3a', '#3a2740', '#1e3536', '#402a1e']
const OURO = '#c9a86a'
const PERGAMINHO = '#efe6d2'

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')

function fundoDe(chave) {
  let h = 0
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0
  return FUNDOS[h % FUNDOS.length]
}

// O tipo do ato, tirado do próprio nome. É o que a capa põe grande no alto.
function tipoDe(titulo) {
  const t = semAcento(titulo).toLowerCase()
  if (t.startsWith('constituicao')) return 'CONSTITUIÇÃO'
  if (t.startsWith('consolidacao')) return 'CONSOLIDAÇÃO'
  if (t.startsWith('codigo')) return 'CÓDIGO'
  if (t.startsWith('lei')) return 'LEI'
  if (t.startsWith('decreto')) return 'DECRETO'
  if (t.startsWith('estatuto')) return 'ESTATUTO'
  return 'ATO OFICIAL'
}

// O nome que sobra depois de tirar o tipo, para não repetir "CÓDIGO" embaixo
// de "CÓDIGO". Se sobrar pouco, mantém o nome inteiro.
function resto(titulo, tipo) {
  const semTipo = titulo.replace(new RegExp('^\\s*' + tipo, 'i'), '').replace(/^[\s—–-]+/, '').trim()
  return semTipo.length >= 3 ? semTipo : titulo
}

// Quebra em linhas por largura aproximada de caractere (não há como medir
// texto sem um navegador; a régua é o número de letras por linha).
function emLinhas(texto, porLinha) {
  const palavras = texto.split(/\s+/)
  const linhas = []
  let atual = ''
  for (const p of palavras) {
    if (!atual) atual = p
    else if ((atual + ' ' + p).length <= porLinha) atual += ' ' + p
    else { linhas.push(atual); atual = p }
  }
  if (atual) linhas.push(atual)
  return linhas
}

const escapar = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function capaSvg({ id, titulo, ano }) {
  const fundo = fundoDe(`${id}:${titulo}`)
  const tipo = tipoDe(titulo)
  const nome = resto(titulo, tipo)

  // corpo do nome conforme o tamanho
  const porLinha = nome.length > 40 ? 16 : 14
  const linhas = emLinhas(nome, porLinha).slice(0, 5)
  const corpo = linhas.length > 3 ? 30 : 36
  const alturaBloco = linhas.length * corpo * 1.16
  const y0 = 300 - alturaBloco / 2 + corpo * 0.7

  const nomeSvg = linhas.map((l, i) =>
    `<text x="200" y="${(y0 + i * corpo * 1.16).toFixed(1)}" text-anchor="middle" ` +
    `font-family="Literata, Georgia, serif" font-size="${corpo}" font-weight="600" ` +
    `fill="${PERGAMINHO}">${escapar(l)}</text>`).join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" role="img" aria-label="${escapar(titulo)}">
  <rect width="400" height="600" fill="${fundo}"/>
  <rect width="400" height="600" fill="url(#g)"/>
  <defs><radialGradient id="g" cx="32%" cy="16%" r="90%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient></defs>
  <rect x="24" y="24" width="352" height="552" fill="none" stroke="${OURO}" stroke-opacity="0.85" stroke-width="1.5"/>
  <rect x="32" y="32" width="336" height="536" fill="none" stroke="${OURO}" stroke-opacity="0.45" stroke-width="0.8"/>
  <!-- ornamento: um losango entre dois filetes -->
  <line x1="120" y1="120" x2="185" y2="120" stroke="${OURO}" stroke-opacity="0.7"/>
  <line x1="215" y1="120" x2="280" y2="120" stroke="${OURO}" stroke-opacity="0.7"/>
  <path d="M200 112 L208 120 L200 128 L192 120 Z" fill="${OURO}" fill-opacity="0.85"/>
  <text x="200" y="164" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="15" letter-spacing="4" fill="${OURO}">${escapar(tipo)}</text>
  ${nomeSvg}
  <line x1="150" y1="452" x2="250" y2="452" stroke="${OURO}" stroke-opacity="0.6"/>
  ${ano ? `<text x="200" y="486" text-anchor="middle" font-family="Literata, Georgia, serif" font-size="22" fill="${OURO}">${escapar(String(ano))}</text>` : ''}
  <text x="200" y="540" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" letter-spacing="1.5" fill="${PERGAMINHO}" fill-opacity="0.62">TEXTO OFICIAL · DOMÍNIO PÚBLICO</text>
</svg>`
}

// ── principal ──
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('capas-de-lei.mjs')) {
  const lista = JSON.parse(readFileSync(arg('lista'), 'utf8'))
  const saida = arg('saida', 'capas-lei')
  mkdirSync(saida, { recursive: true })
  const feitas = []
  for (const o of lista) {
    const arquivo = `lei-${o.id}.svg`
    writeFileSync(join(saida, arquivo), capaSvg(o), 'utf8')
    feitas.push({ id: o.id, arquivo })
  }
  writeFileSync(join(saida, 'mapa.json'), JSON.stringify(feitas), 'utf8')
  console.log(`${feitas.length} capas de lei em ${saida}`)
}
