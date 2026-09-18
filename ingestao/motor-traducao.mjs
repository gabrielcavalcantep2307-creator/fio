// O motor de tradução — e a razão de ele ser de graça.
//
// ─────────────────────────────────────────────────────────────
// AVISO: este arquivo é uma RECONSTRUÇÃO, de 09/09/2026.
//
// O original traduziu doze obras que estão em produção e depois se perdeu: o
// deploy levava só `servidor/` e `site/` para a VPS, e `ingestao/` nunca foi
// commitada. O que sobrou foram os oito testes em `servidor/testes.mjs`, e é
// deles que esta versão foi refeita — junto com os comentários que eles
// carregam, que registram as medições feitas na época.
//
// As funções puras abaixo estão cobertas por teste e reproduzem o
// comportamento antigo. O endereço do serviço foi escrito de memória na
// reconstrução, deu 404, e foi CONFERIDO e corrigido em 09/09/2026 contra
// uma chamada real.
// ─────────────────────────────────────────────────────────────
//
// A escolha do motor é a decisão que faz este projeto caber no bolso: o MinT,
// da Wikimedia, traduz sem chave e sem cobrar. Isso muda a conta de "US$ 160
// por cem obras" para zero, e muda a natureza da coisa — não há fatura para
// vencer, não há chave para vazar, não há cota para estourar no meio de um
// livro.
//
// O preço é que ele não aceita instrução. Um modelo de linguagem entende
// "traduza mantendo virtude como virtù"; o MinT recebe uma frase e devolve
// outra. Toda garantia aqui é MECÂNICA — glossário aplicado depois, cabeçalho
// preparado antes, português de Portugal corrigido no fim.

// Conferido contra uma chamada real em 09/09/2026: responde
// {"translation": "...", "model": "nllb200-600M"}. O modelo é o NLLB-200 da
// Meta, de 600 milhões de parâmetros, servido pela Wikimedia sem chave.
import { readFileSync } from 'node:fs'

const SERVICO = 'https://translate.wmcloud.org/api/translate'

// ─────────────────────────────────────────────────────────────
// DeepL (18/09/2026): melhor e mais rápido, mas com cota
//
// A conta grátis do dono dá 1 milhão de caracteres por mês. Um romance tem de
// 400 mil a 1 milhão. Então a escolha é POR LIVRO, antes de começar: se o livro
// inteiro cabe no saldo do mês, guardando uma reserva para os balões dos
// quadrinhos (DEEPL_RESERVA, 200 mil por padrão), vai todo pelo DeepL; senão,
// todo pelo MinT. Livro com dois estilos misturados é pior que qualquer um dos
// dois. Livro já começado continua no motor em que começou (o caderno é do MinT).
//
// A chave mora em DEEPL_CHAVE (variável de ambiente ou `.env` na raiz, que o
// git ignora). Sem chave, tudo segue como sempre foi: MinT.
// ─────────────────────────────────────────────────────────────

let motorAtual = 'mint'

function chaveDeepL() {
  if (process.env.DEEPL_CHAVE) return process.env.DEEPL_CHAVE.trim()
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    return env.match(/^DEEPL_CHAVE=(.+)$/m)?.[1].trim() || null
  } catch { return null }
}
const baseDeepL = (k) => (k.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')
// línguas de origem que o DeepL aceita (o resto fica com o MinT)
const DEEPL_ORIGENS = new Set(['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'zh'])

/** Quanto do mês já foi. `null` sem chave ou sem resposta. */
export async function saldoDeepL() {
  const k = chaveDeepL()
  if (!k) return null
  try {
    const r = await fetch(`${baseDeepL(k)}/v2/usage`, { headers: { Authorization: `DeepL-Auth-Key ${k}` }, signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return null
    const u = await r.json()
    return { usado: u.character_count, limite: u.character_limit, sobra: u.character_limit - u.character_count }
  } catch { return null }
}

/**
 * Decide o motor deste livro. `caracteres` é o tamanho do que vai ser
 * traduzido; `jaComecado`, se o caderno já tem trechos de antes.
 */
export async function escolherMotor({ caracteres, de, jaComecado, reserva: reservaPedida }) {
  motorAtual = 'mint'
  if (jaComecado) return { motor: 'mint', porque: 'livro já começado no MinT' }
  if (!DEEPL_ORIGENS.has(de)) return { motor: 'mint', porque: `o DeepL não traduz do ${de}` }
  const saldo = await saldoDeepL()
  if (!saldo) return { motor: 'mint', porque: 'sem chave do DeepL (ou ele não respondeu)' }
  // os balões dos quadrinhos passam reserva 0: a reserva existe para eles
  const reserva = reservaPedida ?? Number(process.env.DEEPL_RESERVA ?? 200_000)
  const precisa = Math.ceil(caracteres * 1.05)
  if (saldo.sobra - reserva < precisa) {
    return { motor: 'mint', porque: `não cabe no mês do DeepL (precisa ${precisa.toLocaleString('pt-BR')}, sobram ${Math.max(0, saldo.sobra - reserva).toLocaleString('pt-BR')} fora a reserva)` }
  }
  motorAtual = 'deepl'
  return { motor: 'deepl', porque: `cabe no mês (${precisa.toLocaleString('pt-BR')} de ${saldo.sobra.toLocaleString('pt-BR')})` }
}

/** Um trecho pelo DeepL, em português do Brasil. */
export async function traduzirDeepL(texto, de, { contexto } = {}) {
  const k = chaveDeepL()
  if (!k) throw new Error('DEEPL_CHAVE ausente')
  const corpo = { text: Array.isArray(texto) ? texto : [texto], target_lang: 'PT-BR' }
  if (de && DEEPL_ORIGENS.has(de)) corpo.source_lang = de.toUpperCase()
  if (contexto) corpo.context = contexto
  const r = await fetch(`${baseDeepL(k)}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${k}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  })
  // 456 = cota do mês acabou; 429 = devagar. As duas voltam como erro para
  // quem chamou decidir (a esteira tenta de novo; o livro não troca de motor).
  if (!r.ok) throw new Error(`DeepL devolveu ${r.status}`)
  const j = await r.json()
  const saida = (j.translations ?? []).map((t) => t.text)
  if (saida.length !== corpo.text.length || saida.some((t) => typeof t !== 'string')) throw new Error('DeepL devolveu resposta fora do formato')
  return Array.isArray(texto) ? saida : saida[0]
}

/**
 * Não há chave para faltar, então não há por que ele não rodar. Esta função
 * existe para o resto da ingestão poder perguntar sem saber de MinT nenhum —
 * no dia em que o motor virar um que cobra, é aqui que a resposta muda.
 */
export const motorDisponivel = () => (motorAtual === 'deepl'
  ? { nome: 'DeepL', custo: 0, instruivel: false }
  : { nome: 'MinT (Wikimedia)', custo: 0, instruivel: false })

/** `null` quer dizer "roda". Qualquer texto aqui é o que impede. */
export const porQueNaoRoda = () => null

// ─────────────────────────────────────────────────────────────
// Glossário
// ─────────────────────────────────────────────────────────────

/** Letra, sem depender do `\b` do JavaScript, que é ASCII e ignora "ã". */
const L = '\\p{L}\\p{N}'
const cerca = (termo) => new RegExp(`(?<![${L}])(${termo})(?![${L}])`, 'giu')

/**
 * O termo que o tradutor não podia ser instruído a manter.
 *
 * "Virtù" em Maquiavel não é "virtude", e nenhum tradutor automático sabe
 * disso. Como o MinT não lê instrução, a troca acontece DEPOIS, no texto que
 * ele devolveu — e por ser mecânica ela é total, que é mais do que uma
 * instrução conseguiria garantir.
 *
 * A caixa do original é preservada: "Virtude" no começo da frase vira
 * "Virtù", e não "virtù".
 */
export function aplicarGlossario(texto, glossario = {}) {
  let saida = texto
  for (const [de, para] of Object.entries(glossario)) {
    saida = saida.replace(cerca(de), (achado) =>
      achado[0] === achado[0].toUpperCase()
        ? para[0].toUpperCase() + para.slice(1)
        : para)
  }
  return saida
}

// ─────────────────────────────────────────────────────────────
// O cabeçalho, que o tradutor automático não sabe ler
//
// Traduzindo "O Príncipe", o capítulo XIII saiu assim:
//
//   "## CHAPTER XIII. CONCERNING AUXILIARIES, MIXED SOLDIERY..."
//   → "Capítulo XIII. CONCERENTE A AUSILARIOS, SOBRE MIXO, E A SUA PELIGIA"
//
// "Concerente", "ausilarios" e "peligia" não são palavras. São dois defeitos
// somados: CAIXA ALTA é rara no texto de treino de um tradutor neural, e o
// "##" do Markdown entra na frase como se fosse palavra. O mesmo título em
// caixa mista e sem cerquilha sai limpo.
// ─────────────────────────────────────────────────────────────

/** Numeral romano de verdade — "CIVIL" tem só letras romanas e não é um. */
const ROMANO = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/

/**
 * Caixa de título, poupando romano: "BOOK IV. OF THE LAWS" → "Book IV. Of The
 * Laws". Sem a exceção, "IV" viraria "Iv" e "XIII" viraria "Xiii", que é pior
 * do que a caixa alta que se estava consertando.
 *
 * Não há lista de palavras menores ("of", "the") de propósito: ela varia por
 * língua, e o alvo aqui é só tirar o texto do berro — o tradutor faz o resto.
 */
export function emCaixaDeTitulo(s) {
  return s.replace(/[\p{L}\p{N}']+/gu, (palavra) => {
    const nu = palavra.replace(/[^\p{L}\p{N}]/gu, '')
    if (nu && nu === nu.toUpperCase() && ROMANO.test(nu.toUpperCase())) return palavra
    return palavra[0].toUpperCase() + palavra.slice(1).toLowerCase()
  })
}

const soCaixaAlta = (s) => s === s.toUpperCase() && /\p{Lu}/u.test(s)

/**
 * Tira do texto o que atrapalha o tradutor, e devolve como pôr de volta.
 *
 * Só mexe em cabeçalho. Parágrafo comum passa inteiro — inclusive a SIGLA em
 * caixa alta no meio dele, que é palavra de verdade e não erro de formatação.
 *
 * @returns `{ entrada, refazer }` — o que mandar, e o que fazer com a volta
 */
export function prepararUnidade(bruto) {
  const cabecalho = bruto.match(/^(\s*#{1,6}\s*)([\s\S]*)$/)
  if (!cabecalho) return { entrada: bruto, refazer: (t) => t }

  const [, marca, titulo] = cabecalho
  const entrada = soCaixaAlta(titulo) ? emCaixaDeTitulo(titulo) : titulo
  return { entrada, refazer: (traduzido) => marca + traduzido }
}

// ─────────────────────────────────────────────────────────────
// Português de Portugal, que o MinT devolve sem avisar
//
// Ele é treinado em "português", e português tem duas normas escritas.
// Medindo as seis primeiras obras traduzidas:
//
//     172  "estava a fazer", "está a ver", "estão a chegar"
//      19  "facto"
//      10  "pequeno-almoço"
//
// A palavra solta um leitor brasileiro atravessa. A CONSTRUÇÃO, não: 172
// ocorrências em seis livros são o que faz o texto inteiro soar de outro
// lugar — e ela é gramatical, então nenhum glossário a pega.
// ─────────────────────────────────────────────────────────────

// Auxiliares que aceitam a construção. A lista é curta DE PROPÓSITO:
// "começou a fazer" e "voltou a ler" são corretas nas duas normas, e entrar
// aqui estragaria as duas.
const AUXILIAR = '(?:est(?:ou|ás|á|amos|ão|ava|avas|ávamos|avam|eve|ive|iveram|ará|aria|iver)'
  + '|and(?:o|as|a|amos|am|ava|avam|ou|aram)'
  + '|continu(?:o|as|a|amos|am|ava|avam|ou|aram|ando))'

// Substantivos terminados em -ar/-er/-ir que NÃO são infinitivo. Sem esta
// lista, "está a par do assunto" virava "está pando do assunto".
const NAO_E_VERBO = new Set([
  'par', 'lugar', 'ar', 'altar', 'bar', 'colar', 'dolar', 'dólar', 'jantar',
  'andar', 'militar', 'particular', 'familiar', 'escolar', 'popular', 'celular',
  'mar', 'lar', 'pomar', 'olhar', 'pesar', 'prazer', 'poder', 'dever', 'saber',
])

/** Infinitivo vira gerúndio: -ar → -ando, -er → -endo, -ir → -indo. */
function gerundio(inf) {
  const b = inf.toLowerCase()
  if (NAO_E_VERBO.has(b)) return null
  if (b.endsWith('ôr') || b.endsWith('or')) return inf.slice(0, -2) + 'ondo'
  if (b.endsWith('ar')) return inf.slice(0, -2) + 'ando'
  if (b.endsWith('er')) return inf.slice(0, -2) + 'endo'
  if (b.endsWith('ir')) return inf.slice(0, -2) + 'indo'
  return null
}

/**
 * Vocabulário, com o gênero junto.
 *
 * Trocar só o substantivo produzia "na banheiro". Cada entrada diz o gênero
 * do termo de lá e o do termo de cá; quando eles diferem, o artigo que vem
 * antes vai junto na troca.
 */
const PALAVRAS = [
  { de: 'casa de banho', para: 'banheiro', gDe: 'f', gPara: 'm' },
  { de: 'frigorífico', para: 'geladeira', gDe: 'm', gPara: 'f' },
  { de: 'ecrã', para: 'tela', gDe: 'm', gPara: 'f' },
  { de: 'sanita', para: 'privada', gDe: 'f', gPara: 'f' },
  { de: 'comboio', para: 'trem', gDe: 'm', gPara: 'm' },
  { de: 'autocarro', para: 'ônibus', gDe: 'm', gPara: 'm' },
  { de: 'telemóvel', para: 'celular', gDe: 'm', gPara: 'm' },
  { de: 'pequeno-almoço', para: 'café da manhã', gDe: 'm', gPara: 'm' },
  { de: 'facto', para: 'fato', gDe: 'm', gPara: 'm' },
  { de: 'rapariga', para: 'moça', gDe: 'f', gPara: 'f' },
]

// Artigos e contrações que mudam com o gênero, na mesma ordem nas duas listas.
const ARTIGO = {
  m: ['o', 'um', 'no', 'do', 'ao', 'pelo', 'este', 'esse', 'aquele'],
  f: ['a', 'uma', 'na', 'da', 'à', 'pela', 'esta', 'essa', 'aquela'],
}

function trocarArtigo(artigo, gDe, gPara) {
  const i = ARTIGO[gDe].indexOf(artigo.toLowerCase())
  if (i < 0) return artigo
  const novo = ARTIGO[gPara][i]
  return artigo[0] === artigo[0].toUpperCase()
    ? novo[0].toUpperCase() + novo.slice(1)
    : novo
}

/**
 * O texto que o MinT devolveu, na norma daqui.
 *
 * Duas passadas, e a ordem importa: a construção primeiro, porque ela é a que
 * pesa, e o vocabulário depois, porque uma troca de palavra pode criar a
 * sequência que a outra procuraria.
 */
export function abrasileirar(texto) {
  let s = texto

  // "estava a fazer" → "estava fazendo"
  s = s.replace(
    new RegExp(`(?<![${L}])(${AUXILIAR})(\\s+)a\\s+(\\p{L}+)(?![${L}])`, 'giu'),
    (todo, aux, espaco, inf) => {
      const g = gerundio(inf)
      return g ? `${aux}${espaco}${g}` : todo
    })

  // vocabulário, com o artigo indo junto quando o gênero muda
  for (const { de, para, gDe, gPara } of PALAVRAS) {
    if (gDe !== gPara) {
      s = s.replace(
        new RegExp(`(?<![${L}])(\\p{L}+)(\\s+)(?:${de})(?![${L}])`, 'giu'),
        (todo, art, espaco) => `${trocarArtigo(art, gDe, gPara)}${espaco}${para}`)
    }
    s = s.replace(cerca(de), para)
  }

  return s
}

// ─────────────────────────────────────────────────────────────
// A chamada, que é a parte NÃO conferida deste arquivo
// ─────────────────────────────────────────────────────────────

/**
 * Traduz uma unidade — um parágrafo, um cabeçalho — e devolve já preparada,
 * com glossário e norma brasileira aplicados.
 *
 * Uma resposta em formato diferente do esperado aqui produziria capítulo
 * vazio EM SILÊNCIO, que é o pior defeito possível numa ingestão. Por isso a
 * conferência abaixo é dura: qualquer coisa que não seja texto com conteúdo
 * levanta erro, e a ingestão para em vez de gravar nada.
 */
export async function traduzir(bruto, { de = 'en', para = 'pt', glossario = {} } = {}) {
  const { entrada, refazer } = prepararUnidade(bruto)
  if (!entrada.trim()) return bruto

  // Fonte já em português: não há o que traduzir. Mandar pt→pt ao MinT gasta
  // o serviço de uma fundação para receber de volta o que se mandou — quando
  // não volta pior. O Hamlet do plano é assim: o Gutenberg 25667 já é uma
  // tradução portuguesa em domínio público, e são 218 mil bytes de pedido à
  // toa. O que ainda vale é o glossário e a norma brasileira, que são nossos
  // e não dependem de tradutor nenhum.
  if (de === para) return refazer(abrasileirar(aplicarGlossario(entrada, glossario)))

  if (motorAtual === 'deepl') {
    const t = await traduzirDeepL(entrada, de)
    if (!t.trim()) throw new Error('DeepL devolveu resposta vazia')
    return refazer(abrasileirar(aplicarGlossario(t, glossario)))
  }

  const r = await fetch(`${SERVICO}/${de}/${para}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: entrada }),
    // Sem isto, um pedido que o serviço aceita e depois abandona fica pendurado
    // para sempre: o `fetch` do Node não tem prazo nenhum por conta própria.
    // Em 14/09/2026 a esteira passou 1h34 parada num pedido assim, gastando
    // 4 segundos de processador em uma hora e meia — parada, não trabalhando.
    // Um parágrafo leva segundos; um minuto já é sinal de que não vem.
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`MinT devolveu ${r.status} para "${entrada.slice(0, 40)}"`)

  const { translation } = await r.json()
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new Error('MinT devolveu resposta vazia — confira o formato antes de seguir')
  }

  return refazer(abrasileirar(aplicarGlossario(translation, glossario)))
}
