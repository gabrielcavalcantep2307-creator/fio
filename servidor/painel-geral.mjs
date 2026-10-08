// A visão geral do painel e o controle da tradução (05/10/2026).
//
// O dono: "esse painel tá muito ruim, não é tipo um dashboard". A primeira
// tela passa a responder, de relance: quanta gente está usando, o que está
// sendo lido, como está o acervo e como anda a tradução. Só CONTAGEM
// agregada — nenhum dado de pessoa sai daqui.

import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, statSync } from 'node:fs'

const dias = (banco, sql, n = 30) => {
  // série diária completa (dia sem nada aparece como zero, não some do gráfico)
  const linhas = new Map(banco.prepare(sql).all(`-${n - 1} days`).map((r) => [r.dia, r.n]))
  const serie = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    serie.push({ dia: d, n: linhas.get(d) ?? 0 })
  }
  return serie
}

export function visaoGeral(banco) {
  const um = (sql, ...a) => banco.prepare(sql).get(...a)?.n ?? 0
  const legiveis = banco.prepare(`SELECT DISTINCT t.obra_id id, t.fonte FROM texto t JOIN obra o ON o.id = t.obra_id
    WHERE o.publicada = 1 AND t.idioma = 'pt' AND t.dono_id IS NULL
      AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id)`).all()
  const ids = new Set(legiveis.map((r) => r.id))
  const fila = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM fila_traducao GROUP BY estado').all().map((l) => [l.estado, l.n]))
  let propostas = 0
  try { propostas = um("SELECT COUNT(*) n FROM revisao_troca WHERE estado = 'proposta'") } catch {}
  let palavrasSuspeitas = null
  try {
    if (existsSync('/dados/achados.db')) {
      const a = new DatabaseSync('/dados/achados.db', { readOnly: true })
      palavrasSuspeitas = a.prepare("SELECT COUNT(*) n, COALESCE(SUM(ocorrencias),0) oc FROM palavra WHERE decisao IS NULL").get()
      a.close()
    }
  } catch {}
  const titulo = banco.prepare('SELECT COALESCE(titulo_pt, titulo) t FROM obra WHERE id = ?')
  return {
    leitores: {
      contas: um('SELECT COUNT(*) n FROM leitor WHERE desativado = 0'),
      hoje: um("SELECT COUNT(*) n FROM leitor WHERE visto_em >= date('now')"),
      semana: um("SELECT COUNT(*) n FROM leitor WHERE visto_em >= datetime('now','-7 days')"),
      mes: um("SELECT COUNT(*) n FROM leitor WHERE visto_em >= datetime('now','-30 days')"),
      novos7: um("SELECT COUNT(*) n FROM leitor WHERE criado_em >= datetime('now','-7 days')"),
    },
    leituras: {
      hoje: um("SELECT COUNT(*) n FROM abertura WHERE quando >= date('now')"),
      semana: um("SELECT COUNT(*) n FROM abertura WHERE quando >= datetime('now','-7 days')"),
      porDia: dias(banco, "SELECT date(quando) dia, COUNT(*) n FROM abertura WHERE quando >= date('now', ?) GROUP BY 1"),
      cadastrosPorDia: dias(banco, "SELECT date(criado_em) dia, COUNT(*) n FROM leitor WHERE criado_em >= date('now', ?) GROUP BY 1"),
      maisLidos: banco.prepare(`SELECT obra_id, COUNT(*) vezes FROM abertura WHERE quando >= datetime('now','-7 days')
        GROUP BY obra_id ORDER BY vezes DESC LIMIT 10`).all()
        .map((r) => ({ ...r, titulo: titulo.get(r.obra_id)?.t ?? `obra ${r.obra_id}` })),
    },
    acervo: {
      legiveis: ids.size,
    },
    traducao: {
      fila: { espera: fila.espera ?? 0, traduzindo: fila.na_esteira ?? 0, prontos: fila.pronto ?? 0, erro: fila.erro ?? 0 },
      prontos7: um("SELECT COUNT(*) n FROM texto WHERE fonte = 'fio_traducao' AND criado_em >= datetime('now','-7 days')"),
      propostas,
      palavrasSuspeitas,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// O ESTADO DO ACERVO E A LISTA DE REVISÃO (05/10/2026, segunda leva).
//
// O dono: "não entendi nada… não sei cadê a lista de tradução e a de
// revisão". Cada livro tem UM problema dito em palavra simples (calculado por
// ingestao/qualidade-acervo.mjs em /dados/qualidade.json), e a lista de
// revisão é a dos livros que as pessoas abrem, do mais lido para baixo.
// ─────────────────────────────────────────────────────────────
const QUALIDADE = process.env.FIO_QUALIDADE || '/dados/qualidade.json'
let qualidadeGuardada = null
function qualidade() {
  try {
    const s = statSync(QUALIDADE)
    if (!qualidadeGuardada || qualidadeGuardada.em !== s.mtimeMs) qualidadeGuardada = { em: s.mtimeMs, ...JSON.parse(readFileSync(QUALIDADE, 'utf8')) }
    return qualidadeGuardada
  } catch { return { obras: {}, feito: null } }
}

export function garantirRevisao(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS revisao_obra (
    obra_id INTEGER PRIMARY KEY REFERENCES obra(id),
    estado  TEXT NOT NULL CHECK (estado IN ('grafia_lida', 'revisado')),
    nota    TEXT,
    em      TEXT NOT NULL DEFAULT (datetime('now')))`)
}

/** Quantos livros em cada estado, e a lista de revisão pelos mais lidos. */
export function estadoDoAcervo(banco) {
  garantirRevisao(banco)
  const q = qualidade()
  const conta = { limpo: 0, grafia: 0, escaneado: 0, traducao: 0 }
  for (const [tipo] of Object.values(q.obras)) conta[tipo] = (conta[tipo] ?? 0) + 1
  const marca = new Map(banco.prepare('SELECT obra_id, estado, nota, em FROM revisao_obra').all().map((r) => [r.obra_id, r]))
  const titulo = banco.prepare('SELECT COALESCE(titulo_pt, titulo) t FROM obra WHERE id = ?')
  const lidos = banco.prepare(`SELECT obra_id, COUNT(*) vezes FROM abertura WHERE quando >= datetime('now','-60 days')
    GROUP BY obra_id ORDER BY vezes DESC LIMIT 80`).all()
  const lista = lidos.map((r) => {
    const [tipo = 'sem texto', antigas = 0, resto = 0] = q.obras[r.obra_id] ?? []
    return { obra: r.obra_id, titulo: titulo.get(r.obra_id)?.t ?? `obra ${r.obra_id}`, vezes: r.vezes, tipo, antigas, resto,
      revisao: marca.get(r.obra_id) ?? null }
  })
  return { feito: q.feito, conta, total: Object.keys(q.obras).length, lista }
}

export function marcarRevisao(banco, obra, estado, nota = null) {
  garantirRevisao(banco)
  const id = Number(obra)
  if (!Number.isInteger(id) || id <= 0) throw new Error('obra inválida')
  if (estado === null || estado === 'nenhum') banco.prepare('DELETE FROM revisao_obra WHERE obra_id = ?').run(id)
  else banco.prepare(`INSERT INTO revisao_obra (obra_id, estado, nota) VALUES (?,?,?)
    ON CONFLICT(obra_id) DO UPDATE SET estado = excluded.estado, nota = excluded.nota, em = datetime('now')`).run(id, estado, nota)
}

// ─────────────────────────────────────────────────────────────
// OS USUÁRIOS, DE RELANCE. "A parte de usuários no painel não mudou nada."
// guardado.mudou_em é MILISSEGUNDO (Date.now() de quem escreveu).
// ─────────────────────────────────────────────────────────────
const MS = (dias) => `(strftime('%s', 'now', '-${dias} days') * 1000)`
export function visaoUsuarios(banco) {
  const um = (sql) => banco.prepare(sql).get()?.n ?? 0
  const leram = (dias) => um(`SELECT COUNT(DISTINCT leitor_id) n FROM guardado WHERE tipo = 'progresso' AND valor IS NOT NULL AND mudou_em > ${MS(dias)}`)
  const porDia = new Map(banco.prepare(`SELECT date(mudou_em / 1000, 'unixepoch') dia, COUNT(DISTINCT leitor_id) n FROM guardado
    WHERE tipo = 'progresso' AND mudou_em > ${MS(29)} GROUP BY 1`).all().map((r) => [r.dia, r.n]))
  const leitoresPorDia = []
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10); leitoresPorDia.push({ dia: d, n: porDia.get(d) ?? 0 }) }
  const titulo = banco.prepare('SELECT COALESCE(titulo_pt, titulo) t FROM obra WHERE id = ?')
  return {
    contas: um('SELECT COUNT(*) n FROM leitor WHERE desativado = 0'),
    google: um('SELECT COUNT(DISTINCT leitor_id) n FROM leitor_google'),
    ativos: { hoje: um("SELECT COUNT(*) n FROM leitor WHERE visto_em >= date('now')"), semana: um("SELECT COUNT(*) n FROM leitor WHERE visto_em >= datetime('now','-7 days')"),
      mes: um("SELECT COUNT(*) n FROM leitor WHERE visto_em >= datetime('now','-30 days')") },
    novos: { semana: um("SELECT COUNT(*) n FROM leitor WHERE criado_em >= datetime('now','-7 days')"), mes: um("SELECT COUNT(*) n FROM leitor WHERE criado_em >= datetime('now','-30 days')") },
    // do cadastro à leitura: quem abriu algum livro, quem voltou para um segundo
    funil: {
      contas: um('SELECT COUNT(*) n FROM leitor WHERE desativado = 0'),
      abriram: um("SELECT COUNT(DISTINCT leitor_id) n FROM guardado WHERE tipo = 'progresso' AND valor IS NOT NULL"),
      doisOuMais: um("SELECT COUNT(*) n FROM (SELECT leitor_id FROM guardado WHERE tipo = 'progresso' AND valor IS NOT NULL GROUP BY leitor_id HAVING COUNT(*) >= 2)"),
      leram30: leram(30),
      comPlano: um("SELECT COUNT(*) n FROM assinatura a JOIN leitor l ON l.id = a.leitor_id WHERE l.papel <> 'admin' AND (a.ate IS NULL OR a.ate > datetime('now'))"),
    },
    leram: { hoje: leram(1), semana: leram(7), mes: leram(30) },
    leitoresPorDia,
    cadastrosPorDia: dias(banco, "SELECT date(criado_em) dia, COUNT(*) n FROM leitor WHERE criado_em >= date('now', ?) GROUP BY 1"),
    // o que as contas estão lendo (pelo progresso guardado), sem dizer quem
    acompanhados: banco.prepare(`SELECT chave obra, COUNT(DISTINCT leitor_id) leitores FROM guardado
      WHERE tipo = 'progresso' AND valor IS NOT NULL AND mudou_em > ${MS(30)} GROUP BY chave ORDER BY leitores DESC LIMIT 10`).all()
      .map((r) => ({ ...r, titulo: titulo.get(Number(r.obra))?.t ?? `obra ${r.obra}` })),
  }
}

