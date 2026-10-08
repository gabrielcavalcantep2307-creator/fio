// A CONFERÊNCIA (08/10/2026): a nota de cada texto do acervo, medida sozinha.
//
// O dono quer "todos os livros sem erro" e não quer depender de alguém abrir
// livro por livro. Esta conferência lê cada texto em português, procura o que
// um leitor veria como erro — sem julgar estilo —, e dá uma nota de 0 a 100:
//
//   caractere quebrado (�) ........ 5 pontos cada ocorrência, até 30
//   letra desconhecida (⁇) ........ 5 cada, até 30
//   lixo de transcrição ........... "[Pg 3]", "Página:...djvu/5", "Produced by"
//   inglês deixado na tradução .... por mil palavras (só em tradução nossa)
//   parágrafo repetido em sequência (laço do tradutor)
//   capítulo vazio ou quase vazio
//
// 90 ou mais: "ok". De 70 a 89: "atenção". Abaixo disso: "ruim" — e é a lista
// de "ruim", pior primeiro, que a retradutora e a revisão pegam antes de tudo.
// A conferência só LÊ: nunca troca nada no texto.

import { inglesPorMil } from './retraducao.mjs'

export function garantirTabelaConferencia(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS conferencia (
    texto_id  INTEGER PRIMARY KEY REFERENCES texto(id),
    obra_id   INTEGER NOT NULL,
    nota      INTEGER NOT NULL,
    estado    TEXT NOT NULL CHECK (estado IN ('ok','atencao','ruim')),
    problemas TEXT NOT NULL DEFAULT '{}',
    medido_em TEXT NOT NULL DEFAULT (datetime('now')))`)
  banco.exec('CREATE INDEX IF NOT EXISTS idx_conferencia_estado ON conferencia(estado, nota)')
}

const QUEBRADO = String.fromCharCode(65533)
const LIXO = /\[Pg\s*[0-9ivxlcdm]+\]|Página:[^<]{0,100}\.(djvu|pdf)\/\d+|Produced by|Distributed Proofreading|Esta página contém uma imagem|\[Illustration/gi

/** Mede uma lista de capítulos. Puro: recebe os corpos, devolve nota e problemas. */
export function medir(corpos, { traducao = false } = {}) {
  const p = { quebrados: 0, desconhecidas: 0, lixo: 0, repetidos: 0, vazios: 0, ingles: 0, palavras: 0 }
  for (const corpo of corpos) {
    p.quebrados += corpo.split(QUEBRADO).length - 1
    p.desconhecidas += corpo.split('⁇').length - 1
    p.lixo += (corpo.match(LIXO) ?? []).length
    const paragrafos = corpo.split('</p>').map((x) => x.replace(/<[^>]+>/g, '').trim()).filter((x) => x.length > 30)
    for (let i = 2; i < paragrafos.length; i++) if (paragrafos[i] === paragrafos[i - 1] && paragrafos[i] === paragrafos[i - 2]) p.repetidos++
    const palavras = corpo.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
    p.palavras += palavras
    if (palavras < 15 && corpos.length > 3) p.vazios++
  }
  if (traducao) p.ingles = inglesPorMil(corpos)
  let nota = 100
  nota -= Math.min(30, p.quebrados * 5)
  nota -= Math.min(30, p.desconhecidas * 5)
  nota -= Math.min(20, p.lixo * 2)
  nota -= Math.min(20, p.repetidos * 5)
  nota -= Math.min(10, p.vazios)
  nota -= Math.min(40, Math.round(p.ingles * 2))
  nota = Math.max(0, nota)
  return { nota, estado: nota >= 90 ? 'ok' : nota >= 70 ? 'atencao' : 'ruim', problemas: p }
}

/** Confere um texto e grava a nota. */
export function conferirTexto(banco, textoId) {
  garantirTabelaConferencia(banco)
  const t = banco.prepare('SELECT id, obra_id, fonte FROM texto WHERE id = ?').get(textoId)
  if (!t) return null
  const corpos = banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem').all(textoId).map((c) => c.corpo)
  const m = medir(corpos, { traducao: t.fonte === 'fio_traducao' })
  banco.prepare(`INSERT INTO conferencia (texto_id, obra_id, nota, estado, problemas, medido_em) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(texto_id) DO UPDATE SET nota = excluded.nota, estado = excluded.estado, problemas = excluded.problemas, medido_em = excluded.medido_em`)
    .run(textoId, t.obra_id, m.nota, m.estado, JSON.stringify(m.problemas))
  return m
}

/** Confere os textos que nunca foram medidos ou foram medidos há mais de `dias`; no máximo `limite` por chamada. */
export function conferirPendentes(banco, { limite = 400, dias = 7 } = {}) {
  garantirTabelaConferencia(banco)
  const ids = banco.prepare(`SELECT t.id FROM texto t LEFT JOIN conferencia c ON c.texto_id = t.id
    WHERE t.dono_id IS NULL AND t.idioma = 'pt' AND (c.texto_id IS NULL OR c.medido_em < datetime('now', ?))
    ORDER BY c.medido_em IS NOT NULL, c.medido_em LIMIT ?`).all(`-${dias} days`, limite).map((r) => r.id)
  for (const id of ids) conferirTexto(banco, id)
  return ids.length
}

/** O resumo para o painel: quantos em cada estado e os piores. */
export function resumo(banco, quantos = 30) {
  garantirTabelaConferencia(banco)
  const conta = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM conferencia GROUP BY estado').all().map((r) => [r.estado, r.n]))
  const piores = banco.prepare(`SELECT c.texto_id, c.obra_id, c.nota, c.estado, c.problemas, COALESCE(o.titulo_pt, o.titulo) titulo, t.fonte
    FROM conferencia c JOIN obra o ON o.id = c.obra_id JOIN texto t ON t.id = c.texto_id
    WHERE c.estado <> 'ok' ORDER BY c.nota ASC LIMIT ?`).all(quantos).map((r) => ({ ...r, problemas: JSON.parse(r.problemas) }))
  const total = banco.prepare('SELECT COUNT(*) n FROM conferencia').get().n
  return { total, conta, piores }
}
