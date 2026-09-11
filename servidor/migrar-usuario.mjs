// A migração do e-mail para o nome de usuário.
//
//   node servidor/migrar-usuario.mjs [--banco /dados/catalogo.db] [--seco]
//
// `--seco` mostra o que faria e não escreve nada.
//
// ─────────────────────────────────────────────────────────────
// POR QUE ISTO É UMA RECONSTRUÇÃO DE TABELA, E NÃO UM `ALTER TABLE`
//
// São três mudanças em `leitor`:
//
//   entra `usuario`        NOT NULL
//   entra `usuario_chave`  NOT NULL UNIQUE
//   `email` deixa de ser   NOT NULL
//
// As duas primeiras dariam para fazer com `ALTER TABLE ADD COLUMN`. A
// terceira, não: o SQLite não sabe afrouxar um NOT NULL. A única saída é
// construir a tabela nova, copiar, trocar — e é a saída que a documentação
// dele mesmo recomenda.
//
// ─────────────────────────────────────────────────────────────
// A PARTE PERIGOSA, E COMO ELA É DESARMADA
//
// `DROP TABLE leitor` com as chaves estrangeiras LIGADAS levaria junto, por
// cascata, tudo que aponta para ela: sessões, perguntas de segurança,
// marcações, progresso, avaliações. A conta sobreviveria vazia.
//
// Por isso `PRAGMA foreign_keys = OFF` antes e `foreign_key_check` DEPOIS: o
// desligamento é a técnica, e a conferência é o que prova que ela não
// quebrou nada. Sem a segunda, a primeira é só uma aposta.
//
// E `PRAGMA foreign_keys` não funciona dentro de uma transação — o SQLite a
// ignora em silêncio, que é a pior maneira de não funcionar. Por isso ela vem
// antes do `BEGIN`.
// ─────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chaveDe, conferirUsuario } from './usuario.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const seco = process.argv.includes('--seco')
const banco = arg('banco', process.env.FIO_BANCO ?? join(RAIZ, 'dados', 'catalogo.db'))

const db = new DatabaseSync(banco)

const colunas = db.prepare('PRAGMA table_info(leitor)').all().map((c) => c.name)
if (colunas.includes('usuario')) {
  console.log('já migrado: `leitor.usuario` existe.')
  process.exit(0)
}

/**
 * O nome de usuário de quem já está dentro.
 *
 * Sai da parte do e-mail antes do arroba, que é o mais perto de um nome
 * escolhido que a conta antiga tem. Se não servir — curto demais, caractere
 * que não entra, nome reservado — vira `leitor<id>`, que é feio e é
 * trocável na tela de conta. Feio e trocável é melhor que a migração parar.
 */
function nomePara(l, tomados) {
  const tentativas = [
    String(l.email ?? '').split('@')[0],
    String(l.nome ?? '').replace(/\s+/g, ''),
    `leitor${l.id}`,
  ]
  for (const bruta of tentativas) {
    const limpa = bruta.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '')
    if (conferirUsuario(limpa)) continue
    if (tomados.has(chaveDe(limpa))) continue
    return limpa
  }
  // último recurso, que não colide porque o id não colide
  return `leitor${l.id}`
}

const gente = db.prepare('SELECT id, email, nome FROM leitor ORDER BY id').all()
const tomados = new Set()
const plano = gente.map((l) => {
  const usuario = nomePara(l, tomados)
  tomados.add(chaveDe(usuario))
  return { ...l, usuario, chave: chaveDe(usuario) }
})

console.log(`${plano.length} contas\n`)
for (const p of plano) console.log(`  ${String(p.id).padStart(4)}  ${String(p.email ?? '—').padEnd(30)} → ${p.usuario}`)

if (seco) { console.log('\n(--seco: nada foi escrito)'); process.exit(0) }

// ── a troca ──

const criaTabela = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='leitor'").get().sql

const novo = criaTabela
  .replace(/CREATE TABLE\s+"?leitor"?/i, 'CREATE TABLE leitor_novo')
  .replace(/email\s+TEXT\s+NOT NULL\s+UNIQUE\s+COLLATE NOCASE/i,
    'usuario TEXT NOT NULL,\n  usuario_chave TEXT NOT NULL UNIQUE,\n  email TEXT UNIQUE COLLATE NOCASE')

if (!/usuario_chave/.test(novo)) {
  console.error('não reconheci a definição de `email` na tabela atual. Parando sem mexer em nada.')
  process.exit(1)
}

const indices = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='leitor' AND sql IS NOT NULL")
  .all().map((r) => r.sql)

db.exec('PRAGMA foreign_keys = OFF')
db.exec('BEGIN')
try {
  db.exec(novo)

  const antigas = colunas.join(', ')
  db.exec(`INSERT INTO leitor_novo (usuario, usuario_chave, ${antigas})
           SELECT '', '', ${antigas} FROM leitor`)

  const poe = db.prepare('UPDATE leitor_novo SET usuario = ?, usuario_chave = ? WHERE id = ?')
  for (const p of plano) poe.run(p.usuario, p.chave, p.id)

  db.exec('DROP TABLE leitor')
  db.exec('ALTER TABLE leitor_novo RENAME TO leitor')
  for (const sql of indices) db.exec(sql)

  db.exec('COMMIT')
} catch (e) {
  db.exec('ROLLBACK')
  db.exec('PRAGMA foreign_keys = ON')
  console.error('\nfalhou, e nada foi trocado:', e.message)
  process.exit(1)
}
db.exec('PRAGMA foreign_keys = ON')

// ── a conferência, que é o que torna o desligamento aceitável ──

const orfaos = db.prepare('PRAGMA foreign_key_check').all()
if (orfaos.length) {
  console.error(`\nATENÇÃO: ${orfaos.length} linhas ficaram órfãs. Restaure o backup.`)
  console.error(JSON.stringify(orfaos.slice(0, 5)))
  process.exit(1)
}

const conferindo = db.prepare(
  'SELECT COUNT(*) q, COUNT(DISTINCT usuario_chave) u FROM leitor').get()
console.log(`\n${conferindo.q} contas, ${conferindo.u} nomes distintos`)
console.log(`sessões de pé: ${db.prepare('SELECT COUNT(*) q FROM sessao').get().q}`)
console.log(`perguntas de segurança: ${db.prepare('SELECT COUNT(*) q FROM pergunta').get().q}`)
console.log('\nchaves estrangeiras conferidas, nenhuma órfã.')
