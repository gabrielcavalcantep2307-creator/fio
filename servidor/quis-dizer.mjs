// "Você quis dizer…": a busca que aguenta erro de digitação (19/09/2026).
//
// Na varredura de bugs, "dom casmuro" (um R a menos) não achava nada — nem o
// livro, nem trecho nenhum. Para quem digita rápido no celular, isso é o site
// dizer que não tem Dom Casmurro. A busca dentro dos livros (FTS5) é literal
// de propósito; esta fica do lado: quando ela acha pouco, compara as palavras
// digitadas com as dos TÍTULOS e AUTORES do que dá para ler aqui, aceitando
// uma letra errada em palavra curta e duas em palavra longa.
//
// Custo: o vocabulário dos títulos (uns 10 mil termos) fica em memória e é
// refeito a cada 10 minutos; cada busca compara as palavras digitadas só com
// ele, não com cada livro.

import { ondeComecaOLivro } from './folha-de-rosto.mjs'

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const palavras = (s) => semAcento(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3)
const VAZIAS = new Set(['dos', 'das', 'uma', 'uns', 'com', 'por', 'para', 'the', 'and', 'que', 'nos', 'nas'])

/** Distância de edição com teto: passou do teto, para de contar. */
function distancia(a, b, teto) {
  if (Math.abs(a.length - b.length) > teto) return teto + 1
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const agora = [i]
    let menor = i
    for (let j = 1; j <= b.length; j++) {
      agora[j] = Math.min(antes[j] + 1, agora[j - 1] + 1, antes[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (agora[j] < menor) menor = agora[j]
    }
    if (menor > teto) return teto + 1
    antes = agora
  }
  return antes[b.length]
}

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const html = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPE[c])

export function criarQuisDizer(banco, { jurisdicao = 'BR' } = {}) {
  let indice = null, feitoEm = 0

  function montar() {
    const obras = banco.prepare(`
      SELECT o.id, COALESCE(o.titulo_pt, o.titulo) titulo,
             (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
               WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor,
             (SELECT t.id FROM texto t JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
                AND d.estado IN ('dominio_publico','licenca_livre')
               WHERE t.obra_id = o.id AND t.idioma = 'pt' AND t.normalizado = 1 LIMIT 1) texto
        FROM obra o WHERE o.publicada = 1`).all(jurisdicao).filter((o) => o.texto)
    const vocab = new Map() // termo → Set de índices de obra
    obras.forEach((o, i) => {
      for (const p of new Set(palavras(`${o.titulo} ${o.autor ?? ''}`))) {
        if (!vocab.has(p)) vocab.set(p, new Set())
        vocab.get(p).add(i)
      }
    })
    indice = { obras, vocab }
    feitoEm = Date.now()
  }

  const capitulos = banco.prepare('SELECT ordem, titulo, palavras, substr(corpo, 1, 400) corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem LIMIT 8')

  /** Até `quantos` obras cujo título/autor casam com TODAS as palavras, com erro. */
  return function quisDizer(termo, { quantos = 3, fora = new Set() } = {}) {
    const q = palavras(termo).filter((p) => !VAZIAS.has(p)).slice(0, 6)
    if (!q.length) return []
    if (!indice || Date.now() - feitoEm > 10 * 60_000) montar()
    // para cada palavra digitada: as obras que têm um termo parecido, e o quão parecido
    const porPalavra = q.map((p) => {
      const teto = p.length >= 7 ? 2 : p.length >= 4 ? 1 : 0
      const nota = new Map()
      for (const [termo2, obras] of indice.vocab) {
        const d = termo2 === p ? 0 : termo2.startsWith(p) && p.length >= 4 ? 0.5 : distancia(p, termo2, teto)
        if (d > teto) continue
        for (const i of obras) if (!nota.has(i) || nota.get(i) > d) nota.set(i, d)
      }
      return nota
    })
    const candidatos = [...porPalavra[0].keys()].filter((i) => porPalavra.every((m) => m.has(i)))
    const exatas = candidatos.filter((i) => porPalavra.every((m) => m.get(i) === 0))
    // Tudo exato: a busca normal já deu conta, não há o que "quis dizer".
    if (exatas.length === candidatos.length) return []
    return candidatos
      .map((i) => ({ i, erro: porPalavra.reduce((n, m) => n + m.get(i), 0) }))
      .sort((a, b) => a.erro - b.erro)
      .map(({ i }) => indice.obras[i])
      .filter((o) => !fora.has(o.id))
      .slice(0, quantos)
      .map((o) => {
        // o subtítulo que vem depois de uma quebra de linha fica de fora
        const titulo = String(o.titulo).split(/[\r\n]+/)[0].trim()
        return {
          obra: o.id,
          titulo,
          autor: o.autor ?? 'autoria não identificada',
          capitulo: ondeComecaOLivro(capitulos.all(o.texto)),
          capituloTitulo: null,
          trecho: `Você quis dizer <mark>${html(titulo)}</mark>${o.autor ? `, de ${html(o.autor)}` : ''}?`,
          outros: 0,
          sugestao: true,
        }
      })
  }
}
