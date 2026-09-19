// Onde o livro começa de verdade.
//
// Clicar em "Começar a ler" no "Quincas Borba" abria no capítulo 1, que é a
// lista das OUTRAS obras de Machado impressa pelo editor em 1891. Nada errado
// com guardar essa página — ela é parte do exemplar — mas ela não é por onde
// se começa a ler um romance, e 582 obras do acervo abriam assim.
//
// Aqui não se APAGA folha de rosto: ela continua no sumário para quem quiser.
// Só se decide em que capítulo o leitor entra quando ainda não tem marca de
// onde parou.
//
// Este módulo mora em `servidor/` e não em `ingestao/` porque os DOIS
// precisam dele: `publicar.mjs` põe o número na ficha estática, e `api.mjs` o
// põe na resposta do leitor. A primeira versão vivia só na publicação — e o
// leitor, que busca o livro pela API, continuou abrindo na folha de rosto
// mesmo depois de "consertado". Uma regra em dois lugares é uma regra que vai
// divergir; em nenhum dos dois, é um conserto que não conserta.

/** Palavras que denunciam folha de rosto, índice ou catálogo do editor. */
const ROSTO = /\b(obras do autor|do mesmo autor|obras do mesmo|índice|indice|sumário|sumario|frontispício|typographia|tipografia|livraria editora|livraria de|impressa por|table of contents|all rights reserved)\b/i

/** Abaixo disto ainda é aparato, não é o livro. */
const PARECE_LIVRO = 200

/** Quantos capítulos do começo podem ser aparato antes de a gente desistir. */
const ATE_O_CAPITULO = 4

/** O título do capítulo um. Sem prefixo, só "I" ou "1" (um título "Um dia" não conta). */
const CAPITULO_UM = /^(?:(?:cap[íi]tulo|chapter|parte|livro|canto|book|part)\s+(?:i|1|um|primeiro|primeira|one|first)|(?:primeira|first)\s+(?:parte|part)|(?:parte|livro|canto)\s+primeir[ao]|i|1)(?:\s*(?:[—–-]|[.:](?=\s|$|[—–-])).*)?$/i

/** Título que já é número de seção ("II", "3."): antes do "I", o livro já começou. */
const NUMERAL = /^(?:[ivxlc]+|\d+)\.?$/i

/** O que vem antes do capítulo um só é pulado se for curto: prefácio longo é livro. */
const ANTES_DO_UM = 1500

/**
 * @param caps capítulos em ordem, cada um com `{ ordem, palavras, corpo?, titulo? }`.
 *             `corpo` é opcional: sem ele decide-se só por tamanho e título,
 *             que é pior mas não quebra.
 * @returns a ordem do primeiro capítulo que é livro
 */
export function ondeComecaOLivro(caps) {
  if (!caps?.length) return 1

  // O jeito mais seguro de achar o começo: um capítulo que SE CHAMA o
  // primeiro ("I", "Capítulo I", "Chapter 1", "Primeira parte") logo no
  // início, com só coisa curta antes dele. Achado na varredura de 19/09/2026:
  // O Cortiço abria numa página de epígrafes ("PARIS", com Cícero e o Jornal
  // de Timon) seguida do índice — nenhuma das duas tem palavra de editora, e
  // a regra de baixo deixava passar.
  const primeiro = caps.findIndex((c, k) => k > 0 && k <= ATE_O_CAPITULO && CAPITULO_UM.test(String(c.titulo ?? '').trim()))
  const tituloDe = (c) => String(c.titulo ?? '').trim()
  if (primeiro > 0 && caps.slice(0, primeiro).every((c) => (c.palavras ?? 0) < ANTES_DO_UM
    && !NUMERAL.test(tituloDe(c)) && !CAPITULO_UM.test(tituloDe(c)))) return caps[primeiro].ordem

  let i = 0
  while (i < caps.length && i < ATE_O_CAPITULO) {
    const c = caps[i]
    // O título quase nunca denuncia: a folha de rosto costuma vir sem título
    // nenhum. Quem denuncia é o começo do corpo — "Livraria de Antonio Maria
    // Pereira, Editor", "Typographia de A. J. da Silva Teixeira".
    const inicio = (c.corpo ?? '').replace(/<[^>]*>/g, ' ').slice(0, 300)
    const aparato = c.palavras < 60 || ROSTO.test(inicio) || ROSTO.test(c.titulo ?? '')
    if (!aparato) break
    i++
  }
  if (!i) return caps[0].ordem

  // Só pula se sobrar livro depois. Um volume que seja SÓ folha de rosto tem
  // que abrir na folha de rosto — melhor uma página estranha que uma vazia.
  const adiante = caps.slice(i).some(c => c.palavras >= PARECE_LIVRO)
  return adiante ? caps[i].ordem : caps[0].ordem
}
