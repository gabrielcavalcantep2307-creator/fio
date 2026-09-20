// A revisora: conserta tradução automática sem poder estragá-la (20/09/2026).
//
// ─────────────────────────────────────────────────────────────
// O PEDIDO, E O MEDO CERTO
//
// O dono pediu um serviço que fique revisando as traduções sozinho, "igual à
// esteira, mas mais controlado — porque se ficar sem controle vai quebrar
// todas as traduções e acabar com o site".
//
// O medo está certo, e é o que desenha este arquivo. Um modelo de linguagem
// solto reescrevendo 168 livros é um jeito garantido de perder o acervo: ele
// não erra pouco e visivelmente, erra em toda parte e com boa aparência. Uma
// frase reescrita "melhor" mas com o sentido trocado não dispara alarme
// nenhum, e nós só descobriríamos pelo leitor reclamando, livro a livro.
//
// Então a revisora NÃO reescreve. Ela só faz três coisas, todas fechadas:
//
//   1. troca palavra de uma LISTA FIXA, escrita à mão e conferida uma a uma
//      (servidor/glossario-revisao.json);
//   2. manda de novo ao motor de tradução o PARÁGRAFO que ainda está na
//      língua de origem — o mesmo motor da esteira, não um modelo livre;
//   3. conserta número por extenso quebrado ("trêscentos" → "trezentos").
//
// Nada disso inventa texto. O item 2 é o único que chama um serviço de fora,
// e ele recebe um parágrafo que comprovadamente NÃO está em português e
// devolve outro que precisa comprovadamente estar — senão a troca é recusada.
//
// ─────────────────────────────────────────────────────────────
// AS SETE TRAVAS
//
// Cada uma nasceu de um jeito diferente de destruir o acervo:
//
//   1. ESCOPO — só toca em `texto.revisao = 'automatica'`, que é o que a
//      esteira traduziu. Gutenberg, Wikisource, lei e obra de leitor não são
//      nossos para mexer, e são a maior parte do acervo.
//   2. DIÁRIO — toda troca grava o ANTES em `revisao_troca`. Desfazer é uma
//      consulta, não um backup. Sem o diário, a revisora seria irreversível,
//      e irreversível é o que transforma um erro em desastre.
//   3. TAMANHO — a troca não pode mudar o parágrafo além de ±40%. Tradução
//      que volta pela metade, ou que volta com o dobro, é resposta quebrada
//      do serviço, não tradução melhor.
//   4. PROVA DEPOIS — o parágrafo trocado é medido de novo. Se não ficou mais
//      português do que era, desfaz na hora. É a trava que impede o motor de
//      devolver a mesma coisa (ou pior) e nós gravarmos.
//   5. TETO — no máximo `TETO_TROCAS_CAPITULO` por capítulo e
//      `TETO_TROCAS_LIVRO` por livro em cada volta. Regra nova que dá muito
//      casamento é regra errada: em vez de aplicar 9 mil vezes, ela bate no
//      teto, o livro é marcado `suspeito` e para.
//   6. PROPOR ANTES DE APLICAR — o padrão é `propor`: grava a proposta e não
//      encosta no texto. Aplicar exige `FIO_REVISORA=aplicar`, e o painel
//      liga e desliga sem deploy.
//   7. UM DE CADA VEZ — um livro por volta, com pausa entre eles. Uma regra
//      ruim que passe por todas as outras travas ainda assim estraga um
//      livro antes de alguém ver, não os 168.
//
// A trava 4 merece uma palavra a mais, porque é a que faz a coisa funcionar.
// Ela é a mesma medida de ingestao/conferir-traducao.mjs: palavra de função.
// Um parágrafo em alemão tem `daß`, `wir`, `nicht`, `und`; o mesmo parágrafo
// em português tem `que`, `de`, `não`. A revisora só grava quando a conta
// depois é melhor que a conta antes. Não é opinião sobre estilo — é medida
// sobre língua, e é a única pergunta que dá para responder sem um humano.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────────────────────────────────────
// Tabelas
// ─────────────────────────────────────────────────────────────

export function garantirTabelas(banco) {
  banco.exec(`
  CREATE TABLE IF NOT EXISTS revisao_troca (
    id          INTEGER PRIMARY KEY,
    texto_id    INTEGER NOT NULL,
    capitulo_id INTEGER NOT NULL,
    tipo        TEXT NOT NULL,        -- 'glossario' | 'retraducao' | 'numero'
    regra       TEXT,                 -- a entrada do glossário, quando for o caso
    antes       TEXT NOT NULL,        -- o parágrafo como estava. É o desfazer.
    depois      TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'proposta'
                CHECK (estado IN ('proposta','aplicada','desfeita','recusada')),
    motivo      TEXT,                 -- por que foi recusada
    criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_revisao_troca_texto ON revisao_troca (texto_id, estado);
  CREATE INDEX IF NOT EXISTS ix_revisao_troca_cap ON revisao_troca (capitulo_id);

  CREATE TABLE IF NOT EXISTS revisao_livro (
    texto_id     INTEGER PRIMARY KEY,
    estado       TEXT NOT NULL DEFAULT 'espera'
                 CHECK (estado IN ('espera','revisando','pronto','suspeito','erro')),
    trocas       INTEGER NOT NULL DEFAULT 0,
    recusadas    INTEGER NOT NULL DEFAULT 0,
    visto_em     TEXT,
    motivo       TEXT
  );

  CREATE TABLE IF NOT EXISTS revisao_pulso (
    id     INTEGER PRIMARY KEY CHECK (id = 1),
    estado TEXT NOT NULL,
    em     TEXT NOT NULL DEFAULT (datetime('now'))
  );`)
}

// ─────────────────────────────────────────────────────────────
// Que língua é este parágrafo
//
// A mesma medida do raio-x: palavra de função. O assunto muda o vocabulário
// inteiro, mas "que", "de" e "não" aparecem na mesma proporção num romance e
// num tratado — e é por isso que dá para medir língua com cem palavras.
// ─────────────────────────────────────────────────────────────

const FUNCAO = {
  pt: ['que', 'de', 'não', 'para', 'com', 'uma', 'dos', 'das', 'os', 'as', 'um', 'em', 'no', 'na', 'se', 'por', 'como', 'mais', 'ele', 'ela', 'era', 'foi', 'ao', 'do', 'da', 'seu', 'sua', 'mas', 'já', 'quando', 'muito', 'sem', 'sobre', 'entre', 'depois', 'ainda', 'são', 'tinha', 'este', 'esta', 'isso', 'pelo', 'pela', 'nos', 'nas', 'meu', 'minha', 'todo', 'toda', 'está', 'ser', 'ter', 'até', 'também', 'onde', 'porque', 'então', 'assim'],
  en: ['the', 'and', 'of', 'to', 'in', 'that', 'it', 'was', 'is', 'for', 'with', 'as', 'his', 'her', 'had', 'but', 'not', 'they', 'you', 'this', 'from', 'have', 'were', 'which', 'she', 'he', 'be', 'on', 'at', 'by', 'or', 'an', 'their', 'there', 'been', 'would', 'when', 'what', 'all', 'we', 'so', 'if', 'out', 'up', 'said', 'them', 'him', 'into', 'more', 'could', 'other', 'than', 'then', 'now', 'only', 'its', 'over', 'also', 'very', 'after', 'our', 'these', 'my'],
  de: ['der', 'die', 'das', 'und', 'nicht', 'ich', 'sie', 'ist', 'den', 'er', 'es', 'ein', 'eine', 'mit', 'sich', 'auf', 'dem', 'für', 'war', 'aber', 'auch', 'als', 'noch', 'nur', 'wie', 'zu', 'von', 'an', 'so', 'dann', 'schon', 'wir', 'hatte', 'einen', 'einem', 'doch', 'daß', 'dass', 'man', 'aus', 'bei', 'oder', 'wenn', 'diese', 'dieser', 'sehr', 'haben', 'hat', 'wurde', 'werden', 'sein', 'ihn', 'ihm', 'ihr', 'mehr', 'über', 'nach', 'durch', 'vor', 'immer'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'un', 'une', 'il', 'elle', 'que', 'qui', 'dans', 'pas', 'pour', 'sur', 'ne', 'se', 'ce', 'est', 'plus', 'par', 'mais', 'avec', 'tout', 'nous', 'vous', 'son', 'sa', 'ses', 'au', 'aux', 'du', 'comme', 'lui', 'avait', 'été', 'être', 'cette', 'leur', 'bien', 'sans', 'sont', 'même', 'donc', 'alors', 'dont', 'où'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'no', 'en', 'un', 'una', 'por', 'con', 'para', 'su', 'sus', 'del', 'al', 'se', 'lo', 'como', 'pero', 'más', 'este', 'esta', 'muy', 'sin', 'sobre', 'también', 'hasta', 'hay', 'donde', 'cuando', 'porque', 'todo', 'todos', 'era', 'ser', 'está', 'han', 'fue'],
  it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'che', 'non', 'un', 'una', 'per', 'con', 'del', 'della', 'nel', 'nella', 'si', 'come', 'ma', 'più', 'sono', 'era', 'questo', 'questa', 'anche', 'quando', 'perché', 'dove', 'tutto', 'essere', 'suo', 'sua'],
}
const CONJUNTOS = Object.fromEntries(Object.entries(FUNCAO).map(([k, v]) => [k, new Set(v)]))

export const semTags = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#[0-9]+;/g, ' ').replace(/[ ]+/g, ' ').trim()
export const palavrasDe = (s) => semTags(s).toLowerCase().match(/[a-zà-ÿ]{1,}/g) ?? []

/**
 * Quanto deste texto é de cada língua.
 * @returns {{lingua: string, pt: number, melhor: number, palavras: number}}
 *   `pt` e `melhor` são frações das palavras (0 a 1).
 */
export function medirLingua(texto) {
  const ws = palavrasDe(texto)
  if (!ws.length) return { lingua: 'indefinida', pt: 0, melhor: 0, palavras: 0 }
  const conta = {}
  for (const k of Object.keys(CONJUNTOS)) conta[k] = 0
  for (const w of ws) for (const [k, set] of Object.entries(CONJUNTOS)) if (set.has(w)) conta[k]++
  let lingua = 'indefinida'
  let melhor = 0
  for (const [k, n] of Object.entries(conta)) if (n > melhor) { melhor = n; lingua = k }
  return { lingua, pt: conta.pt / ws.length, melhor: melhor / ws.length, palavras: ws.length }
}

/**
 * Este parágrafo ficou na língua de origem?
 *
 * Exige texto suficiente (uma frase curta não dá para medir), uma língua
 * estrangeira claramente na frente, e pouco português. O corte é alto de
 * propósito: deixar passar um parágrafo defeituoso custa um parágrafo; pegar
 * um parágrafo bom e "consertá-lo" custa a confiança no acervo inteiro.
 */
export function ficouNaOrigem(texto) {
  const m = medirLingua(texto)
  if (m.palavras < 18) return null
  if (m.lingua === 'pt' || m.lingua === 'indefinida') return null
  if (m.melhor < 0.08) return null
  if (m.pt > m.melhor * 0.6) return null
  return m.lingua
}

// ─────────────────────────────────────────────────────────────
// O glossário: a lista fixa
// ─────────────────────────────────────────────────────────────

/**
 * As classes de palavra que podem ser trocadas por regra, e o motivo de a
 * lista ser tão curta.
 *
 * Cada uma cumpre a mesma condição: a palavra errada determina sozinha a
 * palavra certa, sem olhar a frase.
 *
 *   substantivo  nome por nome do mesmo gênero e número (flanel → flanela)
 *   numeral      número por extenso, que não flexiona   (trêscentos → trezentos)
 *   adverbio     advérbio, que nunca flexiona           (despreciosamente → …)
 *   flexionada   a palavra errada já vem flexionada em português, então a
 *                certa é única (tremiavam → tremiam, diônica → dionisíaca)
 *
 * Fora daqui ficam adjetivo e verbo ESTRANGEIROS, que é onde o desastre mora:
 * "queer" não diz se é masculino ou feminino, "fluttered" não diz se é
 * singular ou plural, e quem sabe isso é a frase. Ver o cabeçalho do
 * glossário para as três frases que isso estragou no ar.
 */
export const CLASSES = new Set(['substantivo', 'numeral', 'adverbio', 'flexionada'])

let glossarioGuardado = null
export function glossario() {
  if (glossarioGuardado) return glossarioGuardado
  const bruto = JSON.parse(readFileSync(join(AQUI, 'glossario-revisao.json'), 'utf8'))
  // `desligada: true` tira uma entrada de circulação sem apagar a prova de que
  // ela já foi considerada — e de por que saiu.
  glossarioGuardado = bruto.entradas.filter((e) => e.de && e.para && e.de !== e.para && !e.desligada)
  // A trava nasce aqui, e não só no teste: uma entrada de classe errada
  // derruba o serviço ao subir, em vez de estragar livro em silêncio.
  for (const e of glossarioGuardado) {
    if (!CLASSES.has(e.classe)) {
      throw new Error(`glossário: "${e.de}" tem classe "${e.classe ?? '(nenhuma)'}", que não é trocável por regra. ` +
        'Só entram substantivo, numeral, adverbio e flexionada — ver o cabeçalho do glossario-revisao.json.')
    }
  }
  return glossarioGuardado
}

/** As famílias do glossário, para o painel e para desligar uma de cada vez. */
export const porIdioma = () => {
  const m = new Map()
  for (const e of glossario()) m.set(e.idioma ?? '?', (m.get(e.idioma ?? '?') ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

/**
 * A cerca da palavra: inteira, e nunca dentro de um composto.
 *
 * "resort" não pode casar dentro de "resorts" — isso a primeira versão já
 * fazia. O que ela NÃO fazia era tratar o hífen como parte da palavra, e a
 * auditoria de 20/09 mostrou o estrago:
 *
 *    yew-tree        → teixo-tree          (meia palavra traduzida)
 *    "Gay-Headers"   → "Vistosas-Headers"  (Gay Head é um LUGAR, em Moby Dick)
 *
 * Composto com hífen é uma palavra só, e quase sempre é justamente onde mora
 * o nome próprio. Então o hífen, dos dois lados, cancela a troca: a revisora
 * deixa o composto em paz e alguém decide depois. Perder uma troca boa por
 * causa disso é barato; "Vistosas-Headers" não é.
 */
const TROCA_CACHE = new Map()
function regraDe(de) {
  if (!TROCA_CACHE.has(de)) TROCA_CACHE.set(de, new RegExp('(^|[^0-9A-Za-zÀ-ÿ-])(' + de + ')(?=[^0-9A-Za-zÀ-ÿ-]|$)', 'gi'))
  const r = TROCA_CACHE.get(de)
  r.lastIndex = 0
  return r
}

/** Devolve `para` com a caixa de `original`: Queer → Estranho, QUEER → ESTRANHO. */
function comACaixaDe(original, para) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return para.toUpperCase()
  if (original[0] === original[0].toUpperCase()) return para[0].toUpperCase() + para.slice(1)
  return para
}

/**
 * Aplica o glossário num parágrafo.
 *
 * Só no TEXTO: o que está dentro de uma tag (um href, uma classe) nunca é
 * tocado. Trocar dentro de atributo já quebrou HTML em projeto que fez isso
 * com replace cru.
 */
export function aplicarGlossarioNoHtml(html, entradas = glossario()) {
  const usadas = []
  const pedacos = String(html).split(/(<[^>]+>)/)
  for (let i = 0; i < pedacos.length; i++) {
    if (pedacos[i].startsWith('<')) continue
    for (const e of entradas) {
      const r = regraDe(e.de)
      if (!r.test(pedacos[i])) continue
      r.lastIndex = 0
      pedacos[i] = pedacos[i].replace(r, (_todo, antes, palavra) => antes + comACaixaDe(palavra, e.para))
      usadas.push(e.de)
    }
  }
  return { html: pedacos.join(''), usadas }
}

// ─────────────────────────────────────────────────────────────
// As travas, numa função só
// ─────────────────────────────────────────────────────────────

export const TAMANHO_MAXIMO = 1.4
export const TAMANHO_MINIMO = 0.6

/**
 * Esta troca pode ser gravada?
 * @returns {{pode: boolean, motivo?: string}}
 */
export function trocaSegura(antes, depois, { exigirMaisPortugues = true } = {}) {
  const a = semTags(antes)
  const d = semTags(depois)
  if (!d) return { pode: false, motivo: 'vazio' }
  if (a === d) return { pode: false, motivo: 'igual' }
  // trava 3: tamanho
  const razao = d.length / Math.max(1, a.length)
  if (razao > TAMANHO_MAXIMO) return { pode: false, motivo: 'cresceu ' + razao.toFixed(2) + 'x' }
  if (razao < TAMANHO_MINIMO) return { pode: false, motivo: 'encolheu ' + razao.toFixed(2) + 'x' }
  // o HTML tem que continuar de pé: mesma quantidade de tags
  const tagsAntes = (String(antes).match(/<[^>]+>/g) ?? []).length
  const tagsDepois = (String(depois).match(/<[^>]+>/g) ?? []).length
  if (tagsAntes !== tagsDepois) return { pode: false, motivo: 'mudou a marcação (' + tagsAntes + ' → ' + tagsDepois + ')' }
  // trava 4: a prova depois
  if (exigirMaisPortugues) {
    const ma = medirLingua(a)
    const md = medirLingua(d)
    if (md.pt <= ma.pt) return { pode: false, motivo: 'não ficou mais português (' + ma.pt.toFixed(3) + ' → ' + md.pt.toFixed(3) + ')' }
    if (md.lingua !== 'pt') return { pode: false, motivo: 'voltou em ' + md.lingua }
  }
  return { pode: true }
}

// ─────────────────────────────────────────────────────────────
// Pedaços do tamanho que o motor aguenta
//
// Descoberto em 20/09/2026, medindo O Castelo: o defeito grande não é palavra
// solta, é CAPÍTULO INTEIRO que a esteira nunca traduziu. O capítulo 15 tem
// 21.570 palavras em alemão, no ar, desde que o livro entrou.
//
// A primeira versão da revisora mandou o capítulo de uma vez e o motor
// devolveu o alemão de volta — a trava 4 pegou e recusou, que é o
// comportamento certo, mas o livro continuava quebrado. O motor tem um teto
// prático por pedido; passando dele, ele não erra, ele desiste.
//
// Então o texto vai em pedaços de frase. Cortar em FRASE e não em letra
// importa: o tradutor precisa da frase inteira para escolher o tempo verbal e
// o gênero, e um corte no meio dela devolve duas metades que não combinam.
// ─────────────────────────────────────────────────────────────

export const PEDACO_MAXIMO = 900

/** Corta um texto em pedaços de até `teto` letras, sempre no fim de frase. */
export function emPedacos(texto, teto = PEDACO_MAXIMO) {
  const frases = String(texto).split(/(?<=[.!?…»"”])[ ]+/)
  const saida = []
  let atual = ''
  for (const f of frases) {
    if (!atual) { atual = f; continue }
    if ((atual + ' ' + f).length <= teto) { atual += ' ' + f; continue }
    saida.push(atual)
    atual = f
  }
  if (atual) saida.push(atual)
  // Frase sozinha maior que o teto (parágrafo sem pontuação): vai inteira.
  // Cortá-la no meio é pior que mandá-la grande.
  return saida.filter(Boolean)
}

// ─────────────────────────────────────────────────────────────
// Números por extenso que o tradutor quebrou
//
// "trêscentos" e "cincocentos" saem de traduzir "three hundred" e "five
// hundred" pedaço por pedaço. São erro de forma, não de sentido, e por isso
// entram aqui e não no glossário: a regra é geral.
// ─────────────────────────────────────────────────────────────

const NUMEROS = [
  ['tr[êe]scentos', 'trezentos'],
  ['cincocentos', 'quinhentos'],
  ['cinqu?ocentos', 'quinhentos'],
  ['seiscentos e cem', 'setecentos'],
  ['dois centos', 'duzentos'],
  ['quatrocentos e cem', 'quinhentos'],
]

export function consertarNumeros(html) {
  let saida = String(html)
  const usadas = []
  for (const [de, para] of NUMEROS) {
    const r = new RegExp('(^|[^0-9A-Za-zÀ-ÿ])(' + de + ')(?=[^0-9A-Za-zÀ-ÿ]|$)', 'gi')
    if (!r.test(saida)) continue
    r.lastIndex = 0
    saida = saida.replace(r, (_t, antes, palavra) => antes + comACaixaDe(palavra, para))
    usadas.push(de)
  }
  return { html: saida, usadas }
}

// ─────────────────────────────────────────────────────────────
// A fila
// ─────────────────────────────────────────────────────────────

/** Põe na fila todo livro traduzido por nós que ainda não foi revisado. */
export function encherFila(banco) {
  return banco.prepare(`INSERT OR IGNORE INTO revisao_livro (texto_id, estado)
    SELECT t.id, 'espera' FROM texto t WHERE t.revisao = 'automatica' AND t.dono_id IS NULL`).run().changes
}

/** O próximo livro: o mais antigo que espera. Um por volta. */
export function proximo(banco) {
  return banco.prepare(`SELECT r.texto_id, t.obra_id, coalesce(o.titulo_pt, o.titulo) titulo
    FROM revisao_livro r JOIN texto t ON t.id = r.texto_id JOIN obra o ON o.id = t.obra_id
    WHERE r.estado = 'espera' ORDER BY r.texto_id LIMIT 1`).get() ?? null
}

export function marcar(banco, textoId, estado, { trocas = 0, recusadas = 0, motivo = null } = {}) {
  banco.prepare(`UPDATE revisao_livro SET estado = ?, trocas = trocas + ?, recusadas = recusadas + ?,
    visto_em = datetime('now'), motivo = ? WHERE texto_id = ?`).run(estado, trocas, recusadas, motivo, textoId)
}

export function pulsar(banco, estado) {
  banco.prepare(`INSERT INTO revisao_pulso (id, estado, em) VALUES (1, ?, datetime('now'))
    ON CONFLICT (id) DO UPDATE SET estado = excluded.estado, em = excluded.em`).run(JSON.stringify(estado))
}

/**
 * O que a revisora está fazendo, para o painel.
 *
 * O dono abriu o painel e não a achou: "não estou vendo essa parte de revisão
 * aqui na esteira". Serviço que mexe no acervo e não aparece em lugar nenhum
 * é pior que serviço que não existe — não dá para confiar no que não se vê,
 * nem para desligar o que não se acha.
 */
export function estado(banco) {
  garantirTabelas(banco)
  const um = (sql) => { try { return banco.prepare(sql).all() } catch { return [] } }
  const porEstado = (linhas) => Object.fromEntries(linhas.map((l) => [l.estado, l.n]))

  const p = banco.prepare('SELECT estado, em FROM revisao_pulso WHERE id = 1').get()
  let pulso = null
  if (p) {
    try { pulso = JSON.parse(p.estado) } catch { pulso = null }
    if (pulso) pulso.idadeSegundos = Math.max(0, Math.round((Date.now() - new Date(p.em + 'Z').getTime()) / 1000))
  }

  const fila = porEstado(um("SELECT estado, count(*) n FROM revisao_livro GROUP BY estado"))
  const trocas = porEstado(um("SELECT estado, count(*) n FROM revisao_troca GROUP BY estado"))
  const tipos = um("SELECT tipo, count(*) n FROM revisao_troca WHERE estado = 'aplicada' GROUP BY tipo")
  const recusas = um(`SELECT motivo, count(*) n FROM revisao_troca WHERE estado = 'recusada'
    GROUP BY motivo ORDER BY n DESC LIMIT 6`)
  const ultimas = um(`SELECT t.id, t.tipo, t.regra, t.criado_em, o.titulo_pt, o.titulo
    FROM revisao_troca t JOIN texto x ON x.id = t.texto_id JOIN obra o ON o.id = x.obra_id
    WHERE t.estado = 'aplicada' ORDER BY t.id DESC LIMIT 12`)
  const suspeitos = um(`SELECT r.texto_id, r.motivo, coalesce(o.titulo_pt, o.titulo) titulo
    FROM revisao_livro r JOIN texto x ON x.id = r.texto_id JOIN obra o ON o.id = x.obra_id
    WHERE r.estado = 'suspeito' LIMIT 10`)

  // 2 minutos sem pulso é parada — a volta mais curta dela é de 20 s.
  const viva = pulso != null && pulso.idadeSegundos < 180

  return {
    modo: null, // preenchido pela rota, que conhece os ajustes
    viva,
    pulso,
    fila: {
      espera: fila.espera ?? 0, revisando: fila.revisando ?? 0,
      pronto: fila.pronto ?? 0, suspeito: fila.suspeito ?? 0, erro: fila.erro ?? 0,
    },
    trocas: {
      aplicadas: trocas.aplicada ?? 0, propostas: trocas.proposta ?? 0,
      recusadas: trocas.recusada ?? 0, desfeitas: trocas.desfeita ?? 0,
    },
    porTipo: tipos,
    recusas,
    suspeitos,
    ultimas: ultimas.map((u) => ({
      id: u.id, tipo: u.tipo, regra: u.regra, quando: u.criado_em,
      titulo: u.titulo_pt || u.titulo,
    })),
  }
}

/**
 * Desfaz. É o botão de arrependimento, e existir é metade do desenho.
 * Sem argumento, desfaz tudo o que foi aplicado.
 */
export function desfazer(banco, { textoId = null, desde = null } = {}) {
  let sql = "SELECT id, capitulo_id, antes FROM revisao_troca WHERE estado = 'aplicada'"
  const p = []
  if (textoId) { sql += ' AND texto_id = ?'; p.push(textoId) }
  if (desde) { sql += ' AND criado_em >= ?'; p.push(desde) }
  sql += ' ORDER BY id DESC'
  const linhas = banco.prepare(sql).all(...p)
  const poe = banco.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?')
  const marca = banco.prepare("UPDATE revisao_troca SET estado = 'desfeita' WHERE id = ?")
  banco.exec('BEGIN')
  try {
    for (const l of linhas) { poe.run(l.antes, l.capitulo_id); marca.run(l.id) }
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
  return linhas.length
}
