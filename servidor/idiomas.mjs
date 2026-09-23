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

export function garantirTabelas(banco) {
  banco.exec(`
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
  `)
}

const PASTA = process.env.FIO_ESTATICO
  ? join(process.env.FIO_ESTATICO, 'dados', 'idiomas')
  : join(process.cwd(), 'web', 'public', 'dados', 'idiomas')

const IDIOMAS = ['frances', 'espanhol', 'japones', 'alemao', 'russo', 'italiano', 'ingles']

/** A lista dos sete, só com o que cabe num cartão — sem o curso inteiro. */
export function listaIdiomas() {
  return IDIOMAS.map((chave) => {
    const caminho = join(PASTA, `${chave}.json`)
    if (!existsSync(caminho)) return null
    try {
      const c = JSON.parse(readFileSync(caminho, 'utf8'))
      return { chave, nome: c.nome, bandeira: c.bandeira, profundidade: c.profundidade, unidades: c.unidades.length }
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
  banco.prepare(`
    INSERT INTO idioma_progresso (leitor_id, idioma, unidade, acertos, total, concluido_em)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (leitor_id, idioma, unidade) DO UPDATE SET
      acertos = excluded.acertos, total = excluded.total, concluido_em = excluded.concluido_em`)
    .run(leitorId, idioma, unidade, acertos, total)
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
}

/** Os itens vencidos para revisar hoje, mais cedo primeiro. */
export function filaDeRevisao(banco, leitorId, idioma, limite = 20) {
  return banco.prepare(`
    SELECT item, facilidade, intervalo FROM idioma_revisao
     WHERE leitor_id = ? AND idioma = ? AND proxima_em <= datetime('now')
     ORDER BY proxima_em LIMIT ?`).all(leitorId, idioma, limite)
}
