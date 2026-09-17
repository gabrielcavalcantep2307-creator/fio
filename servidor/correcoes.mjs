// Revisão comunitária das traduções da esteira.
//
// Quem lê um livro traduzido por nós seleciona um trecho estranho e sugere a
// forma certa. A administração aceita ou recusa, em lote, no painel. A
// correção aceita entra no texto na hora, e quem sugeriu passa a constar como
// revisor do livro. Quando o dono julga que o livro foi revisado de ponta a
// ponta, marca-o como revisado: o rótulo "tradução automática" sai.
//
// **Como o trecho é achado.** O capítulo é HTML simples (<p>, <em>). O que o
// leitor seleciona na tela é texto puro. A busca monta uma expressão com as
// palavras do trecho que aceita, entre elas, espaço e marcação — e só aplica
// se o trecho aparecer UMA vez no capítulo. Duas ocorrências é ambiguidade, e
// ambiguidade num texto que todo mundo lê se decide olhando, não chutando.
//
// **O índice de busca** não é refeito aqui: refazer um capítulo no FTS custa
// uma varredura do índice inteiro. Ele se atualiza na próxima reindexação
// (toda subida da esteira faz uma).

import { Recusa } from './contas.mjs'
import { avisar } from './gosto.mjs'

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS correcao (
      id             INTEGER PRIMARY KEY,
      obra_id        INTEGER NOT NULL,
      texto_id       INTEGER NOT NULL,
      capitulo_ordem INTEGER NOT NULL,
      leitor_id      INTEGER REFERENCES leitor(id) ON DELETE SET NULL,
      trecho         TEXT NOT NULL,
      proposta       TEXT NOT NULL,
      comentario     TEXT,
      estado         TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','aceita','recusada')),
      motivo         TEXT,
      criada_em      TEXT NOT NULL DEFAULT (datetime('now')),
      decidida_em    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_correcao_estado ON correcao(estado, criada_em);
    CREATE INDEX IF NOT EXISTS idx_correcao_texto ON correcao(texto_id, estado);
    CREATE TABLE IF NOT EXISTS revisao_comunitaria (
      texto_id    INTEGER PRIMARY KEY,
      marcada_em  TEXT NOT NULL DEFAULT (datetime('now')),
      marcada_por INTEGER
    );`)
}

const limpar = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const escaparHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const semTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/** A expressão que acha o trecho no HTML, tolerando marcação entre palavras. */
function expressao(trecho) {
  const palavras = trecho.split(/\s+/).filter(Boolean).map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '(?:&|&amp;)').replace(/</g, '(?:<|&lt;)').replace(/>/g, '(?:>|&gt;)'))
  return new RegExp(palavras.join('(?:\\s|&nbsp;|<[^>]{0,40}>)+'), 'g')
}

export function ocorrencias(corpo, trecho) {
  return [...String(corpo).matchAll(expressao(trecho))]
}

// O texto que vale para correção: a NOSSA tradução (fonte fio_traducao).
const nossoTexto = (banco, obraId) => banco.prepare(`
  SELECT t.id, t.revisao, o.titulo_pt, o.titulo FROM texto t JOIN obra o ON o.id = t.obra_id
   WHERE t.obra_id = ? AND t.fonte = 'fio_traducao' AND t.dono_id IS NULL AND t.normalizado = 1
   ORDER BY t.id DESC LIMIT 1`).get(obraId)

export function sugerir(banco, pessoa, { obra, capitulo, trecho, proposta, comentario }) {
  const t = nossoTexto(banco, Number(obra))
  if (!t) throw new Recusa('Só dá para sugerir correção nos livros traduzidos pelo Fio.', 404)
  const tr = limpar(trecho, 600), pr = limpar(proposta, 900)
  if (tr.length < 3) throw new Recusa('Selecione o trecho que quer corrigir.')
  if (!pr) throw new Recusa('Escreva como o trecho deveria ficar.')
  if (pr === tr) throw new Recusa('A correção está igual ao trecho.')
  // O capítulo que a tela diz; se o trecho não estiver nele (a tela nem sempre
  // sabe em que capítulo a pessoa está), procura no livro e aceita se aparecer
  // em um capítulo só.
  let ordem = Number(capitulo), n = 0
  const cap = Number.isInteger(ordem) ? banco.prepare('SELECT corpo FROM capitulo WHERE texto_id = ? AND ordem = ?').get(t.id, ordem) : null
  if (cap) n = ocorrencias(cap.corpo, tr).length
  if (!n) {
    const onde = banco.prepare('SELECT ordem, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem').all(t.id)
      .map((c) => ({ ordem: c.ordem, n: ocorrencias(c.corpo, tr).length })).filter((c) => c.n)
    if (!onde.length) throw new Recusa('Não achei esse trecho no livro. Selecione um pedaço menor, dentro de um parágrafo.')
    if (onde.length > 1) throw new Recusa('Esse trecho aparece em mais de um capítulo. Selecione um pedaço maior, para ficar único.')
    ordem = onde[0].ordem; n = onde[0].n
  }
  if (banco.prepare("SELECT 1 FROM correcao WHERE texto_id = ? AND capitulo_ordem = ? AND trecho = ? AND estado = 'pendente'").get(t.id, ordem, tr)) {
    throw new Recusa('Alguém já sugeriu uma correção para este trecho; ela está esperando revisão.')
  }
  banco.prepare(`INSERT INTO correcao (obra_id, texto_id, capitulo_ordem, leitor_id, trecho, proposta, comentario)
      VALUES (?,?,?,?,?,?,?)`).run(Number(obra), t.id, ordem, pessoa.id, tr, pr, limpar(comentario, 400) || null)
  return { ok: true, ambiguo: n > 1 }
}

/** O que o leitor vê no rodapé do livro: estado da revisão e quem revisou. */
export function resumo(banco, obraId) {
  const t = nossoTexto(banco, Number(obraId))
  if (!t) return null
  const r = banco.prepare(`SELECT COUNT(*) aceitas, COUNT(DISTINCT c.leitor_id) pessoas FROM correcao c
      WHERE c.texto_id = ? AND c.estado = 'aceita'`).get(t.id)
  const revisores = banco.prepare(`SELECT l.usuario, COUNT(*) n FROM correcao c JOIN leitor l ON l.id = c.leitor_id
      WHERE c.texto_id = ? AND c.estado = 'aceita' GROUP BY l.id ORDER BY n DESC LIMIT 12`).all(t.id)
  const pendentes = banco.prepare("SELECT COUNT(*) n FROM correcao WHERE texto_id = ? AND estado = 'pendente'").get(t.id).n
  const revisada = !!banco.prepare('SELECT 1 FROM revisao_comunitaria WHERE texto_id = ?').get(t.id)
  return { revisao: revisada ? 'comunitaria' : t.revisao, aceitas: r.aceitas, pessoas: r.pessoas, pendentes, revisores }
}

// ── a administração ──

export function fila(banco) {
  const pendentes = banco.prepare(`
    SELECT c.id, c.obra_id, c.capitulo_ordem, c.trecho, c.proposta, c.comentario, c.criada_em, l.usuario,
           COALESCE(o.titulo_pt, o.titulo) obra, cap.corpo
      FROM correcao c JOIN obra o ON o.id = c.obra_id
      LEFT JOIN leitor l ON l.id = c.leitor_id
      LEFT JOIN capitulo cap ON cap.texto_id = c.texto_id AND cap.ordem = c.capitulo_ordem
     WHERE c.estado = 'pendente' ORDER BY c.criada_em LIMIT 200`).all()
  const livros = banco.prepare(`
    SELECT c.obra_id, COALESCE(o.titulo_pt, o.titulo) titulo,
           SUM(c.estado = 'aceita') aceitas, SUM(c.estado = 'pendente') pendentes, COUNT(DISTINCT c.leitor_id) pessoas,
           EXISTS (SELECT 1 FROM revisao_comunitaria r WHERE r.texto_id = c.texto_id) revisada
      FROM correcao c JOIN obra o ON o.id = c.obra_id GROUP BY c.texto_id ORDER BY aceitas DESC LIMIT 100`).all()
  return {
    pendentes: pendentes.map(({ corpo, ...c }) => {
      const achados = corpo ? ocorrencias(corpo, c.trecho) : []
      let contexto = null
      if (achados.length) {
        const a = achados[0]
        contexto = {
          antes: semTags(corpo.slice(Math.max(0, a.index - 220), a.index)).replace(/\s+/g, ' ').slice(-120),
          depois: semTags(corpo.slice(a.index + a[0].length, a.index + a[0].length + 220)).replace(/\s+/g, ' ').slice(0, 120),
        }
      }
      return { ...c, achados: achados.length, contexto }
    }),
    livros,
  }
}

export function decidir(banco, admin, { id, acao, proposta, motivo }) {
  const c = banco.prepare("SELECT * FROM correcao WHERE id = ? AND estado = 'pendente'").get(Number(id))
  if (!c) throw new Recusa('Correção não encontrada (ou já decidida).', 404)
  if (acao === 'recusar') {
    banco.prepare("UPDATE correcao SET estado = 'recusada', motivo = ?, decidida_em = datetime('now') WHERE id = ?")
      .run(limpar(motivo, 300) || null, c.id)
    return { ok: true }
  }
  if (acao !== 'aceitar') throw new Recusa('Ação desconhecida.')
  const texto = limpar(proposta ?? c.proposta, 900)
  if (!texto) throw new Recusa('A correção ficou vazia.')
  const cap = banco.prepare('SELECT id, corpo FROM capitulo WHERE texto_id = ? AND ordem = ?').get(c.texto_id, c.capitulo_ordem)
  if (!cap) throw new Recusa('O capítulo não existe mais.', 404)
  const achados = ocorrencias(cap.corpo, c.trecho)
  if (achados.length !== 1) {
    throw new Recusa(achados.length ? `O trecho aparece ${achados.length} vezes no capítulo; corrija à mão ou recuse.` : 'O trecho não está mais no capítulo (talvez já corrigido).', 409)
  }
  const a = achados[0]
  const novo = cap.corpo.slice(0, a.index) + escaparHtml(texto) + cap.corpo.slice(a.index + a[0].length)
  banco.exec('BEGIN')
  try {
    banco.prepare('UPDATE capitulo SET corpo = ?, palavras = ? WHERE id = ?')
      .run(novo, (semTags(novo).match(/\S+/g) ?? []).length, cap.id)
    banco.prepare("UPDATE correcao SET estado = 'aceita', proposta = ?, decidida_em = datetime('now') WHERE id = ?").run(texto, c.id)
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
  if (c.leitor_id) {
    const o = banco.prepare('SELECT COALESCE(titulo_pt, titulo) t FROM obra WHERE id = ?').get(c.obra_id)
    avisar(banco, c.leitor_id, { chave: `correcao-${c.id}`, tipo: 'correcao', titulo: `Sua correção entrou em ${o?.t ?? 'um livro'}`,
      corpo: 'Obrigado! Você agora aparece como revisor deste livro.', link: `/#/obra/${c.obra_id}` })
  }
  void admin
  return { ok: true }
}

/** O dono marca o livro como revisado: o rótulo de tradução automática sai. */
export function marcarRevisado(banco, admin, { obra, desfazer }) {
  const t = nossoTexto(banco, Number(obra))
  if (!t) throw new Recusa('Livro não encontrado.', 404)
  if (desfazer) {
    banco.prepare('DELETE FROM revisao_comunitaria WHERE texto_id = ?').run(t.id)
    banco.prepare("UPDATE texto SET revisao = 'automatica' WHERE id = ?").run(t.id)
  } else {
    banco.prepare('INSERT OR IGNORE INTO revisao_comunitaria (texto_id, marcada_por) VALUES (?, ?)').run(t.id, admin.id)
    // 'humana' é o valor que a coluna aceita para "alguém conferiu"; quem
    // conferiu, aqui, foi a comunidade — e `revisao_comunitaria` diz isso.
    banco.prepare("UPDATE texto SET revisao = 'humana' WHERE id = ?").run(t.id)
  }
  return { ok: true }
}
