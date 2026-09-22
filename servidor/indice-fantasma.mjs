// O índice do livro impresso que vira capítulo
//
// Livro digitalizado quase sempre traz, na frente, o índice da edição de
// papel. O divisor de `servicos/traducao.mjs` não tem como saber que aquilo é
// índice: cada linha dali É um cabeçalho de capítulo perfeito, e é por isso
// que ele morde. O estrago aparece de duas formas, e o leitor vê as duas como
// "o livro está bugado":
//
//   ENGOLIDO  — o índice inteiro virou o CORPO de um capítulo, e sai como um
//               parágrafo corrido de trezentas palavras que não é frase
//               nenhuma. Os Irmãos Karamázov abriam com quatro assim.
//   FANTASMA  — cada entrada do índice virou um capítulo de três palavras.
//               O Conde de Monte Cristo abria com cinco: "Capítulo 27. A
//               história" com o corpo "Volume dois".
//
// ── por que as regras são tão estreitas ──
//
// A primeira medida, contra o acervo inteiro, pegou 608 capítulos, e quase
// todos eram inocentes: folha de rosto, "DO MESMO AUTOR", dedicatória. Pior:
// capítulo curto DE VERDADE. O capítulo LV do Brás Cubas é o diálogo de
// reticências entre Brás e Virgília — trinta palavras —, e o X de Alice no
// Espelho é um parágrafo só. Apagar aqueles dois seria estragar um livro para
// consertar outro.
//
// O que separa índice de capítulo curto não é o TAMANHO, é o AGRUPAMENTO e a
// REPETIÇÃO: entrada de índice vem em bloco de três ou mais seguidas, na
// frente do livro, e o número dela aparece de novo mais adiante, no capítulo
// de verdade. Capítulo curto de verdade vem sozinho, no meio do livro, e o
// número dele é único.
//
// Isto roda DEPOIS do divisor, e não dentro dele, de propósito. Mexer na
// detecção de cabeçalho já custou caro uma vez (ver a trava do cabeçalho
// corrido em `servicos/traducao.mjs`): a regra que conserta um livro quebra
// três. Aqui o divisor continua intacto e só o resultado é conferido — e o
// resultado foi medido contra os 4.625 textos do acervo.

/**
 * Um cabeçalho de capítulo de verdade. Folha de rosto, dedicatória e "DO
 * MESMO AUTOR" nunca se chamam assim, e é só por isso que a regra do fantasma
 * pode olhar para capítulos minúsculos sem levar a frente do livro junto.
 */
const TITULO_DE_CAPITULO =
  /^\s*[*_]*\s*(?:cap[ií]tulo|capitulo|cap[ìí]tulo|chapter|kapitel|chapitre|livro|livre|book|parte|part|canto|carta|letter)\s*[.:]?\s*(?:[ivxlcdm]{1,7}|\d{1,3})\b/i

const MARCADOR =
  /\b(?:cap[ií]tulo|capitulo|cap[ìí]tulo|chapter|kapitel|chapitre|livro|livre|book|parte|part|canto)\s+(?:[ivxlcdm]{1,7}|\d{1,3})\b/gi

/** O número da divisão, sem o nome e sem a pontuação: "CAPÌTULO IX." → "ix". */
function numeroDaDivisao(titulo) {
  const m = String(titulo ?? '').match(TITULO_DE_CAPITULO)
  if (!m) return null
  const n = m[0].match(/(?:[ivxlcdm]{1,7}|\d{1,3})\s*$/i)
  return n ? n[0].toLowerCase() : null
}

const semTags = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ')

/**
 * Os capítulos que são índice, com o motivo de cada um.
 *
 * Só olha livro com quatro capítulos ou mais e mediana acima de 150 palavras:
 * abaixo disso não há como dizer o que é curto demais.
 *
 * @param {{ordem:number, titulo:string|null, corpo:string, palavras:number}[]} caps
 */
export function oQueEhIndice(caps) {
  if (caps.length < 4) return []
  const ordenadas = caps.map((c) => c.palavras).sort((a, b) => a - b)
  const mediana = ordenadas[Math.floor(ordenadas.length / 2)]
  if (mediana < 150) return []

  const condenados = new Map()

  // ── ENGOLIDO ──
  //
  // Três exigências juntas, porque cada uma sozinha erra. Densidade alta (um
  // marcador a cada quarenta palavras), marcadores VARIADOS (índice lista I,
  // II, III…; um ensaio repete o mesmo capítulo muitas vezes) e corpo curto
  // (capítulo longo que cita capítulos é ensaio, não índice).
  for (const c of caps) {
    const achados = semTags(c.corpo).match(MARCADOR) || []
    const distintos = new Set(achados.map((s) => s.toLowerCase().replace(/\s+/g, ' ')))
    const densidade = c.palavras > 0 ? (achados.length / c.palavras) * 100 : 0
    if (achados.length >= 6 && distintos.size >= 5 && densidade >= 2.5 && c.palavras <= 1200) {
      condenados.set(c.ordem, { ordem: c.ordem, titulo: c.titulo, palavras: c.palavras, motivo: 'indice-engolido' })
    }
  }

  // ── FANTASMA ──
  const teto = Math.min(120, mediana * 0.1)
  const minusculo = (c) => c.palavras < teto && TITULO_DE_CAPITULO.test(c.titulo ?? '')

  const substanciais = new Map()
  for (const c of caps) {
    if (c.palavras < teto) continue
    const n = numeroDaDivisao(c.titulo)
    if (n) substanciais.set(n, c.palavras)
  }

  let i = 0
  while (i < caps.length) {
    if (!minusculo(caps[i])) { i++; continue }
    let j = i
    while (j + 1 < caps.length && minusculo(caps[j + 1])) j++
    const bloco = caps.slice(i, j + 1)
    // índice não mora no meio do livro, e o número dele volta mais adiante
    const naFrente = i < 15
    const repete = bloco.some((c) => {
      const n = numeroDaDivisao(c.titulo)
      return n && substanciais.has(n) && substanciais.get(n) >= c.palavras * 10
    })
    if (bloco.length >= 3 && naFrente && repete) {
      for (const c of bloco) {
        condenados.set(c.ordem, { ordem: c.ordem, titulo: c.titulo, palavras: c.palavras, motivo: 'indice-fantasma' })
      }
    }
    i = j + 1
  }

  // Nunca desmontar o livro: se o conserto levaria mais de um terço dos
  // capítulos, quem está errada é a medida, e o livro fica como está.
  const lista = [...condenados.values()].sort((a, b) => a.ordem - b.ordem)
  return lista.length > caps.length / 3 ? [] : lista
}

/** Os capítulos sem os que são índice. Devolve o mesmo array quando não há o que tirar. */
export function semIndice(caps) {
  const fora = oQueEhIndice(caps)
  if (!fora.length) return caps
  const ordens = new Set(fora.map((c) => c.ordem))
  return caps.filter((c) => !ordens.has(c.ordem))
}

// ── o índice de NOTAS DE RODAPÉ, que não some sozinho como um capítulo ──
//
// "Nota ao Capítulo I. Nota ao Capítulo II. (...) NOTA de rodapé" — Ivanhoé
// abre assim. Diferente do índice de sumário, este NÃO pode ser resolvido
// apagando o capítulo inteiro: o que vem depois dele, no mesmo capítulo, é a
// Introdução de Walter Scott — texto de verdade, milhares de palavras.
// Apagar o capítulo inteiro (como faz `oQueEhIndice`) jogaria fora o ensaio
// junto com o lixo.
//
// A medida contra o acervo inteiro (22/09/2026) achou este padrão em UM
// livro só. Não é, hoje, um padrão espalhado — mas a função fica pronta e
// testada para quando aparecer de novo: livro com nota de rodapé farta
// (Gibbon, Suetônio) tende a repetir esta forma de front matter.
const RX_NOTA_INDICE = /\bnotas?\s+(?:ao|para\s+o|de\s+rodap[ée])?\s*cap[ií]tulo\s+[ivxlcdm\d]+/gi

/**
 * Tira o índice de notas de rodapé do INÍCIO de um capítulo, se houver.
 * Só corta parágrafos inteiros, do começo, e só quando o primeiro parágrafo
 * sozinho já tem três ou mais entradas — nunca mexe no meio do texto.
 *
 * @param {string} corpoHtml o corpo em HTML (parágrafos `<p>...</p>`)
 * @returns {string} o mesmo corpo, ou o corpo sem os parágrafos de índice
 */
export function semIndiceDeNotas(corpoHtml) {
  const paragrafos = String(corpoHtml ?? '').match(/<p>.*?<\/p>/gs)
  if (!paragrafos?.length) return corpoHtml

  const primeiro = paragrafos[0].replace(/<[^>]+>/g, ' ')
  const achados = primeiro.match(RX_NOTA_INDICE) || []
  if (achados.length < 3) return corpoHtml

  return paragrafos.slice(1).join('')
}
