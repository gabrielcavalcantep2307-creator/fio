// O que as cinco ideias de 17/09 (tarde) e a página de conta precisam guardar.
//
//   ESTANTE     meta de leitura do ano (como o desafio anual do Goodreads):
//               a pessoa escolhe quantos livros quer ler; o progresso vem dos
//               livros marcados como lidos na estante sincronizada.
//   QUADRINHOS  progresso na CONTA, e não só no navegador (Webtoon, Tapas):
//               volume e página por série, o mais recente vence.
//   COMUNIDADE  seguir uma obra (o "inscrever-se" do Webtoon): aviso quando
//               sai capítulo novo.
//   CONTA       o resumo da página de conta (plano, uso, contagens), sair de
//               um aparelho específico e o e-mail opcional.
//
// O caderno (revisão do dia) e o "para você" (encontro às cegas com um livro)
// não guardam nada no servidor: vivem no navegador, com o que já existe.

import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { Recusa } from './contas.mjs'
import { conferirEmail, conferirSenha } from './seguranca.mjs'

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS meta_leitura (
      leitor_id INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      ano       INTEGER NOT NULL,
      livros    INTEGER NOT NULL,
      mudou_em  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (leitor_id, ano)
    );
    CREATE TABLE IF NOT EXISTS quadrinho_progresso (
      leitor_id INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      serie     TEXT NOT NULL,
      cap       INTEGER NOT NULL,
      pag       INTEGER NOT NULL,
      lidos     TEXT NOT NULL DEFAULT '[]',
      em        INTEGER NOT NULL,
      PRIMARY KEY (leitor_id, serie)
    );
    CREATE TABLE IF NOT EXISTS publicacao_seguidor (
      leitor_id     INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      publicacao_id INTEGER NOT NULL REFERENCES publicacao(id) ON DELETE CASCADE,
      desde         TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (leitor_id, publicacao_id)
    );`)
}

// ── meta de leitura ──

export function meta(banco, pessoa, anoPedido) {
  const ano = Number.isInteger(Number(anoPedido)) && Number(anoPedido) > 2000 ? Number(anoPedido) : new Date().getUTCFullYear()
  const m = banco.prepare('SELECT livros FROM meta_leitura WHERE leitor_id = ? AND ano = ?').get(pessoa.id, ano)
  const inicio = Date.UTC(ano, 0, 1), fim = Date.UTC(ano + 1, 0, 1)
  const lidos = banco.prepare(`SELECT chave obra, mudou_em em FROM guardado
      WHERE leitor_id = ? AND tipo = 'estante' AND valor = '"lido"' AND mudou_em >= ? AND mudou_em < ? ORDER BY mudou_em`)
    .all(pessoa.id, inicio, fim)
  const porMes = Array(12).fill(0)
  for (const l of lidos) porMes[new Date(l.em).getUTCMonth()]++
  const lendo = banco.prepare(`SELECT COUNT(*) n FROM guardado WHERE leitor_id = ? AND tipo = 'estante' AND valor = '"lendo"'`).get(pessoa.id).n
  return { ano, meta: m?.livros ?? null, lidos: lidos.map((l) => ({ obra: Number(l.obra), em: l.em })), porMes, lendo }
}

export function definirMeta(banco, pessoa, { livros, ano }) {
  const n = Math.round(Number(livros))
  if (!Number.isInteger(n) || n < 1 || n > 500) throw new Recusa('Escolha uma meta entre 1 e 500 livros.')
  const a = Number.isInteger(Number(ano)) ? Number(ano) : new Date().getUTCFullYear()
  if (a < 2020 || a > 2100) throw new Recusa('Ano inválido.')
  banco.prepare(`INSERT INTO meta_leitura (leitor_id, ano, livros) VALUES (?,?,?)
    ON CONFLICT(leitor_id, ano) DO UPDATE SET livros = excluded.livros, mudou_em = datetime('now')`).run(pessoa.id, a, n)
  return meta(banco, pessoa, a)
}

// ── progresso de quadrinhos ──

export function progressoQuadrinhos(banco, pessoa) {
  return {
    // o navegador confere de quem são os dados dele antes de misturar (fio-dono.js)
    dono: pessoa.id,
    series: banco.prepare('SELECT serie, cap, pag, lidos, em FROM quadrinho_progresso WHERE leitor_id = ? ORDER BY em DESC LIMIT 500')
      .all(pessoa.id).map((l) => ({ ...l, lidos: JSON.parse(l.lidos) })),
  }
}

export function guardarProgressoQuadrinho(banco, pessoa, { itens }) {
  if (!Array.isArray(itens) || itens.length > 100) throw new Recusa('Formato inesperado.')
  const total = banco.prepare('SELECT COUNT(*) n FROM quadrinho_progresso WHERE leitor_id = ?').get(pessoa.id).n
  const grava = banco.prepare(`INSERT INTO quadrinho_progresso (leitor_id, serie, cap, pag, lidos, em) VALUES (?,?,?,?,?,?)
    ON CONFLICT(leitor_id, serie) DO UPDATE SET cap = excluded.cap, pag = excluded.pag, lidos = excluded.lidos, em = excluded.em
    WHERE excluded.em > quadrinho_progresso.em`)
  let novos = total
  banco.exec('BEGIN')
  try {
    for (const it of itens) {
      const serie = String(it?.serie ?? '')
      if (!/^[a-z0-9-]{2,80}$/.test(serie)) continue
      const cap = Math.round(Number(it.cap)), pag = Math.round(Number(it.pag)), em = Math.round(Number(it.em))
      if (!Number.isInteger(cap) || cap < 1 || cap > 100000 || !Number.isInteger(pag) || pag < 0 || pag > 100000) continue
      if (!Number.isFinite(em) || em <= 0) continue
      const lidos = (Array.isArray(it.lidos) ? it.lidos : []).map(Number).filter((x) => Number.isInteger(x) && x > 0 && x <= 100000).slice(0, 2000)
      if (novos >= 500 && !banco.prepare('SELECT 1 FROM quadrinho_progresso WHERE leitor_id = ? AND serie = ?').get(pessoa.id, serie)) continue
      grava.run(pessoa.id, serie, cap, pag, JSON.stringify([...new Set(lidos)]), Math.min(em, Date.now() + 60000))
      novos++
    }
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
  return progressoQuadrinhos(banco, pessoa)
}

// ── seguir obra da comunidade ──

export function seguir(banco, pessoa, { id, seguir: quer }) {
  const obra = banco.prepare("SELECT id, autor_id FROM publicacao WHERE id = ? AND estado = 'publicada'").get(Number(id))
  if (!obra) throw new Recusa('Publicação não encontrada.', 404)
  if (quer) {
    const n = banco.prepare('SELECT COUNT(*) n FROM publicacao_seguidor WHERE leitor_id = ?').get(pessoa.id).n
    if (n >= 500) throw new Recusa('Você já segue 500 obras.')
    banco.prepare('INSERT OR IGNORE INTO publicacao_seguidor (leitor_id, publicacao_id) VALUES (?, ?)').run(pessoa.id, obra.id)
  } else {
    banco.prepare('DELETE FROM publicacao_seguidor WHERE leitor_id = ? AND publicacao_id = ?').run(pessoa.id, obra.id)
  }
  return { ok: true, seguindo: !!quer, seguidores: banco.prepare('SELECT COUNT(*) n FROM publicacao_seguidor WHERE publicacao_id = ?').get(obra.id).n }
}

// ── conta ──

export function resumoConta(banco, pessoa, { plano, uso }) {
  const um = (sql, ...a) => { try { return banco.prepare(sql).get(...a)?.n ?? 0 } catch { return 0 } }
  const estante = Object.fromEntries(banco.prepare(`SELECT valor, COUNT(*) n FROM guardado WHERE leitor_id = ? AND tipo = 'estante' AND valor IS NOT NULL GROUP BY valor`)
    .all(pessoa.id).map((l) => [JSON.parse(l.valor), l.n]))
  const l = banco.prepare('SELECT usuario, nome, email, papel, criado_em FROM leitor WHERE id = ?').get(pessoa.id)
  return {
    conta: { id: pessoa.id, usuario: l.usuario, nome: l.nome, email: l.email, papel: l.papel, desde: l.criado_em },
    plano: { chave: plano.chave, nome: plano.nome, uso },
    numeros: {
      lidos: estante.lido ?? 0,
      lendo: estante.lendo ?? 0,
      queroLer: estante.quero_ler ?? 0,
      marcacoes: um("SELECT COUNT(*) n FROM guardado WHERE leitor_id = ? AND tipo = 'marcacao' AND valor IS NOT NULL", pessoa.id),
      resenhas: um('SELECT COUNT(*) n FROM avaliacao WHERE leitor_id = ?', pessoa.id),
      publicacoes: um('SELECT COUNT(*) n FROM publicacao WHERE autor_id = ?', pessoa.id),
      correcoes: um("SELECT COUNT(*) n FROM correcao WHERE leitor_id = ? AND estado = 'aceita'", pessoa.id),
      seguindo: um('SELECT COUNT(*) n FROM publicacao_seguidor WHERE leitor_id = ?', pessoa.id),
    },
  }
}

export function sairDoAparelho(banco, pessoa, { id }) {
  const r = banco.prepare('DELETE FROM sessao WHERE id = ? AND leitor_id = ?').run(Number(id), pessoa.id)
  if (!r.changes) throw new Recusa('Aparelho não encontrado.', 404)
  return { ok: true }
}

export async function mudarEmail(banco, pessoa, { email, senha }) {
  const l = banco.prepare('SELECT senha_hash, senha_sal, senha_params FROM leitor WHERE id = ?').get(pessoa.id)
  if (!l || !(await conferirSenha(String(senha ?? ''), l.senha_hash, l.senha_sal, l.senha_params))) {
    throw new Recusa('A senha atual não confere.', 401)
  }
  const bruto = String(email ?? '').trim()
  if (!bruto) {
    banco.prepare('UPDATE leitor SET email = NULL WHERE id = ?').run(pessoa.id)
    return { ok: true, email: null }
  }
  const limpo = conferirEmail(bruto)
  if (!limpo) throw new Recusa('Esse e-mail não parece válido.')
  if (banco.prepare('SELECT 1 FROM leitor WHERE email = ? COLLATE NOCASE AND id <> ?').get(limpo, pessoa.id)) {
    // Não diz de quem é: só que não dá para usar.
    throw new Recusa('Não foi possível usar esse e-mail.')
  }
  banco.prepare('UPDATE leitor SET email = ? WHERE id = ?').run(limpo, pessoa.id)
  return { ok: true, email: limpo }
}

// ── vitrine dos quadrinhos (18/09): "novidades" e "mais lidos", como nos sites de leitura ──
//
// Novidade = a data em que a pasta do volume chegou ao site (é quando ele
// passou a existir aqui). Mais lidos = quantas CONTAS têm progresso na série —
// só a contagem sai daqui, nunca quem. Guardado 10 min: a vitrine é igual
// para todo mundo.
let vitrineGuardada = null
export function vitrineQuadrinhos(banco, estatico) {
  if (vitrineGuardada && Date.now() - vitrineGuardada.em < 600_000) return vitrineGuardada.dados
  let cat = { series: [] }
  try { cat = JSON.parse(readFileSync(join(estatico, 'dados', 'quadrinhos.json'), 'utf8')) } catch {}
  const novidades = []
  for (const s of cat.series ?? []) {
    for (const c of s.capitulos ?? []) {
      const primeira = c.paginas?.[0]
      if (typeof primeira !== 'string' || !primeira.startsWith('/quadrinhos/')) continue
      try {
        const pasta = join(estatico, dirname(primeira.slice(1)))
        novidades.push({ serie: s.id, cap: c.n, titulo: c.titulo, em: statSync(pasta).mtimeMs })
      } catch {}
    }
  }
  novidades.sort((a, b) => b.em - a.em)
  // no máximo dois volumes por série, para uma série grande não tomar a faixa
  const porSerie = new Map()
  const variadas = novidades.filter((n) => { const q = (porSerie.get(n.serie) ?? 0) + 1; porSerie.set(n.serie, q); return q <= 2 })
  let ranking = []
  try {
    ranking = banco.prepare('SELECT serie, COUNT(*) leitores FROM quadrinho_progresso GROUP BY serie ORDER BY leitores DESC, MAX(em) DESC LIMIT 10').all()
  } catch {}
  const dados = { novidades: variadas.slice(0, 18), ranking }
  vitrineGuardada = { em: Date.now(), dados }
  return dados
}
