// Capas desenhadas, com identidade por tema, para o livro que não tem capa real.
//
//   node ingestao/capas-desenhadas.mjs --lista sem-capa.json --saida pasta/
//
// A capa que o site desenha na hora é uma só para todo livro — cor lisa e
// título. Quando a estante inteira é de obras do século XIX sem edição moderna,
// isso vira uma parede de retângulos iguais. Aqui cada FAMÍLIA de livro tem uma
// linguagem visual (a ideia de "identidade por coleção" do direcionamento de
// 16/09): poesia é noite estrelada, história é pergaminho com meridianos,
// filosofia é pedra com um sol, religião é vitral, teatro é cortina, ciência é
// grade, romance é moldura de livraria antiga.
//
// Regras de sempre: SVG puro, só formas e <text> (foreignObject não abre dentro
// de <img>), determinístico pelo id — o mesmo livro sai sempre igual.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Um sorteio com semente: variação entre livros, mas sempre a mesma para cada um.
function sorteio(semente) {
  let a = semente >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

function familia(temas = []) {
  const tem = (...n) => temas.some((t) => n.includes(t))
  if (tem('Poesia')) return 'poesia'
  if (tem('Teatro')) return 'teatro'
  if (tem('Direito')) return 'direito'
  if (tem('Religião', 'Espiritualidade', 'Teologia')) return 'religiao'
  if (tem('Filosofia', 'Epistemologia', 'Pensamento crítico', 'Crônica e ensaio')) return 'filosofia'
  if (tem('História', 'Biografia e memórias', 'Geopolítica', 'Política e sociedade')) return 'historia'
  if (tem('Ciência natural', 'Medicina', 'Tecnologia e IA', 'Matemática', 'Economia')) return 'ciencia'
  return 'romance'
}

const PALETAS = {
  poesia: [['#1b1f3b', '#e9e2c9', '#c9b27a'], ['#23173a', '#efe6d6', '#d1a86b'], ['#0f2a3a', '#e4ecef', '#9fc3cf']],
  teatro: [['#5a1420', '#f3e3d0', '#d8a95c'], ['#3d0f1e', '#efdcc8', '#c99a4f']],
  direito: [['#1f2b44', '#efe6d2', '#c9a86a'], ['#3a1f2b', '#efe6d2', '#c9a86a']],
  religiao: [['#152847', '#f1e8d2', '#d4b36a'], ['#2b1a3f', '#efe4d0', '#cfae68']],
  filosofia: [['#2a2c2f', '#ecebe6', '#b8b3a6'], ['#33302b', '#efe9dd', '#c4b8a0'], ['#1f2a2c', '#e8ede9', '#a9b8b2']],
  historia: [['#efe2c6', '#3b2a1a', '#8a6a3d'], ['#e8dcc0', '#2f2418', '#7d5f38'], ['#eee4cf', '#2c2a24', '#6f6552']],
  ciencia: [['#0f3b3a', '#e3f0ec', '#7cc4b5'], ['#15324a', '#e3edf5', '#86b6d9']],
  romance: [['#6b2632', '#f4e6d8', '#d9b27c'], ['#2f4a3a', '#eee8d6', '#c8b27a'], ['#6a4b1f', '#f4ead6', '#e0c089'], ['#2b3e57', '#ebe7dd', '#c9b37e']],
}

function linhas(texto, porLinha, max) {
  const out = []; let atual = ''
  for (const p of texto.split(/\s+/)) {
    if (!atual) atual = p
    else if ((atual + ' ' + p).length <= porLinha) atual += ' ' + p
    else { out.push(atual); atual = p }
  }
  if (atual) out.push(atual)
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…' }
  return out
}

// ── os ornamentos de cada família ──
const ORNAMENTO = {
  poesia: (r, [, , ouro]) => {
    let s = ''
    for (let i = 0; i < 70; i++) {
      const x = 30 + r() * 340, y = 30 + r() * 540, raio = r() < 0.12 ? 1.8 : 0.9
      if (y > 150 && y < 420) continue
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${raio}" fill="${ouro}" fill-opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`
    }
    return s + `<path d="M268 92 a34 34 0 1 0 22 60 a28 28 0 1 1 -22 -60z" fill="${ouro}" fill-opacity=".85"/>`
  },
  teatro: (r, [, , ouro]) => `
    <path d="M0 0 H400 V60 Q300 90 200 60 Q100 90 0 60Z" fill="#000" fill-opacity=".25"/>
    <path d="M0 0 Q70 300 20 600 H0Z" fill="#000" fill-opacity=".22"/><path d="M400 0 Q330 300 380 600 H400Z" fill="#000" fill-opacity=".22"/>
    <path d="M40 0 Q95 300 55 600" stroke="${ouro}" stroke-opacity=".35" fill="none"/><path d="M360 0 Q305 300 345 600" stroke="${ouro}" stroke-opacity=".35" fill="none"/>`,
  direito: (r, [, , ouro]) => `
    <rect x="24" y="24" width="352" height="552" fill="none" stroke="${ouro}" stroke-width="1.5"/>
    <rect x="32" y="32" width="336" height="536" fill="none" stroke="${ouro}" stroke-opacity=".45"/>
    <path d="M200 92 V130 M170 104 H230 M170 104 L160 124 H180Z M230 104 L220 124 H240Z" stroke="${ouro}" fill="none" stroke-width="1.4"/>`,
  religiao: (r, [, , ouro]) => `
    <path d="M110 520 V190 Q110 90 200 70 Q290 90 290 190 V520" fill="none" stroke="${ouro}" stroke-width="1.6"/>
    <path d="M126 520 V196 Q126 108 200 88 Q274 108 274 196 V520" fill="none" stroke="${ouro}" stroke-opacity=".45"/>
    <circle cx="200" cy="150" r="16" fill="none" stroke="${ouro}" stroke-opacity=".7"/>`,
  filosofia: (r, [, , ouro]) => {
    const cy = 150 + r() * 20
    let s = `<circle cx="200" cy="${cy}" r="58" fill="none" stroke="${ouro}" stroke-width="1.5"/><circle cx="200" cy="${cy}" r="6" fill="${ouro}"/>`
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      s += `<line x1="${(200 + Math.cos(a) * 68).toFixed(1)}" y1="${(cy + Math.sin(a) * 68).toFixed(1)}" x2="${(200 + Math.cos(a) * (i % 2 ? 76 : 86)).toFixed(1)}" y2="${(cy + Math.sin(a) * (i % 2 ? 76 : 86)).toFixed(1)}" stroke="${ouro}" stroke-opacity=".6"/>`
    }
    return s + `<line x1="60" y1="560" x2="340" y2="560" stroke="${ouro}" stroke-opacity=".5"/>`
  },
  historia: (r, [, tinta, ouro]) => {
    let s = ''
    for (let i = 0; i < 7; i++) s += `<path d="M${40 + i * 53} 30 Q${20 + i * 53 + r() * 40} 300 ${40 + i * 53} 570" stroke="${ouro}" stroke-opacity=".28" fill="none"/>`
    for (let i = 0; i < 5; i++) s += `<line x1="30" y1="${70 + i * 115}" x2="370" y2="${70 + i * 115}" stroke="${ouro}" stroke-opacity=".22"/>`
    return s + `<g transform="translate(322 94)"><path d="M0 -26 L6 0 L0 26 L-6 0Z" fill="${tinta}" fill-opacity=".75"/><path d="M-26 0 L0 6 L26 0 L0 -6Z" fill="${tinta}" fill-opacity=".45"/><circle r="30" fill="none" stroke="${tinta}" stroke-opacity=".5"/></g>`
  },
  ciencia: (r, [, , ouro]) => {
    let s = ''
    for (let x = 20; x < 400; x += 32) s += `<line x1="${x}" y1="0" x2="${x}" y2="600" stroke="${ouro}" stroke-opacity=".12"/>`
    for (let y = 20; y < 600; y += 32) s += `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="${ouro}" stroke-opacity=".12"/>`
    return s + `<circle cx="120" cy="120" r="44" fill="none" stroke="${ouro}" stroke-opacity=".7"/><ellipse cx="120" cy="120" rx="80" ry="22" fill="none" stroke="${ouro}" stroke-opacity=".5" transform="rotate(-25 120 120)"/>`
  },
  romance: (r, [, , ouro]) => {
    const canto = (tx, ty, rot) => `<g transform="translate(${tx} ${ty}) rotate(${rot})" stroke="${ouro}" fill="none" stroke-opacity=".8"><path d="M0 46 Q0 0 46 0"/><path d="M10 46 Q10 10 46 10" stroke-opacity=".45"/><circle cx="20" cy="20" r="4" fill="${ouro}" stroke="none"/></g>`
    return `<rect x="22" y="22" width="356" height="556" fill="none" stroke="${ouro}" stroke-opacity=".7"/>`
      + canto(34, 34, 0) + canto(366, 34, 90) + canto(366, 566, 180) + canto(34, 566, 270)
      + `<line x1="150" y1="138" x2="250" y2="138" stroke="${ouro}" stroke-opacity=".6"/><path d="M200 130 l6 8 l-6 8 l-6 -8z" fill="${ouro}"/>`
  },
}

export function capaSvg({ id, titulo, autor, temas }) {
  const fam = familia(temas)
  const r = sorteio(Number(id) * 2654435761)
  const paleta = PALETAS[fam][Math.floor(r() * PALETAS[fam].length)]
  const [fundo, tinta, ouro] = paleta

  const t = String(titulo ?? '').replace(/\s+/g, ' ').trim()
  const tam = t.length <= 18 ? 38 : t.length <= 40 ? 31 : t.length <= 75 ? 25 : 21
  const porLinha = Math.floor(300 / (tam * 0.52))
  const ls = linhas(t.length > 110 ? t.slice(0, 108) + '…' : t, porLinha, 6)
  const altura = ls.length * tam * 1.18
  const topo = 300 - altura / 2 + tam * 0.8
  const titSvg = ls.map((l, i) => `<text x="200" y="${(topo + i * tam * 1.18).toFixed(1)}" text-anchor="middle" font-family="Literata, Georgia, 'Times New Roman', serif" font-size="${tam}" font-weight="600" fill="${tinta}">${esc(l)}</text>`).join('')

  const au = linhas(String(autor ?? '').toUpperCase(), 30, 2)
  const autSvg = au.map((l, i) => `<text x="200" y="${500 + i * 18}" text-anchor="middle" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="12.5" letter-spacing="2.2" fill="${tinta}" fill-opacity=".78">${esc(l)}</text>`).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" role="img" aria-label="${esc(t)}">`
    + `<rect width="400" height="600" fill="${fundo}"/>`
    + `<defs><radialGradient id="l" cx="30%" cy="15%" r="95%"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
    + `<rect width="400" height="600" fill="url(#l)"/>`
    + ORNAMENTO[fam](r, paleta)
    + titSvg
    + `<line x1="170" y1="478" x2="230" y2="478" stroke="${ouro}" stroke-opacity=".7"/>`
    + autSvg
    + `</svg>`
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('capas-desenhadas.mjs')) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
  const lista = JSON.parse(readFileSync(arg('lista'), 'utf8'))
  const saida = arg('saida'); mkdirSync(saida, { recursive: true })
  const mapa = []
  for (const o of lista) {
    const arquivo = `des-${o.id}.svg`
    writeFileSync(join(saida, arquivo), capaSvg(o), 'utf8')
    mapa.push({ id: o.id, arquivo })
  }
  writeFileSync(join(saida, 'mapa.json'), JSON.stringify(mapa))
  console.log(`${mapa.length} capas desenhadas em ${saida}`)
}
