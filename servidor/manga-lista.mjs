// "Minha lista" de mangás, manhwas e manhuas (19/09/2026).
//
// O Fio não hospeda os mangás modernos — eles têm dono — e a aba Descobrir
// aponta onde ler oficialmente. Faltava guardar: quem acha dez séries boas
// numa noite não tinha onde anotá-las. A lista é da conta (vale em todo
// aparelho) e guarda só o que o AniList já mostra: número, título, capa, tipo.
// A ficha, com os links oficiais, continua vindo na hora.

import { Recusa, limparNomeDeTela } from './contas.mjs'

const TETO = 500
const CAPA = /^\/api\/capa-manga\/(medium|large)\/[\w.-]+\.(jpe?g|png|webp)$/i

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS manga_lista (
    leitor_id  INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
    anilist_id INTEGER NOT NULL,
    titulo     TEXT NOT NULL,
    capa       TEXT,
    tipo       TEXT,
    em         TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (leitor_id, anilist_id))`)
}

export function listar(banco, leitorId) {
  garantirTabelas(banco)
  return {
    itens: banco.prepare('SELECT anilist_id id, titulo, capa, tipo, em FROM manga_lista WHERE leitor_id = ? ORDER BY em DESC, rowid DESC')
      .all(leitorId),
  }
}

export function por(banco, leitorId, { id, titulo, capa, tipo }) {
  garantirTabelas(banco)
  const n = Number(id)
  if (!Number.isInteger(n) || n < 1 || n > 1e9) throw new Recusa('Mangá inválido.')
  const t = limparNomeDeTela(titulo)
  if (!t) throw new Recusa('Mangá sem título.')
  const c = typeof capa === 'string' && CAPA.test(capa) ? capa : null
  const tp = ['mangá', 'manhwa', 'manhua', 'one-shot', 'quadrinho'].includes(tipo) ? tipo : null
  if (banco.prepare('SELECT COUNT(*) n FROM manga_lista WHERE leitor_id = ?').get(leitorId).n >= TETO
    && !banco.prepare('SELECT 1 FROM manga_lista WHERE leitor_id = ? AND anilist_id = ?').get(leitorId, n)) {
    throw new Recusa(`A lista chegou a ${TETO}. Tire alguns antes de pôr outro.`)
  }
  banco.prepare(`INSERT INTO manga_lista (leitor_id, anilist_id, titulo, capa, tipo) VALUES (?,?,?,?,?)
    ON CONFLICT(leitor_id, anilist_id) DO UPDATE SET titulo = excluded.titulo, capa = excluded.capa, tipo = excluded.tipo`)
    .run(leitorId, n, t, c, tp)
  return listar(banco, leitorId)
}

export function tirar(banco, leitorId, { id }) {
  garantirTabelas(banco)
  banco.prepare('DELETE FROM manga_lista WHERE leitor_id = ? AND anilist_id = ?').run(leitorId, Number(id))
  return listar(banco, leitorId)
}
