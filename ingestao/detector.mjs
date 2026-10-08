// O detector (05/10/2026): acha o que pode estar errado, e NÃO conserta nada.
//
//   node ingestao/detector.mjs exportar      # banco → /dados/achados/palavras.txt
//   (no host)  hunspell -d pt_BR -l < palavras.txt > erradas.txt
//   node ingestao/detector.mjs analisar      # erradas.txt → /dados/achados.db
//   node ingestao/detector.mjs fila [n]      # as n palavras sem decisão, compactas
//   node ingestao/detector.mjs resumo
//
// Quem roda tudo em ordem é infra/detector.sh.
//
// ─────────────────────────────────────────────────────────────
// AS BARREIRAS (o dono: "se ficar tudo automático vai estragar tudo")
//
//   1. O banco do site é aberto com readOnly. Não há UPDATE, INSERT nem
//      DELETE contra ele neste arquivo — o teste "detector: nunca escreve no
//      banco do site" lê este fonte e falha se aparecer um.
//   2. Tudo o que o detector descobre vai para OUTRO arquivo, achados.db.
//      Apagar achados.db volta tudo ao que era; o site nem sabe que ele existe.
//   3. Decidir é coisa de gente: a coluna `decisao` só é preenchida por quem
//      revisa (a fila), e aplicar no site é um passo separado, que ainda não
//      existe — vai nascer com cópia do banco e desfazer, como a revisora.
//
// ─────────────────────────────────────────────────────────────
// POR QUE POR PALAVRA, E NÃO POR FRASE
//
// O mesmo erro se repete pelo acervo: "queer" 268 vezes, "marshal" 194,
// "fluttered" 93. Decidir a PALAVRA uma vez, olhando uma frase de exemplo,
// vale para todas as ocorrências. É o que torna a revisão barata.
//
// Nome próprio fica de fora pela caixa: palavra que só aparece com maiúscula
// é tratada como nome (Heathcliff, Joseph). Só entra na fila a palavra que
// aparece em minúscula pelo menos uma vez — é aí que mora o erro.
// ─────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { padronizar, candidatoDe, emOutraLingua, SUBSTANTIVO_DE_TITULO, caixaDeTitulo, limparCaracteres } from './padronizar-titulos.mjs'

const BANCO = process.env.FIO_BANCO || '/dados/catalogo.db'
const PASTA = process.env.FIO_ACHADOS || '/dados/achados'
const ACHADOS = PASTA + '.db'
const PALAVRA = /\p{L}+(?:['’-]\p{L}+)*/gu

const site = () => new DatabaseSync(BANCO, { readOnly: true })

function achados() {
  const db = new DatabaseSync(ACHADOS)
  db.exec(`
    CREATE TABLE IF NOT EXISTS palavra (
      palavra     TEXT PRIMARY KEY,          -- em minúscula
      ocorrencias INTEGER NOT NULL,
      livros      INTEGER NOT NULL,
      exemplo     TEXT,                      -- a frase onde apareceu
      obra_id     INTEGER,
      classe      TEXT,                      -- ver CLASSES abaixo
      proposta    TEXT,                      -- o que a máquina sugere; NULL = só gente decide
      prova       TEXT,                      -- classe nome: JSON das obras onde o original prova
      decisao     TEXT CHECK (decisao IN ('trocar', 'manter', 'frase')),
      troca       TEXT,                      -- quando decisao = 'trocar'
      decidido_em TEXT
    );
    CREATE TABLE IF NOT EXISTS titulo (
      obra_id     INTEGER PRIMARY KEY,
      antes       TEXT NOT NULL,
      proposta    TEXT NOT NULL,
      regras      TEXT,
      duvida      TEXT,                      -- por que precisa de olho; NULL = seguro
      decisao     TEXT CHECK (decisao IN ('aceitar', 'corrigir', 'manter')),
      final       TEXT,
      decidido_em TEXT
    );
    CREATE TABLE IF NOT EXISTS rodada (quando TEXT, o_que TEXT, numeros TEXT);
  `)
  return db
}

/** A frase em volta de uma posição, curta o bastante para caber numa linha. */
function frase(texto, i, n) {
  const ini = Math.max(texto.lastIndexOf('. ', i) + 2, i - 90, 0)
  const fim = Math.min(texto.length, i + n + 70)
  return texto.slice(ini, fim).replace(/\s+/g, ' ').trim()
}

function exportar() {
  mkdirSync(PASTA, { recursive: true })
  const db = site()
  const textos = db.prepare(`SELECT t.id, t.obra_id FROM texto t
    WHERE t.revisao = 'automatica' AND t.dono_id IS NULL`).all()
  const caps = db.prepare('SELECT corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem')
  // palavra (minúscula) → { n, minusc, livros:Set, ex, obra }
  const tipos = new Map()
  // A CAIXA NO ORIGINAL DO MESMO LIVRO (05/10, segunda versão). A primeira
  // somava os originais de todos os livros e errou o rabo da lista: "um
  // raglan" (o casaco), "_bouillon_" (o caldo), o latim "mors". A prova agora
  // é por livro e sem exceção: no original DAQUELE livro a palavra aparece ao
  // menos 3 vezes, e NENHUMA em minúscula. Só então "athos" → "Athos" ali.
  const provaNome = new Map() // minúscula → Set(obra) onde está provado
  let comOriginal = 0
  for (const t of textos) {
    const doLivro = new Map() // palavras em minúscula NESTA tradução
    for (const { corpo } of caps.all(t.id)) {
      const texto = String(corpo ?? '').replace(/<[^>]+>/g, ' ').normalize('NFC')
      for (const m of texto.matchAll(PALAVRA)) {
        const w = m[0]
        const k = w.toLowerCase()
        let e = tipos.get(k)
        if (!e) { e = { n: 0, minusc: 0, livros: new Set(), ex: null, obra: null }; tipos.set(k, e) }
        e.n++
        e.livros.add(t.obra_id)
        if (w[0] === k[0]) {
          e.minusc++
          doLivro.set(k, (doLivro.get(k) ?? 0) + 1)
          if (!e.ex) { e.ex = frase(texto, m.index, w.length); e.obra = t.obra_id }
        }
      }
    }
    // Os originais moram em /dados/originais/<texto_id>.txt (baixar-originais.mjs):
    // a esteira nunca os guardou no banco.
    const arq = `/dados/originais/${t.id}.txt`
    if (!existsSync(arq)) continue
    comOriginal++
    const caixa = new Map() // k → [maiúscula, minúscula] no original deste livro
    for (const m of readFileSync(arq, 'utf8').matchAll(PALAVRA)) {
      const k = m[0].toLowerCase()
      if (!doLivro.has(k)) continue
      const c = caixa.get(k) ?? [0, 0]
      m[0][0] === k[0] ? c[1]++ : c[0]++
      caixa.set(k, c)
    }
    for (const [k, [mai, min]] of caixa) {
      if (mai >= 3 && min === 0) { const s = provaNome.get(k) ?? new Set(); s.add(t.obra_id); provaNome.set(k, s) }
    }
  }
  console.log(`originais no disco: ${comOriginal} de ${textos.length}`)
  // títulos: a proposta E o título de antes vão ao corretor — saber se a
  // palavra de antes já era válida é o que separa "Chronica→Crônica" (bom)
  // de "Bebes→Bebês" (a regra mexeu numa palavra que estava certa)
  const titulos = db.prepare('SELECT id, COALESCE(titulo_pt, titulo) titulo FROM obra WHERE publicada = 1').all()
  const doTitulo = new Set()
  for (const o of titulos) {
    for (const m of padronizar(o.titulo, { glossario: glossarioTitulos() }).depois.matchAll(PALAVRA)) {
      doTitulo.add(m[0])
      const c = candidatoDe(m[0])   // a forma de hoje também vai ao dicionário
      if (c) doTitulo.add(c)
    }
    for (const m of o.titulo.normalize('NFC').matchAll(PALAVRA)) doTitulo.add(m[0])
  }

  const lista = [...tipos].filter(([, e]) => e.minusc > 0).map(([k]) => k)
  writeFileSync(PASTA + '/palavras.txt', [...new Set([...lista, ...doTitulo])].join('\n') + '\n')
  writeFileSync(PASTA + '/tipos.json', JSON.stringify(Object.fromEntries(
    [...tipos].filter(([, e]) => e.minusc > 0).map(([k, e]) => [k, [e.n, e.livros.size, e.ex, e.obra, provaNome.has(k) ? [...provaNome.get(k)] : null]]))))
  console.log(`${textos.length} livros, ${tipos.size} palavras distintas, ${lista.length} com minúscula; ${doTitulo.size} palavras de ${titulos.length} títulos`)
}

// ─────────────────────────────────────────────────────────────
// AS CLASSES — o que separa o trabalho da máquina do meu
//
//   frase-estrangeira  the, und, le…: palavra de função de outra língua. O
//                      defeito é a FRASE inteira; quem resolve é a revisora
//                      (retradução com a trava de invenção), não troca de palavra.
//   nome               no texto ORIGINAL só aparece com maiúscula (≥ 95%, ≥ 3
//                      vezes): "athos" → "Athos". Provado pelo original.
//   grafia             idéia, jóias, direcção: a forma de hoje é única e o
//                      corretor a conhece. Regra mecânica, conferida no dicionário.
//   lixo               &amp; que virou palavra ("amp"), entidade HTML.
//   romano             ii, xiv: numeral, fica.
//   revisar            o resto — palavra estrangeira solta ou inventada.
//                      É a ÚNICA classe que precisa de olho humano palavra a palavra.
// ─────────────────────────────────────────────────────────────

const FUNCAO_ESTRANGEIRA = new Set(('the and of to was that his her with had for which you not but they this from have were he she it is be at by my me him all so on as are would could will an or if no what when there their them been one said ' +
  'und der die das nicht ich sie ist den es ein eine mit sich auf dem für war aber auch als noch daß dass zu von wie wenn er ihm ihn ' +
  'le les et une il elle qui dans pas pour sur ne ce est plus par mais avec nous vous du au aux').split(' '))
const LIXO = new Set(['amp', 'nbsp', 'quot', 'lt', 'gt', 'apos', 'mdash', 'ndash'])
const ROMANO = /^(?=[ivxlcdm]{2,7}$)m*(c[md]|d?c{0,3})(x[cl]|l?x{0,3})(i[xv]|v?i{0,3})$/

/** A forma de hoje de uma grafia antiga ou portuguesa, se houver uma só. */
export function grafiaDeHoje(w) {
  let c = w
    .replace(/éi(?=\p{L})/u, 'ei').replace(/ói(?=\p{L})/u, 'oi')    // idéia, jóia, assembléia
    .replace(/cç/g, 'ç').replace(/pç/g, 'ç')                         // acção, direcção, recepção
    .replace(/c(?=t[aeiouáéíóú])/g, '').replace(/p(?=t[aeiouáéíóú])/g, '') // actual, óptimo
    .replace(/ü/g, 'u')                                              // freqüente
  return c !== w ? c : null
}

/** Gera as formas candidatas de grafia, para o corretor conferir (infra/detector.sh). */
function candidatos() {
  const erradas = readFileSync(PASTA + '/erradas.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
  const mapa = {}
  for (const w of erradas) { const c = grafiaDeHoje(w); if (c) mapa[w] = c }
  writeFileSync(PASTA + '/candidatos.json', JSON.stringify(mapa))
  writeFileSync(PASTA + '/candidatos.txt', [...new Set(Object.values(mapa))].join('\n') + '\n')
  console.log(`${Object.keys(mapa).length} grafias antigas com forma de hoje candidata`)
}

// A frase de exemplo está em português? (latim e citações estrangeiras não)
const FUNCAO_PT = new Set('que de não para com uma dos das os um em no na se por como mais ele ela era foi ao do da seu sua mas quando muito sem'.split(' '))
function emPortugues(frase) {
  const ws = String(frase ?? '').toLowerCase().match(/\p{L}+/gu) ?? []
  const pt = ws.filter((w) => FUNCAO_PT.has(w)).length
  const fora = ws.filter((w) => FUNCAO_ESTRANGEIRA.has(w)).length
  return pt >= 2 && pt > fora * 2
}

/**
 * Grafia de hoje, com duas forças diferentes (05/10, segunda versão):
 *   - acento e trema (idéia, jóia, freqüente): a forma antiga é brasileira
 *     de antes de 2009, a regra é exata — basta o dicionário conhecer a nova;
 *   - consoante muda de Portugal (acção, actual): na amostra a regra também
 *     pegou latim ("voluptas→volutas") e erro de digitação ("empactou→empatou",
 *     que era "empacotou"). Só vale com uso real — 2+ livros ou 5+ vezes — e
 *     com a frase em português; o resto vai para olho humano.
 */
function grafiaConfiavel(k, grafia, oc, livros, exemplo) {
  if (!grafia) return null
  const soAcento = k.replace(/ü/g, 'u').replace(/éi/g, 'ei').replace(/ói/g, 'oi') === grafia
  if (soAcento) return grafia
  if ((livros >= 2 || oc >= 5) && emPortugues(exemplo)) return grafia
  return null
}

function classificar(k, provaNome, grafia) {
  if (FUNCAO_ESTRANGEIRA.has(k)) return ['frase-estrangeira', null]
  if (LIXO.has(k)) return ['lixo', '']
  if (ROMANO.test(k)) return ['romano', null]
  // provado no original do MESMO livro; a troca vale só nesses livros (coluna prova)
  if (provaNome?.length) return ['nome', k[0].toUpperCase() + k.slice(1)]
  if (grafia) return ['grafia', grafia]
  return ['revisar', null]
}

function analisar() {
  if (!existsSync(PASTA + '/erradas.txt')) throw new Error('falta erradas.txt — rode o hunspell (infra/detector.sh)')
  const erradas = new Set(readFileSync(PASTA + '/erradas.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean))
  const tipos = JSON.parse(readFileSync(PASTA + '/tipos.json', 'utf8'))
  // grafia candidata que o corretor TAMBÉM não conhece não vale
  const cand = existsSync(PASTA + '/candidatos.json') ? JSON.parse(readFileSync(PASTA + '/candidatos.json', 'utf8')) : {}
  const candRuins = existsSync(PASTA + '/candidatos-erradas.txt')
    ? new Set(readFileSync(PASTA + '/candidatos-erradas.txt', 'utf8').split('\n').map((s) => s.trim())) : new Set(Object.values(cand))
  const db = achados()
  db.exec('BEGIN')
  // decisões já tomadas sobrevivem a uma nova rodada: só números e classe mudam
  const poe = db.prepare(`INSERT INTO palavra (palavra, ocorrencias, livros, exemplo, obra_id, classe, proposta, prova) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(palavra) DO UPDATE SET ocorrencias = excluded.ocorrencias, livros = excluded.livros,
      classe = excluded.classe, proposta = excluded.proposta, prova = excluded.prova`)
  let n = 0
  for (const [k, [oc, livros, ex, obra, provaNome]] of Object.entries(tipos)) {
    if (!erradas.has(k)) continue
    const grafia = grafiaConfiavel(k, cand[k] && !candRuins.has(cand[k]) ? cand[k] : null, oc, livros, ex)
    const [classe, proposta] = classificar(k, provaNome, grafia)
    poe.run(k, oc, livros, ex, obra, classe, proposta, classe === 'nome' ? JSON.stringify(provaNome) : null)
    n++
  }

  const s = site()
  const titulos = s.prepare('SELECT id, COALESCE(titulo_pt, titulo) titulo FROM obra WHERE publicada = 1').all()
  const poeT = db.prepare(`INSERT INTO titulo (obra_id, antes, proposta, regras, duvida) VALUES (?,?,?,?,?)
    ON CONFLICT(obra_id) DO UPDATE SET antes = excluded.antes, proposta = excluded.proposta,
      regras = excluded.regras, duvida = excluded.duvida WHERE titulo.decisao IS NULL`)
  let seguros = 0, duvidosos = 0
  for (const o of titulos) {
    const { depois, regras } = padronizar(o.titulo, { valida: (w) => !erradas.has(w), glossario: glossarioTitulos() })
    // DÚVIDA, só quando há motivo concreto:
    //   - palavra em minúscula que o corretor não conhece, no título final;
    //   - a regra MEXEU numa palavra que já era válida ("Bebes→Bebês",
    //     "Alias→Aliás", "the→te"): trocar palavra certa é o erro da regra;
    //   - o título está em outra língua (tradução é decisão, não regra).
    const valida = (w) => !erradas.has(w) && !erradas.has(w.toLowerCase())
    const A = [...o.titulo.matchAll(PALAVRA)].map((m) => m[0])
    const D = [...depois.matchAll(PALAVRA)].map((m) => m[0])
    const emD = new Set(D.map((w) => w.toLowerCase()))
    const emA = new Set(A.map((w) => w.toLowerCase()))
    const novas = D.filter((w) => !emA.has(w.toLowerCase()))
    const mexidas = A.filter((a) => !emD.has(a.toLowerCase()) && valida(a) && !SUBSTANTIVO_DE_TITULO[a.toLowerCase()]
      && novas.some((d) => d.slice(0, 2).toLowerCase() === a.slice(0, 2).toLowerCase() && Math.abs(d.length - a.length) <= 2))
    const desconhecidas = D.filter((w) => w[0] === w[0].toLowerCase() && erradas.has(w))
    const estrangeiro = emOutraLingua(o.titulo)
    const motivos = []
    if (mexidas.length) motivos.push('mexeu em palavra válida: ' + mexidas.slice(0, 3).join(', '))
    if (desconhecidas.length) motivos.push('desconhecidas: ' + desconhecidas.slice(0, 4).join(', '))
    if (estrangeiro) motivos.push('outra língua')
    if (depois === o.titulo && !motivos.length) continue
    const duvida = motivos.length ? motivos.join('; ') : null
    duvida ? duvidosos++ : seguros++
    poeT.run(o.id, o.titulo, depois, regras.join(','), duvida)
  }
  db.prepare('INSERT INTO rodada VALUES (datetime(\'now\'), ?, ?)').run('analisar',
    JSON.stringify({ palavras: n, titulosSeguros: seguros, titulosDuvidosos: duvidosos }))
  db.exec('COMMIT')
  console.log(`palavras que o corretor não conhece: ${n}; títulos: ${seguros} seguros, ${duvidosos} com dúvida`)
}

// As decisões por palavra nos títulos (quem revisa escreve; o detector só lê)
let _glossarioTitulos
function glossarioTitulos() {
  if (_glossarioTitulos === undefined) {
    const arq = PASTA + '/glossario-titulos.json'
    _glossarioTitulos = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : {}
  }
  return _glossarioTitulos
}

/** Palavras desconhecidas dos títulos em português, uma vez cada: palavra|n|exemplo */
function palavrasDeTitulo() {
  const db = achados()
  const conta = new Map()
  for (const r of db.prepare(`SELECT antes, proposta, duvida FROM titulo WHERE decisao IS NULL AND duvida LIKE '%desconhecidas%'`).all()) {
    if (emOutraLingua(r.antes)) continue
    const lista = /desconhecidas: ([^;]+)/.exec(r.duvida)?.[1].split(', ') ?? []
    for (const w of lista) { const e = conta.get(w) ?? { n: 0, ex: r.proposta }; e.n++; conta.set(w, e) }
  }
  for (const [w, e] of [...conta].sort((a, b) => b[1].n - a[1].n)) console.log(`${w}|${e.n}|${String(e.ex).replace(/\s+/g, ' ').slice(0, 90)}`)
}

/** Títulos em outra língua, para traduzir: id|título */
function titulosEstrangeiros() {
  const db = achados()
  for (const r of db.prepare('SELECT obra_id, antes FROM titulo WHERE decisao IS NULL ORDER BY obra_id').all()) {
    if (emOutraLingua(r.antes)) console.log(`${r.obra_id}|${String(r.antes).replace(/\s+/g, ' ')}`)
  }
}

/**
 * A lista FINAL dos títulos, para a última leitura antes de gravar:
 * tradução decidida (traducoes-titulos.json) vence; senão o padronizador com
 * dicionário e glossário. Escreve titulos-final.json e imprime id|antes|depois.
 */
function titulosFinal() {
  const erradas = new Set(readFileSync(PASTA + '/erradas.txt', 'utf8').split('\n').map((x) => x.trim()).filter(Boolean))
  const arq = PASTA + '/traducoes-titulos.json'
  const traducoes = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : {}
  const s = site()
  const final = []
  for (const o of s.prepare('SELECT id, titulo, titulo_pt FROM obra WHERE publicada = 1 ORDER BY id').all()) {
    const atual = o.titulo_pt ?? o.titulo
    const depois = traducoes[o.id] ?? padronizar(atual, { valida: (w) => !erradas.has(w), glossario: glossarioTitulos() }).depois
    if (depois !== atual) final.push({ id: o.id, antes: atual, depois })
  }
  writeFileSync(PASTA + '/titulos-final.json', JSON.stringify(final, null, 1))
  for (const r of final) console.log(`${r.id}|${r.antes.replace(/\s+/g, ' ')}|${r.depois.replace(/\s+/g, ' ')}`)
}

/** Palavras com MAIÚSCULA que o dicionário modernizaria: palavra>candidata|n|exemplo */
function tituloMaiusculas() {
  const erradas = new Set(readFileSync(PASTA + '/erradas.txt', 'utf8').split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean))
  const valida = (w) => !erradas.has(w)
  const conta = new Map()
  for (const o of site().prepare('SELECT COALESCE(titulo_pt, titulo) t FROM obra WHERE publicada = 1').all()) {
    const depois = padronizar(o.t, { valida, glossario: glossarioTitulos() }).depois
    if (emOutraLingua(depois)) continue
    for (const m of depois.matchAll(PALAVRA)) {
      const w = m[0]
      if (w[0] === w[0].toLowerCase() || valida(w)) continue
      const c = candidatoDe(w)
      if (!c || !valida(c)) continue
      const e = conta.get(w) ?? { c, n: 0, ex: depois }
      e.n++
      conta.set(w, e)
    }
  }
  for (const [w, e] of [...conta].sort((a, b) => b[1].n - a[1].n)) console.log(w + '>' + e.c + '|' + e.n + '|' + e.ex.slice(0, 80))
}

/**
 * Caixa de título + limpeza de caracteres sobre o título ATUAL (05/10).
 * Escreve titulos-final.json (o que aplicar-titulos.mjs grava) e imprime só
 * o que precisa de olho: limpeza de caractere, romano, parte com hífen.
 * Troca de caixa simples ("romance" → "Romance", "Do" → "do") é regra fixa.
 */
function titulosCaixa() {
  const arqM = PASTA + '/traducoes-titulos.json'
  const maos = existsSync(arqM) ? JSON.parse(readFileSync(arqM, 'utf8')) : {}
  const final = []
  const olhar = []
  const simples = (a, d) => {
    const A = a.split(/\s+/), D = d.split(/\s+/)
    if (A.length !== D.length) return false
    return A.every((w, i) => w === D[i] || (w.toLowerCase() === D[i].toLowerCase() && !/[-'’]/.test(w) && !/^[ivxlIVXL]{2,}[.,:;)]*$/.test(D[i])))
  }
  for (const o of site().prepare('SELECT id, COALESCE(titulo_pt, titulo) t FROM obra WHERE publicada = 1 ORDER BY id').all()) {
    const limpo = limparCaracteres(o.t)
    // decisão tomada à mão vence a regra
    const depois = maos[o.id] ?? (emOutraLingua(limpo) ? limpo : caixaDeTitulo(limpo))
    if (depois === o.t) continue
    final.push({ id: o.id, antes: o.t, depois })
    if (!simples(o.t, depois)) olhar.push(o.id + '|' + o.t + '|' + depois)
  }
  writeFileSync(PASTA + '/titulos-final.json', JSON.stringify(final, null, 1))
  console.log('# ' + final.length + ' mudam; ' + (final.length - olhar.length) + ' só de caixa simples; ' + olhar.length + ' para olhar')
  for (const l of olhar) console.log(l)
}

function fila(qtd = 200) {
  const db = achados()
  for (const r of db.prepare(`SELECT palavra, ocorrencias, livros, exemplo FROM palavra
    WHERE decisao IS NULL AND classe = 'revisar' ORDER BY ocorrencias DESC LIMIT ?`).all(qtd)) {
    console.log(`${r.palavra}|${r.ocorrencias}/${r.livros}|${String(r.exemplo ?? '').slice(0, 110)}`)
  }
}

/** Os títulos que precisam de olho, compactos: id|antes|proposta|por quê */
function titulosEmDuvida(qtd = 300, pular = 0) {
  const db = achados()
  for (const r of db.prepare(`SELECT obra_id, antes, proposta, duvida FROM titulo
    WHERE decisao IS NULL AND duvida IS NOT NULL ORDER BY obra_id LIMIT ? OFFSET ?`).all(qtd, pular)) {
    const um = (x) => String(x).replace(/\s+/g, ' ')
    console.log(`${r.obra_id}|${um(r.antes)}|${r.proposta === r.antes ? '=' : um(r.proposta)}|${r.duvida}`)
  }
}

function resumo() {
  const db = achados()
  const um = (sql) => db.prepare(sql).get()
  console.log(JSON.stringify({
    palavras: um('SELECT COUNT(*) n, SUM(ocorrencias) oc FROM palavra'),
    palavrasSemDecisao: um('SELECT COUNT(*) n, SUM(ocorrencias) oc FROM palavra WHERE decisao IS NULL'),
    top100cobre: um('SELECT SUM(ocorrencias) oc FROM (SELECT ocorrencias FROM palavra ORDER BY ocorrencias DESC LIMIT 100)'),
    top1000cobre: um('SELECT SUM(ocorrencias) oc FROM (SELECT ocorrencias FROM palavra ORDER BY ocorrencias DESC LIMIT 1000)'),
    soUmaVez: um('SELECT COUNT(*) n FROM palavra WHERE ocorrencias = 1'),
    porClasse: db.prepare('SELECT classe, COUNT(*) n, SUM(ocorrencias) oc FROM palavra GROUP BY classe ORDER BY oc DESC').all(),
    revisarTop1000cobre: um("SELECT SUM(ocorrencias) oc FROM (SELECT ocorrencias FROM palavra WHERE classe = 'revisar' ORDER BY ocorrencias DESC LIMIT 1000)"),
    titulos: db.prepare('SELECT (duvida IS NOT NULL) duvida, COUNT(*) n FROM titulo GROUP BY 1').all(),
  }))
}

const [modo, arg] = process.argv.slice(2)
if (modo === 'exportar') exportar()
else if (modo === 'candidatos') candidatos()
else if (modo === 'analisar') analisar()
else if (modo === 'fila') fila(Number(arg) || 200)
else if (modo === 'resumo') resumo()
else if (modo === 'titulos-caixa') titulosCaixa()
else if (modo === 'titulo-maiusculas') tituloMaiusculas()
else if (modo === 'titulos-final') titulosFinal()
else if (modo === 'titulo-palavras') palavrasDeTitulo()
else if (modo === 'titulos-estrangeiros') titulosEstrangeiros()
else if (modo === 'titulos') titulosEmDuvida(Number(arg) || 300, Number(process.argv[4]) || 0)
else if (modo) { console.error('modo desconhecido: ' + modo); process.exit(1) }
