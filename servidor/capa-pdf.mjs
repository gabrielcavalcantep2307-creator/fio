// A capa que o PDF desenha sozinho.
//
// Até 22/09 o PDF tinha dois caminhos, e os dois eram ruins. Quando a obra
// tinha foto de capa no Open Library, a foto entrava de página inteira — só
// que foto do Open Library é a digitalização da capa de uma EDIÇÃO COMERCIAL
// de outra editora, com a arte e o texto de venda dela ("o livro que inspira
// líderes há mais de dois milênios"). Como miniatura de catálogo isso se
// defende; estampado na capa de um arquivo que a pessoa baixa e repassa, não.
// E quando não havia foto — que é a maioria do acervo, porque quase todo
// livro aqui usa capa desenhada em SVG — sobrava um painel de cor só, igual
// para todos.
//
// Agora é uma capa só, nossa, desenhada no próprio PDF. Ela segue as mesmas
// FAMÍLIAS de `ingestao/capas-desenhadas.mjs`: o livro de poesia e o de
// direito não têm a mesma cara, e a cara de cada um é a mesma no site e no
// arquivo baixado.
//
// Este arquivo não sabe nada de PDF de propósito: devolve paleta e uma lista
// de formas em coordenadas de 0 a 1, e quem desenha é `pdf.mjs`. Assim dá
// para medir a escolha sem montar documento nenhum.

// fundo, texto claro, acento — as mesmas de `ingestao/capas-desenhadas.mjs`
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

export function familiaDe(temas = []) {
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

/** Sorteio com semente: varia entre livros, e o mesmo livro sai sempre igual. */
function sorteio(semente) {
  let a = semente >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── o ornamento ──
//
// Só retângulos e linhas retas, porque é só isso que `pdf.mjs` sabe pintar —
// e porque uma faixa geométrica bem posta envelhece melhor que um desenho
// mal-acabado. Cada família tem a sua, e todas ocupam a MESMA faixa da
// página, entre 0,62 e 0,88 da altura: o bloco de texto embaixo não muda de
// lugar de um livro para o outro.
const ORNAMENTOS = {
  // céu de versos
  poesia: (r) => {
    const f = []
    for (let i = 0; i < 40; i++) {
      const lado = 0.004 + r() * 0.006
      f.push({ tipo: 'ret', x: 0.1 + r() * 0.8, y: 0.63 + r() * 0.24, w: lado, h: lado * 0.75, cor: 'acento' })
    }
    return f
  },
  // cortina: barras verticais de alturas alternadas
  teatro: (r) => Array.from({ length: 14 }, (_, i) => ({
    tipo: 'ret', x: 0.12 + i * 0.056, y: 0.62, w: 0.026, h: 0.14 + (i % 2 ? 0.08 : 0.02) + r() * 0.04, cor: 'acento',
  })),
  // colunas
  direito: () => Array.from({ length: 5 }, (_, i) => ({
    tipo: 'ret', x: 0.24 + i * 0.13, y: 0.64, w: 0.035, h: 0.2, cor: 'acento',
  })).concat([
    { tipo: 'ret', x: 0.2, y: 0.85, w: 0.6, h: 0.012, cor: 'acento' },
    { tipo: 'ret', x: 0.2, y: 0.618, w: 0.6, h: 0.012, cor: 'acento' },
  ]),
  // vitral
  religiao: () => {
    const f = []
    for (let c = 0; c < 5; c++) {
      for (let l = 0; l < 3; l++) {
        f.push({ tipo: 'ret', x: 0.235 + c * 0.11, y: 0.64 + l * 0.075, w: 0.085, h: 0.055, cor: l === 1 && c === 2 ? 'claro' : 'acento' })
      }
    }
    return f
  },
  // a pedra: um quadrado vazado
  filosofia: () => [
    { tipo: 'linha', x1: 0.34, y1: 0.63, x2: 0.66, y2: 0.63, cor: 'acento', espessura: 1.1 },
    { tipo: 'linha', x1: 0.34, y1: 0.87, x2: 0.66, y2: 0.87, cor: 'acento', espessura: 1.1 },
    { tipo: 'linha', x1: 0.34, y1: 0.63, x2: 0.34, y2: 0.87, cor: 'acento', espessura: 1.1 },
    { tipo: 'linha', x1: 0.66, y1: 0.63, x2: 0.66, y2: 0.87, cor: 'acento', espessura: 1.1 },
    { tipo: 'ret', x: 0.46, y: 0.72, w: 0.08, h: 0.06, cor: 'acento' },
  ],
  // meridianos
  historia: (r) => Array.from({ length: 9 }, (_, i) => ({
    tipo: 'linha', x1: 0.16 + r() * 0.06, y1: 0.63 + i * 0.03, x2: 0.84 - r() * 0.06, y2: 0.63 + i * 0.03,
    cor: 'acento', espessura: i === 4 ? 1.4 : 0.6,
  })),
  // grade
  ciencia: () => {
    const f = []
    for (let i = 0; i <= 8; i++) f.push({ tipo: 'linha', x1: 0.24 + i * 0.065, y1: 0.63, x2: 0.24 + i * 0.065, y2: 0.87, cor: 'acento', espessura: 0.5 })
    for (let i = 0; i <= 6; i++) f.push({ tipo: 'linha', x1: 0.24, y1: 0.63 + i * 0.04, x2: 0.76, y2: 0.63 + i * 0.04, cor: 'acento', espessura: 0.5 })
    return f
  },
  // moldura de livraria antiga: filete grosso por fora, fino por dentro
  romance: () => [
    ...[[0.22, 0.63, 0.78, 0.63], [0.22, 0.88, 0.78, 0.88], [0.22, 0.63, 0.22, 0.88], [0.78, 0.63, 0.78, 0.88]]
      .map(([x1, y1, x2, y2]) => ({ tipo: 'linha', x1, y1, x2, y2, cor: 'acento', espessura: 1.6 })),
    ...[[0.25, 0.645, 0.75, 0.645], [0.25, 0.865, 0.75, 0.865], [0.25, 0.645, 0.25, 0.865], [0.75, 0.645, 0.75, 0.865]]
      .map(([x1, y1, x2, y2]) => ({ tipo: 'linha', x1, y1, x2, y2, cor: 'acento', espessura: 0.5 })),
    { tipo: 'ret', x: 0.485, y: 0.742, w: 0.03, h: 0.026, cor: 'acento' },
  ],
}

/**
 * A capa deste livro: paleta e formas, em coordenadas de 0 a 1 (x da
 * esquerda, y de BAIXO para cima, como o PDF conta).
 *
 * @param {number} id o id da obra — é o que torna a escolha estável
 * @param {string[]} temas os temas da obra, como no site
 */
export function capaDe(id, temas = []) {
  const familia = familiaDe(temas)
  const r = sorteio((Number(id) || 1) * 2654435761)
  const opcoes = PALETAS[familia]
  const [fundo, claro, acento] = opcoes[Math.floor(r() * opcoes.length)]
  return { familia, fundo, claro, acento, formas: ORNAMENTOS[familia](r) }
}
