// O estudo de idiomas: sete línguas, exclusivo de quem tem o plano Tear.
//
// Diferente do acervo (livro é linha do banco, milhares deles), o curso de
// cada idioma é POUCA coisa — algumas dezenas de unidades, escritas por nós,
// nunca por quem lê. Por isso mora em `web/public/dados/idiomas/*.json`,
// igual à ficha de um livro (`dados/fichas/*.json`): estático, servido
// direto, sem tabela para cada palavra. O que MUDA por pessoa — unidade
// concluída, revisão espaçada — é pouco e cabe em duas tabelas.
//
// A REVISÃO ESPAÇADA usa o algoritmo SM-2 (SuperMemo, 1987, domínio de
// conhecimento aberto): cada item tem uma FACILIDADE (regula o quanto o
// intervalo cresce) e um INTERVALO (dias até a próxima vez). Acertar empurra
// os dois para cima; errar zera o intervalo e reduz a facilidade — o item
// volta amanhã. `imports SEM biblioteca de fora`, como o resto da casa.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Recusa } from './contas.mjs'

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS idioma_atividade (
      leitor_id INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      idioma TEXT NOT NULL,
      dia TEXT NOT NULL,
      PRIMARY KEY (leitor_id, idioma, dia)
    );
    CREATE TABLE IF NOT EXISTS idioma_progresso (
      id            INTEGER PRIMARY KEY,
      leitor_id     INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      idioma        TEXT NOT NULL,
      unidade       TEXT NOT NULL,
      acertos       INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      concluido_em  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leitor_id, idioma, unidade)
    );
    CREATE TABLE IF NOT EXISTS idioma_revisao (
      id                INTEGER PRIMARY KEY,
      leitor_id         INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      idioma            TEXT NOT NULL,
      item              TEXT NOT NULL,
      facilidade        REAL NOT NULL DEFAULT 2.5,
      intervalo         INTEGER NOT NULL DEFAULT 1,
      acertos_seguidos  INTEGER NOT NULL DEFAULT 0,
      proxima_em        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leitor_id, idioma, item)
    );
    CREATE INDEX IF NOT EXISTS idx_revisao_fila ON idioma_revisao (leitor_id, idioma, proxima_em);
    CREATE TABLE IF NOT EXISTS idioma_pedido_musica (
      id            INTEGER PRIMARY KEY,
      leitor_id     INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      idioma        TEXT NOT NULL,
      titulo        TEXT NOT NULL,
      artista       TEXT,
      nota          TEXT,
      criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS idioma_palavra_salva (
      id            INTEGER PRIMARY KEY,
      leitor_id     INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      idioma        TEXT NOT NULL,
      palavra       TEXT NOT NULL,
      traducao      TEXT NOT NULL,
      criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leitor_id, idioma, palavra)
    );
    CREATE TABLE IF NOT EXISTS idioma_nota (
      id            INTEGER PRIMARY KEY,
      leitor_id     INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      idioma        TEXT NOT NULL,
      item          TEXT NOT NULL,
      texto         TEXT NOT NULL,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leitor_id, idioma, item)
    );
  `)
  banco.exec(`INSERT OR IGNORE INTO idioma_atividade (leitor_id, idioma, dia)
    SELECT leitor_id, idioma, date(concluido_em) FROM idioma_progresso`)
}

const PASTA = process.env.FIO_ESTATICO
  ? join(process.env.FIO_ESTATICO, 'dados', 'idiomas')
  : join(process.cwd(), 'web', 'public', 'dados', 'idiomas')

const IDIOMAS = ['frances', 'espanhol', 'japones', 'alemao', 'russo', 'italiano', 'ingles']

/**
 * A lista dos sete, só com o que cabe num cartão — sem o curso inteiro.
 *
 * Com `leitorId`, cada item ganha `feitas` (unidades concluídas naquele
 * idioma) — é só LEITURA do que a pessoa já tem gravado, por isso não exige
 * Tear aqui: ver o próprio progresso no hub não é "usar" a área paga, é
 * lembrar que ela já foi usada antes.
 */
export function listaIdiomas(banco, leitorId) {
  const feitasPorIdioma = leitorId
    ? Object.fromEntries(banco.prepare(
        'SELECT idioma, COUNT(*) n FROM idioma_progresso WHERE leitor_id = ? GROUP BY idioma')
        .all(leitorId).map((l) => [l.idioma, l.n]))
    : {}
  return IDIOMAS.map((chave) => {
    const caminho = join(PASTA, `${chave}.json`)
    if (!existsSync(caminho)) return null
    try {
      const c = JSON.parse(readFileSync(caminho, 'utf8'))
      const item = { chave, nome: c.nome, bandeira: c.bandeira, profundidade: c.profundidade, unidades: c.unidades.length }
      if (leitorId) item.feitas = feitasPorIdioma[chave] ?? 0
      return item
    } catch { return null }
  }).filter(Boolean)
}

/** O curso inteiro de um idioma — só quem tem Tear chega até aqui (a rota confere antes). */
export function cursoDe(idioma) {
  const caminho = join(PASTA, `${idioma}.json`)
  if (!IDIOMAS.includes(idioma) || !existsSync(caminho)) return null
  try { return JSON.parse(readFileSync(caminho, 'utf8')) } catch { return null }
}

/** As unidades concluídas de um idioma, por quem lê. */
export function progressoDe(banco, leitorId, idioma) {
  const linhas = banco.prepare(
    'SELECT unidade, acertos, total, concluido_em FROM idioma_progresso WHERE leitor_id = ? AND idioma = ?')
    .all(leitorId, idioma)
  return Object.fromEntries(linhas.map((l) => [l.unidade, l]))
}

/** Marca uma unidade como concluída (ou atualiza o resultado, se refeita). */
export function concluirUnidade(banco, leitorId, idioma, unidade, { acertos, total }) {
  const u = cursoDe(idioma)?.unidades.find(u => u.chave === unidade)
  if (!u) throw new Recusa('Esta unidade não existe.', 404)
  if (!Number.isInteger(total) || total !== u.quiz.length || total < 1 || !Number.isInteger(acertos) || acertos < 0 || acertos > total) {
    throw new Recusa('O resultado não corresponde ao quiz desta unidade.')
  }
  banco.prepare(`
    INSERT INTO idioma_progresso (leitor_id, idioma, unidade, acertos, total, concluido_em)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (leitor_id, idioma, unidade) DO UPDATE SET
      acertos = excluded.acertos, total = excluded.total, concluido_em = excluded.concluido_em`)
    .run(leitorId, idioma, unidade, acertos, total)
  registrarAtividade(banco, leitorId, idioma)
}

function registrarAtividade(banco, leitorId, idioma) {
  banco.prepare("INSERT OR IGNORE INTO idioma_atividade (leitor_id, idioma, dia) VALUES (?, ?, date('now'))").run(leitorId, idioma)
}

// ── a revisão espaçada (SM-2) ──
//
// `qualidade`: 0 a 5, o quanto foi fácil lembrar (aqui só usamos 2 = errou,
// 4 = acertou — o quiz não pede para a pessoa se autoavaliar, isso cansa).
export function sm2(atual, qualidade) {
  let { facilidade, intervalo, acertos_seguidos: seguidos } = atual
  if (qualidade < 3) {
    seguidos = 0
    intervalo = 1
  } else {
    seguidos += 1
    intervalo = seguidos === 1 ? 1 : seguidos === 2 ? 6 : Math.round(intervalo * facilidade)
  }
  facilidade = Math.max(1.3, facilidade + (0.1 - (5 - qualidade) * (0.08 + (5 - qualidade) * 0.02)))
  return { facilidade, intervalo, acertos_seguidos: seguidos }
}

/** Registra o resultado de um item de revisão (certo ou errado) e recalcula a próxima data. */
export function revisarItem(banco, leitorId, idioma, item, acertou) {
  const m = String(item).match(/^(.+)::q(\d+)$/)
  const unidade = cursoDe(idioma)?.unidades.find(u => u.chave === m?.[1])
  if (!m || !unidade?.quiz?.[Number(m[2])]) throw new Recusa('Esta pergunta não existe.', 404)
  const atual = banco.prepare(
    'SELECT facilidade, intervalo, acertos_seguidos FROM idioma_revisao WHERE leitor_id = ? AND idioma = ? AND item = ?')
    .get(leitorId, idioma, item) ?? { facilidade: 2.5, intervalo: 1, acertos_seguidos: 0 }
  const novo = sm2(atual, acertou ? 4 : 2)
  banco.prepare(`
    INSERT INTO idioma_revisao (leitor_id, idioma, item, facilidade, intervalo, acertos_seguidos, proxima_em)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ? || ' days'))
    ON CONFLICT (leitor_id, idioma, item) DO UPDATE SET
      facilidade = excluded.facilidade, intervalo = excluded.intervalo,
      acertos_seguidos = excluded.acertos_seguidos, proxima_em = excluded.proxima_em`)
    .run(leitorId, idioma, item, novo.facilidade, novo.intervalo, novo.acertos_seguidos, novo.intervalo)
  registrarAtividade(banco, leitorId, idioma)
}

/** Os itens vencidos para revisar hoje, mais cedo primeiro. */
export function filaDeRevisao(banco, leitorId, idioma, limite = 20) {
  return banco.prepare(`
    SELECT item, facilidade, intervalo FROM idioma_revisao
     WHERE leitor_id = ? AND idioma = ? AND proxima_em <= datetime('now')
     ORDER BY proxima_em LIMIT ?`).all(leitorId, idioma, limite)
}

// ── pedir tradução de música ──

export function pedirMusica(banco, leitorId, idioma, { titulo, artista, nota }) {
  const t = String(titulo ?? '').trim().slice(0, 200)
  if (!t) throw new Error('Diga o título da música.')
  banco.prepare(`
    INSERT INTO idioma_pedido_musica (leitor_id, idioma, titulo, artista, nota)
    VALUES (?, ?, ?, ?, ?)`)
    .run(leitorId, idioma, t, String(artista ?? '').trim().slice(0, 120) || null, String(nota ?? '').trim().slice(0, 500) || null)
}

// ── palavras salvas (do Tradutor) ──

export function palavrasSalvas(banco, leitorId, idioma) {
  return banco.prepare(
    'SELECT palavra, traducao, criado_em FROM idioma_palavra_salva WHERE leitor_id = ? AND idioma = ? ORDER BY criado_em DESC')
    .all(leitorId, idioma)
}

export function salvarPalavra(banco, leitorId, idioma, { palavra, traducao }) {
  const p = String(palavra ?? '').trim().slice(0, 200)
  if (!p) throw new Error('Falta a palavra.')
  banco.prepare(`
    INSERT INTO idioma_palavra_salva (leitor_id, idioma, palavra, traducao)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (leitor_id, idioma, palavra) DO UPDATE SET traducao = excluded.traducao`)
    .run(leitorId, idioma, p, String(traducao ?? '').trim().slice(0, 500))
}

export function tirarPalavraSalva(banco, leitorId, idioma, palavra) {
  banco.prepare('DELETE FROM idioma_palavra_salva WHERE leitor_id = ? AND idioma = ? AND palavra = ?')
    .run(leitorId, idioma, String(palavra ?? '').trim().slice(0, 200))
}

// ── notas pessoais (unidade do curso ou estrofe de música) ──

export function notasDe(banco, leitorId, idioma) {
  const linhas = banco.prepare(
    'SELECT item, texto FROM idioma_nota WHERE leitor_id = ? AND idioma = ?')
    .all(leitorId, idioma)
  return Object.fromEntries(linhas.map((l) => [l.item, l.texto]))
}

export function salvarNota(banco, leitorId, idioma, item, texto) {
  const i = String(item ?? '').trim().slice(0, 120)
  if (!i) throw new Error('Falta dizer a que essa nota pertence.')
  const t = String(texto ?? '').trim().slice(0, 2000)
  if (!t) {
    banco.prepare('DELETE FROM idioma_nota WHERE leitor_id = ? AND idioma = ? AND item = ?').run(leitorId, idioma, i)
    return
  }
  banco.prepare(`
    INSERT INTO idioma_nota (leitor_id, idioma, item, texto, atualizado_em)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT (leitor_id, idioma, item) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em`)
    .run(leitorId, idioma, i, t)
}

// ── sequência de dias (streak) ──
//
// Não é tabela nova: conta dias distintos em que a pessoa deixou algum rastro
// nesse idioma (unidade concluída OU item revisado) — a mesma ideia de streak
// do Duolingo, mas sem inventar contador separado que pode dessincronizar do
// que a pessoa realmente fez.
export function sequenciaDias(banco, leitorId, idioma) {
  const dias = banco.prepare(`
    SELECT dia d FROM idioma_atividade WHERE leitor_id = ? AND idioma = ?
    ORDER BY dia DESC`).all(leitorId, idioma).map((l) => l.d)
  if (!dias.length) return 0
  const hoje = new Date().toISOString().slice(0, 10)
  const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (dias[0] !== hoje && dias[0] !== ontem) return 0 // sequência já quebrou
  let n = 0
  let cursor = new Date(dias[0] + 'T00:00:00Z')
  for (const d of dias) {
    if (d !== cursor.toISOString().slice(0, 10)) break
    n++
    cursor = new Date(cursor.getTime() - 86_400_000)
  }
  return n
}
