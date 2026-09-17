// Quem lê o quê: o limite do plano grátis e a amostra de quem não tem conta.
//
//   sem conta   → o livro chega com os capítulos até o primeiro capítulo de
//                 verdade (pula a folha de rosto) e um último "capítulo" que
//                 convida a criar conta. Vale para todo livro, sempre.
//   Grátis      → 3 livros NOVOS a cada 30 dias. Livro já aberto continua
//                 aberto para sempre: o limite é para começar, nunca para
//                 terminar. Quem estoura recebe a amostra e o convite ao plano.
//   Novelo+     → sem limite.
//
// Não contam nunca: as leis (lei não tem dono, e é o que traz estudante), o
// livro que a pessoa mesma subiu (trilho C), quadrinhos e comunidade (servidos
// por outras rotas).
//
// A conferência acontece em `/api/livro/:id`, que é o único jeito de receber o
// texto. A ficha e o catálogo não passam por aqui, então olhar um livro não
// gasta nada — só abrir para ler.

import { planoDe, PLANOS } from './planos.mjs'
import * as ajustes from './ajustes.mjs'

const DIAS = 30

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS livro_liberado (
      leitor_id    INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      obra_id      INTEGER NOT NULL,
      liberado_em  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (leitor_id, obra_id)
    );
    CREATE TABLE IF NOT EXISTS pedido_traducao (
      id         INTEGER PRIMARY KEY,
      leitor_id  INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      fila_id    INTEGER,
      criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
    );`)
}

/** Quantos livros o plano grátis abre por mês (ajustável no painel). */
export function livrosGratis(banco) {
  const bruto = ajustes.ler(banco, 'gratis_livros_mes')
  // sem ajuste gravado vale o padrão — Number(null) seria 0 e trancaria tudo
  const v = bruto == null ? NaN : Number(bruto)
  return Number.isInteger(v) && v >= 0 ? v : PLANOS.leitor.livrosMes
}

/** A amostra para quem não tem conta está ligada? (padrão: sim) */
export const amostraLigada = (banco) => ajustes.ler(banco, 'portao_ativo') !== 'nao'

export function usoDoMes(banco, leitorId) {
  const r = banco.prepare(`SELECT COUNT(*) n, MIN(liberado_em) primeiro FROM livro_liberado
      WHERE leitor_id = ? AND liberado_em > datetime('now', ?)`).get(leitorId, `-${DIAS} days`)
  const renova = r.primeiro
    ? banco.prepare('SELECT datetime(?, ?) d').get(r.primeiro, `+${DIAS} days`).d
    : null
  return { usados: r.n, renovaEm: renova }
}

/**
 * Pode ler este livro inteiro?
 * Devolve `{ pode: true }` ou `{ pode: false, motivo: 'conta' | 'limite', ... }`.
 * Libera (e conta) quando é a primeira vez de um leitor grátis.
 */
export function decidir(banco, pessoa, obraId, { ehLei = false } = {}) {
  if (ehLei) return { pode: true }
  if (!pessoa) return amostraLigada(banco) ? { pode: false, motivo: 'conta' } : { pode: true }
  const plano = planoDe(banco, pessoa)
  if (plano.livrosMes === Infinity) return { pode: true }

  if (banco.prepare('SELECT 1 FROM livro_liberado WHERE leitor_id = ? AND obra_id = ?').get(pessoa.id, obraId)) {
    return { pode: true }
  }
  const limite = livrosGratis(banco)
  const uso = usoDoMes(banco, pessoa.id)
  if (uso.usados >= limite) return { pode: false, motivo: 'limite', limite, ...uso }
  banco.prepare('INSERT OR IGNORE INTO livro_liberado (leitor_id, obra_id) VALUES (?, ?)').run(pessoa.id, obraId)
  return { pode: true, liberou: true, restam: limite - uso.usados - 1 }
}

const dataBr = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '')

/** O "capítulo" que fecha a amostra. */
export function capituloDoMuro(decisao) {
  if (decisao.motivo === 'conta') {
    return {
      titulo: 'Continue lendo com uma conta grátis',
      corpo: [
        'Este foi o primeiro capítulo. Para ler o livro inteiro, crie uma conta — é de graça e leva um minuto.',
        'Com a conta grátis você abre 3 livros novos por mês, lê todas as leis e os quadrinhos livres, e o seu progresso fica guardado em todos os aparelhos.',
        'Toque em “entrar”, no alto da página, e depois em “criar conta”. Se já tem conta, é só entrar: o livro continua daqui.',
      ].join('\n\n'),
    }
  }
  return {
    titulo: 'Você já abriu os livros deste mês',
    corpo: [
      `No plano grátis dá para começar ${decisao.limite} livros novos a cada 30 dias, e você já começou os ${decisao.limite}. Os que já abriu continuam abertos: é só voltar a eles.`,
      decisao.renovaEm ? `Um novo livro libera em ${dataBr(decisao.renovaEm)}.` : '',
      'Para ler sem limite — e ouvir em voz alta e baixar em EPUB —, veja os planos em fiolib.duckdns.org/assinaturas.html.',
    ].filter(Boolean).join('\n\n'),
  }
}

// ── pedidos de tradução ──

export function pedidosDoMes(banco, leitorId) {
  return banco.prepare(`SELECT COUNT(*) n FROM pedido_traducao WHERE leitor_id = ? AND criado_em > datetime('now', '-30 days')`)
    .get(leitorId).n
}
