// O gosto de cada leitor, as recomendações e a central de avisos.
//
// ─────────────────────────────────────────────────────────────
// A IDEIA (pedido do dono, 16/09/2026)
//
// Conta nova começa respondendo do que gosta — humores, autores, livros que já
// ama, quanto tempo tem — e sai com recomendações na hora. Depois, o que ela
// LÊ passa a pesar mais do que o que ela DISSE: gosto muda, e o questionário
// de um dia não pode mandar para sempre. Contas antigas não são interrompidas
// por nada; se quiserem, respondem na central.
//
// ─────────────────────────────────────────────────────────────
// COMO SE RECOMENDA — e por que não há "IA" aqui
//
// A recomendação é uma conta aberta, com o motivo escrito: cada livro candidato
// soma pontos pelo que tem em comum com as SEMENTES (o que a pessoa leu, o que
// disse amar) e pelos humores e autores que ela escolheu. As ligações vêm da
// curadoria da casa: as conexões de "Este livro conversa com", as seções de
// descoberta, os temas, o autor. O ponto mais forte vira a frase — "porque
// você leu Crime e Castigo" — e é por isso que ele nunca é "porque o algoritmo
// quis".
//
// O peso do que foi DITO encolhe conforme a pessoa lê de verdade (leitura de
// cinco minutos ou mais): 1/(1 + leituras/5). E cada leitura pesa pelo tempo
// que ela durou e pela idade — meia-vida de cerca de um mês e meio.
//
// ─────────────────────────────────────────────────────────────
// OS AVISOS
//
// Não há relógio rodando em lugar nenhum: os avisos nascem quando a pessoa
// aparece (o cabeçalho pergunta quantos há), e cada um tem uma CHAVE única
// ("pronto:5004", "semana:2026-38"). Gerar duas vezes não duplica nada.
//   - boas-vindas, quando o gosto é respondido;
//   - "já dá para ler", quando um livro da lista dela ganhou texto depois de
//     ela o marcar;
//   - "continue", quando uma leitura de verdade parou há dias;
//   - "da semana", com as recomendações novas, uma vez por semana.
// ─────────────────────────────────────────────────────────────

import { readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ── as opções do questionário: listas fechadas ──
//
// Fechadas porque o que se grava é escolha, não texto livre: não há o que
// sanear, e não há como alguém enfiar um "humor" que vire HTML em outra tela.
export const HUMORES = [
  { chave: 'pensar', rotulo: '🧠 Pensar', frase: 'para quem quer pensar',
    colecoes: ['Livros que mudam a maneira de ver o mundo', 'Como devo viver?', 'Rota: entender Nietzsche'], temas: ['Filosofia'] },
  { chave: 'aventura', rotulo: '⚔️ Aventura', frase: 'para quem quer aventura',
    colecoes: ['Progressão: de ninguém a lenda', 'Poder, reis e impérios'], temas: ['Aventura'] },
  { chave: 'mundo', rotulo: '🌌 Entrar em outro mundo', frase: 'para quem quer entrar em outro mundo',
    colecoes: ['Entrar em outro mundo', 'Se você gostou de Fundação', 'Rota: a ficção científica desde o começo'], temas: ['Ficção científica', 'Fantasia'] },
  { chave: 'poder', rotulo: '🏛 Entender o poder', frase: 'para quem quer entender o poder',
    colecoes: ['Poder, reis e impérios', 'Rota: entender o Estado'], temas: ['Política e sociedade'] },
  { chave: 'espelho', rotulo: '🕯 Me olhar por dentro', frase: 'para quem quer se olhar por dentro',
    colecoes: ['O homem contra ele mesmo', 'Entre na cabeça de alguém'], temas: ['Psicologia'] },
  { chave: 'estranho', rotulo: '🌀 Algo estranho', frase: 'para quem gosta do estranho',
    colecoes: ['Livros estranhos', 'Terror e o gótico'], temas: [] },
  { chave: 'historia', rotulo: '🗺 Entender a história', frase: 'para quem quer entender a história',
    colecoes: ['Como chegamos até aqui'], temas: ['História', 'Biografia e memórias'] },
  { chave: 'brasil', rotulo: '🇧🇷 Ler o Brasil', frase: 'para quem quer ler o Brasil',
    colecoes: ['Brasil que merece ser descoberto', 'Machado de Assis, do começo ao fim'], temas: [] },
  { chave: 'lei', rotulo: '⚖️ Direito e Estado', frase: 'para quem estuda Direito',
    colecoes: ['A lei, na íntegra', 'Rota: entender o Estado'], temas: ['Direito'] },
  { chave: 'baki', rotulo: '🥋 Combate e disciplina', frase: 'para quem gosta de luta e disciplina',
    colecoes: ['Se você gostou de Baki'], temas: [] },
]

export const AUTORES = [
  ['Dostoiévski', 'Dostoi'], ['Kafka', 'Kafka'], ['Nietzsche', 'Nietzsche'], ['Machado de Assis', 'Machado de Assis'],
  ['Orwell', 'Orwell'], ['Júlio Verne', 'Verne'], ['H. G. Wells', 'Wells'], ['Edgar Allan Poe', 'Poe'],
  ['Maquiavel', 'Maquiavel'], ['Marco Aurélio', 'Marco Aur'], ['Shakespeare', 'Shakespeare'], ['Tolstói', 'Tolst'],
  ['Eça de Queirós', 'Eça'], ['Lovecraft', 'Lovecraft'], ['Platão', 'Platão'], ['Schopenhauer', 'Schopenhauer'],
  ['Lima Barreto', 'Lima Barreto'], ['Edgar Rice Burroughs', 'Burroughs'], ['Mary Shelley', 'Shelley'], ['Lewis Carroll', 'Carroll'],
].map(([rotulo, busca]) => ({ rotulo, busca }))

// Os livros do "quais destes você já ama?": famosos, legíveis e variados.
export const VITRINE = [1096, 1097, 4982, 816, 1075, 940, 1051, 1062, 1076, 545, 1171, 4990, 4987, 4984,
  4992, 1449, 4996, 1099, 1409, 1609, 2667, 3043, 1083, 4980, 1077, 1106, 2821, 4994, 2665, 1810]

export const TEMPOS = [
  { chave: 'curto', rotulo: '⚡ Meia hora, uma hora', cabe: (m) => m && m <= 90 },
  { chave: 'tarde', rotulo: '☕ Uma tarde', cabe: (m) => m && m > 60 && m <= 400 },
  { chave: 'longo', rotulo: '🏔 Livro para morar dentro', cabe: (m) => m && m >= 400 },
  { chave: 'tanto', rotulo: 'Tanto faz', cabe: () => false },
]

export const EVITAR = ['Poesia', 'Teatro', 'Religião']

// As coleções que não dizem nada sobre gosto — são termômetro ou lista pessoal.
const COLECOES_NEUTRAS = new Set(['Todo mundo está lendo', 'Top 10 — Política no Brasil', 'Da sua lista'])

// ─────────────────────────────────────────────────────────────
// Tabelas
// ─────────────────────────────────────────────────────────────

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS gosto (
      leitor_id     INTEGER PRIMARY KEY REFERENCES leitor(id) ON DELETE CASCADE,
      respostas     TEXT NOT NULL DEFAULT '{}',
      pedido        INTEGER NOT NULL DEFAULT 0,  -- 1 = conta nova, a casa pede o questionário
      respondido_em TEXT,
      mudou_em      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS aviso (
      id        INTEGER PRIMARY KEY,
      leitor_id INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      chave     TEXT NOT NULL,
      tipo      TEXT NOT NULL,
      titulo    TEXT NOT NULL,
      corpo     TEXT,
      link      TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      lido_em   TEXT,
      UNIQUE (leitor_id, chave)
    );
    CREATE INDEX IF NOT EXISTS idx_aviso_leitor ON aviso(leitor_id, criado_em DESC);`)
}

/** Conta nova: a casa vai pedir o questionário. Conta antiga nunca passa aqui. */
export function marcarContaNova(banco, leitorId) {
  banco.prepare('INSERT OR IGNORE INTO gosto (leitor_id, pedido) VALUES (?, 1)').run(leitorId)
}

// ─────────────────────────────────────────────────────────────
// O catálogo que o motor enxerga: o MESMO que o site publica
// ─────────────────────────────────────────────────────────────

/** Monta o índice a partir do catalogo.json e das fichas (puro, testável). */
export function montarIndice(catalogo, lerFicha = () => null) {
  const obras = new Map(catalogo.obras.map((o) => [o.id, o]))
  const colecoesDe = new Map()
  for (const c of catalogo.colecoes ?? []) {
    if (COLECOES_NEUTRAS.has(c.nome)) continue
    for (const id of c.obras) {
      if (!colecoesDe.has(id)) colecoesDe.set(id, new Set())
      colecoesDe.get(id).add(c.nome)
    }
  }
  const conexoes = new Map(), tags = new Map()
  const liga = (a, b) => { if (!conexoes.has(a)) conexoes.set(a, new Set()); conexoes.get(a).add(b) }
  for (const id of colecoesDe.keys()) {
    const f = lerFicha(id)
    if (!f) continue
    for (const c of f.conexoes ?? []) { liga(id, c.id); liga(c.id, id) }
    if (f.tags?.length) tags.set(id, new Set(f.tags))
  }
  return { obras, colecoesDe, conexoes, tags, legiveis: catalogo.obras.filter((o) => o.trilho === 'A') }
}

let cache = null
export function indiceDoSite(estatico) {
  const caminho = join(estatico, 'dados', 'catalogo.json')
  if (!existsSync(caminho)) return null
  const mtime = statSync(caminho).mtimeMs
  if (cache?.mtime === mtime) return cache.indice
  const catalogo = JSON.parse(readFileSync(caminho, 'utf8'))
  const lerFicha = (id) => {
    try { return JSON.parse(readFileSync(join(estatico, 'dados', 'fichas', `${id}.json`), 'utf8')) } catch { return null }
  }
  cache = { mtime, indice: montarIndice(catalogo, lerFicha) }
  return cache.indice
}

// ─────────────────────────────────────────────────────────────
// Os sinais de um leitor
// ─────────────────────────────────────────────────────────────

const DIA = 86400000

export function lerSinais(banco, leitorId) {
  const linhas = banco.prepare(
    "SELECT tipo, chave, valor, mudou_em FROM guardado WHERE leitor_id = ? AND tipo IN ('progresso','estante') AND valor IS NOT NULL",
  ).all(leitorId)
  const progresso = new Map(), estante = new Map()
  for (const l of linhas) {
    let v; try { v = JSON.parse(l.valor) } catch { continue }
    const id = Number(l.chave)
    if (!Number.isInteger(id)) continue
    if (l.tipo === 'progresso') progresso.set(id, { ...v, mudouEm: l.mudou_em })
    else estante.set(id, { estado: v, mudouEm: l.mudou_em })
  }
  const notas = new Map(banco.prepare('SELECT obra_id, nota FROM avaliacao WHERE leitor_id = ? AND nota IS NOT NULL')
    .all(leitorId).map((a) => [a.obra_id, a.nota]))
  const g = banco.prepare('SELECT respostas, pedido, respondido_em, mudou_em FROM gosto WHERE leitor_id = ?').get(leitorId)
  let respostas = {}
  try { respostas = JSON.parse(g?.respostas ?? '{}') } catch { respostas = {} }
  return { progresso, estante, notas, respostas, pedido: !!g?.pedido && !g?.respondido_em, gostoMudou: g?.mudou_em ?? '' }
}

// ─────────────────────────────────────────────────────────────
// O motor (puro)
// ─────────────────────────────────────────────────────────────

export function recomendar(indice, sinais, { agora = Date.now(), quantos = 24 } = {}) {
  const { obras, colecoesDe, conexoes, tags, legiveis } = indice
  const r = sinais.respostas ?? {}

  // o que ela já tem nas mãos não é recomendação
  const fora = new Set([...sinais.progresso.keys(), ...sinais.estante.keys(), ...(r.favoritos ?? [])])

  const leiturasReais = [...sinais.progresso.values()].filter((p) => (p.segundos ?? 0) >= 300).length
  const pesoDito = 1 / (1 + leiturasReais / 5)

  // ── sementes: o que ela leu (pelo tempo e pela idade) e o que disse amar ──
  const sementes = new Map()
  for (const [id, p] of sinais.progresso) {
    if (!obras.has(id)) continue
    const idade = Math.max(0, agora - (p.mudouEm ?? agora)) / DIA
    let peso = (0.25 + Math.min(1, (p.segundos ?? 0) / 900)) * Math.exp(-idade / 65)
    if (sinais.estante.get(id)?.estado === 'concluido') peso += 1
    sementes.set(id, { peso, motivo: `porque você leu ${obras.get(id).titulo}` })
  }
  for (const [id, nota] of sinais.notas) {
    if (!obras.has(id)) continue
    const s = sementes.get(id) ?? { peso: 0, motivo: `porque você leu ${obras.get(id).titulo}` }
    s.peso += (nota - 3) * 0.8
    sementes.set(id, s)
  }
  for (const id of r.favoritos ?? []) {
    if (!obras.has(id)) continue
    const s = sementes.get(id) ?? { peso: 0, motivo: `porque você ama ${obras.get(id).titulo}` }
    s.peso += 1.3 * pesoDito
    sementes.set(id, s)
  }

  const humores = HUMORES.filter((h) => (r.humores ?? []).includes(h.chave))
  const autores = AUTORES.filter((a) => (r.autores ?? []).includes(a.rotulo))
  const tempo = TEMPOS.find((t) => t.chave === r.tempo)
  const evitar = new Set((r.evitar ?? []).filter((t) => EVITAR.includes(t)))

  const temSinal = sementes.size > 0 || humores.length > 0 || autores.length > 0
  if (!temSinal) return { obras: [], semSinais: true }

  const pontos = []
  for (const c of legiveis) {
    if (fora.has(c.id)) continue
    let total = 0
    let melhor = { v: 0, motivo: '' }
    const conta = (v, motivo) => { total += v; if (v > melhor.v) melhor = { v, motivo } }
    const colsC = colecoesDe.get(c.id) ?? new Set()

    for (const [sid, s] of sementes) {
      if (s.peso <= 0) continue
      const semente = obras.get(sid)
      let sim = 0
      if (conexoes.get(sid)?.has(c.id)) sim += 3
      const colsS = colecoesDe.get(sid)
      if (colsS) { let n = 0; for (const x of colsC) if (colsS.has(x)) n++; sim += 1.5 * Math.min(2, n) }
      let temasComuns = 0; for (const t of c.temas) if (semente.temas.includes(t)) temasComuns++
      sim += 0.6 * Math.min(3, temasComuns)
      if (c.autorId && c.autorId === semente.autorId) sim += 1.2
      const tS = tags.get(sid), tC = tags.get(c.id)
      if (tS && tC) { for (const t of tC) if (tS.has(t)) sim += 0.5 }
      if (sim > 0) conta(s.peso * sim, s.motivo)
    }
    for (const h of humores) {
      let v = 0
      for (const nome of h.colecoes) if (colsC.has(nome)) v += 1.6
      for (const t of h.temas) if (c.temas.includes(t)) v += 0.5
      if (v) conta(v * pesoDito, h.frase)
    }
    for (const a of autores) {
      if (c.autor?.includes(a.busca)) conta(1.8 * pesoDito, `porque você gosta de ${a.rotulo}`)
    }
    if (total <= 0) continue
    if (c.temas.some((t) => evitar.has(t))) total -= 4
    if (tempo?.cabe(c.minutos)) total += 0.6
    if (colsC.size) total += 0.3            // passou pela curadoria da casa
    if (c.capa || c.capaOL) total += 0.15  // estante com capa é mais convidativa
    if (total > 0.5) pontos.push({ id: c.id, total, motivo: melhor.motivo, autorId: c.autorId })
  }

  pontos.sort((a, b) => b.total - a.total)
  // variedade: no máximo dois do mesmo autor
  const porAutor = new Map(), saida = []
  for (const p of pontos) {
    const n = porAutor.get(p.autorId) ?? 0
    if (p.autorId && n >= 2) continue
    porAutor.set(p.autorId, n + 1)
    saida.push({ id: p.id, motivo: p.motivo })
    if (saida.length >= quantos) break
  }
  return {
    obras: saida,
    resumo: sinais.progresso.size > 0 ? 'pelo que você anda lendo' : 'pelo que você disse gostar',
  }
}

// ─────────────────────────────────────────────────────────────
// Validação do que chega do questionário
// ─────────────────────────────────────────────────────────────

export function limparRespostas(dado) {
  const lista = (v, validos, max) => [...new Set((Array.isArray(v) ? v : []).filter((x) => validos.includes(x)))].slice(0, max)
  return {
    humores: lista(dado.humores, HUMORES.map((h) => h.chave), HUMORES.length),
    autores: lista(dado.autores, AUTORES.map((a) => a.rotulo), AUTORES.length),
    favoritos: lista((Array.isArray(dado.favoritos) ? dado.favoritos : []).map(Number), VITRINE, VITRINE.length),
    tempo: TEMPOS.some((t) => t.chave === dado.tempo) ? dado.tempo : 'tanto',
    evitar: lista(dado.evitar, EVITAR, EVITAR.length),
  }
}

// ─────────────────────────────────────────────────────────────
// Avisos
// ─────────────────────────────────────────────────────────────

function semanaIso(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dia = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dia)
  const ano = t.getUTCFullYear()
  const semana = Math.ceil(((t - Date.UTC(ano, 0, 1)) / DIA + 1) / 7)
  return `${ano}-${String(semana).padStart(2, '0')}`
}

export function avisar(banco, leitorId, { chave, tipo, titulo, corpo = null, link = null }) {
  banco.prepare(`INSERT OR IGNORE INTO aviso (leitor_id, chave, tipo, titulo, corpo, link) VALUES (?,?,?,?,?,?)`)
    .run(leitorId, chave, tipo, titulo, corpo, link)
}

const ultimaGeracao = new Map()

/** Gera, sem duplicar, os avisos que o momento pede. No máximo a cada 5 min por leitor. */
export function gerarAvisos(banco, leitorId, indice, { agora = Date.now() } = {}) {
  if (agora - (ultimaGeracao.get(leitorId) ?? 0) < 5 * 60000) return
  ultimaGeracao.set(leitorId, agora)
  if (ultimaGeracao.size > 5000) ultimaGeracao.clear()
  if (!indice) return

  const sinais = lerSinais(banco, leitorId)
  const textoEm = banco.prepare(`SELECT MAX(criado_em) m FROM texto WHERE obra_id = ? AND idioma = 'pt' AND normalizado = 1`)

  // "já dá para ler": estava na lista antes de o texto chegar
  for (const [id, e] of sinais.estante) {
    if (e.estado !== 'quero_ler') continue
    const o = indice.obras.get(id)
    if (!o || o.trilho !== 'A') continue
    const chegou = textoEm.get(id)?.m
    if (!chegou || Date.parse(chegou.replace(' ', 'T') + 'Z') <= e.mudouEm) continue
    avisar(banco, leitorId, { chave: `pronto:${id}`, tipo: 'pronto', titulo: `${o.titulo} já dá para ler`,
      corpo: 'Estava na sua lista, e a tradução chegou.', link: `/#/ler/${id}` })
  }

  // "continue": leitura de verdade, parada entre 5 e 60 dias
  for (const [id, p] of sinais.progresso) {
    const o = indice.obras.get(id)
    if (!o || (p.segundos ?? 0) < 600) continue
    if (sinais.estante.get(id)?.estado === 'concluido') continue
    const parado = (agora - p.mudouEm) / DIA
    if (parado < 5 || parado > 60) continue
    const mes = new Date(agora).toISOString().slice(0, 7)
    avisar(banco, leitorId, { chave: `continuar:${id}:${mes}`, tipo: 'continuar', titulo: `Continue ${o.titulo}`,
      corpo: `Você parou no capítulo ${p.capitulo ?? 1}, há ${Math.round(parado)} dias.`, link: `/#/ler/${id}` })
  }

  // "da semana": uma vez por semana, se há o que recomendar
  const recs = recomendar(indice, sinais, { agora, quantos: 3 })
  if (recs.obras.length >= 3) {
    const nomes = recs.obras.map((x) => indice.obras.get(x.id)?.titulo).filter(Boolean)
    avisar(banco, leitorId, { chave: `semana:${semanaIso(new Date(agora))}`, tipo: 'semana',
      titulo: 'Suas recomendações da semana', corpo: `${nomes.join(', ')} — e mais na central.`, link: '/central.html' })
  }
}
