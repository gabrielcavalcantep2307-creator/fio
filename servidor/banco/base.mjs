// A única porta de entrada do banco.
//
// Nada no projeto abre o SQLite direto. Se um dia isto virar Postgres, é este
// arquivo que muda — e só ele. Está escrito em ARQUITETURA.md, decisão 5.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const RAIZ = join(aqui, '..', '..')

let db = null

export function abrir(caminho = process.env.FIO_BANCO || join(RAIZ, 'dados', 'catalogo.db')) {
  if (db) return db
  mkdirSync(dirname(caminho), { recursive: true })
  const novo = !existsSync(caminho)
  db = new DatabaseSync(caminho)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  if (novo) {
    db.exec(readFileSync(join(RAIZ, 'servidor', 'esquema.sql'), 'utf8'))
  }
  return db
}

/**
 * Recria uma tabela a partir da definição que está em `esquema.sql`.
 *
 * O SQLite não muda um CHECK depois de criada a tabela. Para as tabelas que
 * guardam conteúdo DERIVADO — que um script refaz do zero — recriar é mais
 * honesto que carregar migração: a fonte da verdade continua sendo o
 * esquema.sql, e não uma pilha de ALTERs que ninguém lê.
 *
 * NÃO use isto em tabela com dado de gente. Aí é migração de verdade.
 */
export function recriarDerivada(banco, tabela) {
  const esquema = readFileSync(join(RAIZ, 'servidor', 'esquema.sql'), 'utf8')
  const alvo = new RegExp(String.raw`\b(TABLE|ON)\s+${tabela}\b`, 'i')
  const criacoes = [...esquema.matchAll(/CREATE (?:VIRTUAL )?TABLE[\s\S]*?;|CREATE INDEX[^;]*;/gi)]
    .map(m => m[0])
    .filter(sql => alvo.test(sql))
  if (!criacoes.length) throw new Error(`não achei ${tabela} no esquema.sql`)
  banco.exec(`DROP TABLE IF EXISTS ${tabela}`)
  for (const sql of criacoes) banco.exec(sql)
}

export function fechar() {
  if (db) { db.close(); db = null }
}

// ─────────────────────────────────────────────────────────────
// Direito autoral — o cálculo, num lugar só
//
// Não existe "é domínio público". Existe "é domínio público no Brasil".
// ─────────────────────────────────────────────────────────────

const ANO_ATUAL = new Date().getFullYear()

/**
 * Brasil — Lei 9.610/98, art. 41: 70 anos contados de 1º de janeiro do ano
 * seguinte ao da morte do autor. Logo, é livre a partir de morte + 71.
 */
/**
 * A tradução tem dono próprio: se ela ainda é protegida, o texto é protegido —
 * mesmo que o autor tenha morrido há 400 anos. Por isso o cálculo usa a morte
 * MAIS RECENTE entre todos os creditados, não a do autor.
 *
 * `creditados` é [{ nome, papel, morte }]. Basta um sem ano de morte para a
 * resposta virar 'desconhecido': meia informação aqui é pior que nenhuma.
 */
export function direitoBR({ creditados }) {
  if (!creditados?.length) {
    return { estado: 'desconhecido', motivo: 'Sem autoria identificada.', livre_em: null }
  }
  const semAno = creditados.filter(c => !c.morte)
  if (semAno.length) {
    return {
      estado: 'desconhecido',
      motivo: `Ano de morte desconhecido para ${semAno.map(c => c.nome).join(', ')}; sem isso não dá para afirmar nada.`,
      livre_em: null,
    }
  }
  const ultimo = creditados.reduce((a, c) => (c.morte > a.morte ? c : a))
  const livre_em = ultimo.morte + 71
  return {
    estado: livre_em <= ANO_ATUAL ? 'dominio_publico' : 'protegido',
    motivo: `${ultimo.nome} (${ultimo.papel}) morreu em ${ultimo.morte}; Lei 9.610/98 art. 41 (70 anos a partir de 1º/1 do ano seguinte) ⇒ livre em ${livre_em}.`,
    livre_em,
  }
}

/**
 * Estados Unidos — 95 anos da publicação para obras publicadas a partir de
 * 1929. É grosseiro de propósito: serve para NEGAR entrega, nunca para
 * autorizar. Na dúvida, 'desconhecido', e o texto não é servido lá.
 */
export function direitoUS({ ano, fonte }) {
  if (fonte === 'gutenberg' || fonte === 'standard_ebooks') {
    return {
      estado: 'dominio_publico',
      motivo: 'Item do Project Gutenberg/Standard Ebooks: domínio público nos EUA por verificação da própria fonte.',
      livre_em: null,
    }
  }
  if (!ano) {
    return { estado: 'desconhecido', motivo: 'Ano de publicação desconhecido.', livre_em: null }
  }
  const livre_em = ano + 95
  return {
    estado: livre_em <= ANO_ATUAL ? 'dominio_publico' : 'protegido',
    motivo: `Publicada em ${ano}; regra dos 95 anos ⇒ livre em ${livre_em}.`,
    livre_em,
  }
}

const LIVRE = new Set(['dominio_publico', 'licenca_livre', 'licenciado'])

/**
 * O trilho da obra sai do direito, nunca do desejo.
 *   A = temos arquivo E ele pode ser servido NA JURISDIÇÃO DE CASA
 *   B = não temos arquivo, ou não pode ser servido aqui
 *   C = arquivo do próprio leitor (nunca calculado aqui)
 *
 * A jurisdição de casa importa, e não é detalhe: há obras livres nos EUA e
 * protegidas no Brasil (Almada Negreiros, morto em 1970, só cai em 2041) e o
 * contrário (Orwell, livre no Brasil desde 2021 e protegido nos EUA até 2041).
 * Marcar "Ler" olhando a jurisdição errada é prometer o que não se entrega.
 *
 * `direitos` é [{ jurisdicao, estado }]. Quem lê de fora ainda passa pelo
 * podeLer() na hora da entrega — este cálculo é só o rótulo do catálogo.
 */
export function trilhoDe(temArquivo, direitos, casa = process.env.FIO_JURISDICAO || 'BR') {
  if (!temArquivo) return 'B'
  const daqui = direitos.find(d => d.jurisdicao === casa) ?? direitos.find(d => d.jurisdicao === '*')
  return daqui && LIVRE.has(daqui.estado) ? 'A' : 'B'
}

// ─────────────────────────────────────────────────────────────
// Anti-spoiler — a consulta inteira, num lugar só
//
// Toda leitura de contexto passa por aqui. Se um dia alguém escrever um
// SELECT em fragmento fora deste arquivo, o spoiler volta.
// ─────────────────────────────────────────────────────────────

export function fragmentosVisiveis(banco, { obra_id, tipo, ate_capitulo, nivel = 'ate_aqui' }) {
  const teto =
    nivel === 'nenhum' ? 0
    : nivel === 'ate_aqui' ? (ate_capitulo ?? 0)
    : Number.MAX_SAFE_INTEGER

  const sql = `
    SELECT id, tipo, titulo, corpo, natureza, capitulo_ord, revela_ate
      FROM fragmento
     WHERE obra_id = ?
       AND revela_ate <= ?
       AND (gerado_por <> 'ia' OR revisado = 1)
       ${tipo ? 'AND tipo = ?' : ''}
     ORDER BY capitulo_ord IS NULL DESC, capitulo_ord, id`
  const args = tipo ? [obra_id, teto, tipo] : [obra_id, teto]
  return banco.prepare(sql).all(...args)
}

// ─────────────────────────────────────────────────────────────
// Entrega de texto — a segunda checagem, a que vale
// ─────────────────────────────────────────────────────────────

export function podeLer(banco, { texto_id, leitor_id, jurisdicao }) {
  const t = banco.prepare('SELECT id, obra_id, dono_id FROM texto WHERE id = ?').get(texto_id)
  if (!t) return { pode: false, motivo: 'texto inexistente' }

  // Trilho C: é de uma pessoa e de mais ninguém.
  if (t.dono_id != null) {
    return t.dono_id === leitor_id
      ? { pode: true, motivo: 'arquivo do próprio leitor' }
      : { pode: false, motivo: 'arquivo privado de outro leitor' }
  }

  const d =
    banco.prepare('SELECT estado, motivo FROM direito WHERE texto_id = ? AND jurisdicao = ?').get(texto_id, jurisdicao) ??
    banco.prepare("SELECT estado, motivo FROM direito WHERE texto_id = ? AND jurisdicao = '*'").get(texto_id)

  if (!d) return { pode: false, motivo: `sem estado de direito para ${jurisdicao}` }
  const livre = d.estado === 'dominio_publico' || d.estado === 'licenca_livre' || d.estado === 'licenciado'
  return { pode: livre, motivo: d.motivo }
}
