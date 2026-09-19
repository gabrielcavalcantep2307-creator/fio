// A nota do OCR de cada livro escaneado (19/09/2026).
//
// Formatar não salva um texto que a máquina leu errado: "N- 33 ll.lOH
// i.rriK)-i\i'." continua ilegível arrumado em parágrafos. A nota mede a
// fração das palavras do livro que existem nos livros LIMPOS do acervo
// (Gutenberg e Wikisource, 311 mil palavras com a ortografia antiga junto).
// Um livro bom de archive.org fica acima de 0,9; um ilegível, abaixo de 0,75.
//
// Quem calcula é `node ingestao/medir-ocr.mjs` (leva uns 20 minutos num
// núcleo; rodar de novo quando entrar leva nova de archive.org). O resto do
// sistema só lê:
//
//   - a vitrine não põe no Google (noindex, fora do sitemap) livro abaixo
//     de LIMIAR_GOOGLE;
//   - o leitor mostra um aviso honesto antes do texto abaixo de LIMIAR_AVISO.

export const LIMIAR_AVISO = 0.85
export const LIMIAR_GOOGLE = 0.85

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS nota_ocr (
    obra_id    INTEGER PRIMARY KEY,
    nota       REAL NOT NULL,
    medido_em  TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
}

let guardado = { em: 0, mapa: new Map() }
/** Todas as notas, relidas a cada 10 minutos (são poucos milhares). */
export function notas(banco) {
  if (Date.now() - guardado.em > 10 * 60_000) {
    try { guardado = { em: Date.now(), mapa: new Map(banco.prepare('SELECT obra_id, nota FROM nota_ocr').all().map((l) => [l.obra_id, l.nota])) } } catch { guardado = { em: Date.now(), mapa: new Map() } }
  }
  return guardado.mapa
}

export const notaDe = (banco, obraId) => notas(banco).get(Number(obraId)) ?? null

export function avisoDeOcr(nota) {
  if (nota == null || nota >= LIMIAR_AVISO) return null
  return nota < 0.75
    ? 'Esta digitalização saiu com muitos erros de leitura automática (OCR): trechos inteiros podem estar ilegíveis. Estamos procurando uma edição melhor.'
    : 'Esta digitalização tem erros de leitura automática (OCR): algumas palavras saíram trocadas.'
}
