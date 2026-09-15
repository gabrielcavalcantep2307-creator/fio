// Cria a conta de administração do painel, e a tabela da fila.
//
//   node servidor/criar-admin.mjs --banco /dados/catalogo.db --usuario NOME
//
// Roda uma vez. Imprime a senha UMA vez — ela não fica gravada em lugar nenhum
// em texto, só o hash scrypt entra no banco. Se perder, roda de novo com outro
// usuário, ou troca a senha pelo próprio site depois de entrar.
//
// A conta nasce com papel 'admin', que é o que o painel exige em toda rota. E
// nasce SEM perguntas de recuperação: a recuperação por pergunta é para o
// leitor comum; esta conta é do dono, e a senha forte impressa aqui é para ele
// guardar no gerenciador dele.

import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardarSenha } from './seguranca.mjs'
import { chaveDe, conferirUsuario, estaTomado } from './usuario.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const banco = new DatabaseSync(arg('banco', join(RAIZ, 'dados', 'catalogo.db')))
const usuario = arg('usuario')

// A tabela da fila, caso o banco seja anterior a ela.
banco.exec(`
  CREATE TABLE IF NOT EXISTS fila_traducao (
    id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, autor TEXT NOT NULL, morte INTEGER,
    fonte TEXT NOT NULL, idioma TEXT NOT NULL DEFAULT 'en',
    estado TEXT NOT NULL DEFAULT 'espera' CHECK (estado IN ('espera','na_esteira','pronto','erro')),
    obra_id INTEGER REFERENCES obra(id), nota TEXT, pedido_por INTEGER REFERENCES leitor(id),
    criado_em TEXT NOT NULL DEFAULT (datetime('now')), mexido_em TEXT NOT NULL DEFAULT (datetime('now')))`)
banco.exec('CREATE INDEX IF NOT EXISTS idx_fila_estado ON fila_traducao(estado, criado_em)')

if (!usuario) {
  console.log('tabela da fila pronta. para criar o admin: --usuario NOME')
  process.exit(0)
}

const problema = conferirUsuario(usuario)
if (problema) { console.error(`usuário inválido: ${problema}`); process.exit(1) }
if (estaTomado(banco, usuario)) { console.error('esse nome já está em uso'); process.exit(1) }

// Uma senha que ninguém adivinha e ainda dá para ditar: quatro blocos de
// base32 sem letras ambíguas. ~20 caracteres de aleatório real.
const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const bloco = () => [...randomBytes(5)].map((b) => alfabeto[b % alfabeto.length]).join('')
const senha = `${bloco()}-${bloco()}-${bloco()}-${bloco()}`

const s = await guardarSenha(senha)
const id = Number(banco.prepare(
  `INSERT INTO leitor (usuario, usuario_chave, nome, senha_hash, senha_sal, senha_params, papel)
   VALUES (?,?,?,?,?,?, 'admin')`,
).run(usuario, chaveDe(usuario), usuario, s.hash, s.sal, s.params).lastInsertRowid)

console.log('\n  ┌─ conta de administração criada ─────────────────')
console.log('  │')
console.log(`  │   usuário:  ${usuario}`)
console.log(`  │   senha:    ${senha}`)
console.log('  │')
console.log('  │   Guarde a senha AGORA — ela não aparece de novo.')
console.log('  │   Entre no site com ela e acesse /admin.')
console.log(`  └─ id ${id}, papel admin ──────────────────────────\n`)
