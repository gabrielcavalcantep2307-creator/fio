// Testes do login. Sem dependência, sem servidor no ar.
//
//   node --test servidor/testes.mjs
//
// Autenticação é o tipo de código em que um bug não aparece usando: o site
// continua funcionando lindamente enquanto a senha de todo mundo está mal
// guardada. Por isso o que se testa aqui não é "consegue entrar" — é
// **consegue NÃO entrar** nos casos em que não deve.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrir, fechar } from './banco/base.mjs'
import * as contas from './contas.mjs'
import { conferirSenha, guardarSenha } from './seguranca.mjs'

const pasta = mkdtempSync(join(tmpdir(), 'fio-teste-'))
let banco

const BOA = 'a casa de matacavalos'

before(() => { banco = abrir(join(pasta, 'teste.db')) })
after(() => { fechar(); rmSync(pasta, { recursive: true, force: true }) })

const zerarFreio = () => banco.exec('DELETE FROM tentativa')
const novoConvite = () => contas.criarConvite(banco).codigo

// ─────────────────────────────────────────────────────────────

test('a senha nunca é guardada em claro', async () => {
  const { hash, sal, params } = await guardarSenha(BOA)
  assert.ok(!hash.toString('utf8').includes('matacavalos'))
  assert.equal(hash.length, 64)
  assert.equal(sal.length, 16)
  assert.ok(await conferirSenha(BOA, hash, sal, params))
  assert.ok(!(await conferirSenha(BOA + 's', hash, sal, params)))
})

test('a mesma senha gera hashes diferentes para pessoas diferentes', async () => {
  const a = await guardarSenha(BOA)
  const b = await guardarSenha(BOA)
  assert.notEqual(a.hash.toString('hex'), b.hash.toString('hex'))
})

test('sem convite não se cria conta', async () => {
  zerarFreio()
  await assert.rejects(
    contas.criar(banco, { nome: 'Ninguém', email: 'x@y.com', senha: BOA, convite: 'FIO-XXXX-XXXX' }),
    /Convite inválido/,
  )
})

test('com convite se cria, e o convite não serve duas vezes', async () => {
  zerarFreio()
  const codigo = novoConvite()
  const { pessoa } = await contas.criar(banco,
    { nome: 'Gabriel', email: 'Gabriel@Exemplo.com', senha: BOA, convite: codigo })
  assert.equal(pessoa.email, 'gabriel@exemplo.com') // guardado em minúsculas
  assert.equal(pessoa.papel, 'leitor')

  await assert.rejects(
    contas.criar(banco, { nome: 'Outro', email: 'outro@exemplo.com', senha: BOA, convite: codigo }),
    /já usado/,
  )
})

test('senha fraca é recusada', async () => {
  zerarFreio()
  for (const fraca of ['curta', '1234567890', 'aaaaaaaaaaaa']) {
    await assert.rejects(
      contas.criar(banco, { nome: 'X', email: `f${Math.random()}@y.com`, senha: fraca, convite: novoConvite() }),
    )
  }
})

test('entra com a senha certa e não entra com a errada', async () => {
  zerarFreio()
  const ok = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA })
  assert.equal(ok.pessoa.nome, 'Gabriel')
  assert.ok(ok.sessao.token.length > 20)

  zerarFreio()
  await assert.rejects(
    contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: 'a casa de matacavalo' }),
    /não conferem/,
  )
})

test('a resposta é a mesma para e-mail que existe e que não existe', async () => {
  zerarFreio()
  const a = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: 'errada errada' })
    .catch(e => e.message)
  zerarFreio()
  const b = await contas.entrar(banco, { email: 'nao-existe@exemplo.com', senha: 'errada errada' })
    .catch(e => e.message)
  assert.equal(a, b, 'a mensagem não pode dizer se a conta existe')
})

test('o token da sessão não fica no banco em claro', async () => {
  zerarFreio()
  const { sessao } = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA })
  const linhas = banco.prepare('SELECT token_hash FROM sessao').all()
  for (const l of linhas) {
    assert.ok(!Buffer.from(l.token_hash).toString('utf8').includes(sessao.token))
  }
  assert.ok(contas.deQuemE(banco, sessao.token))
  assert.equal(contas.deQuemE(banco, 'token-inventado'), null)
})

test('sair invalida a sessão', async () => {
  zerarFreio()
  const { sessao } = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA })
  contas.sair(banco, sessao.token)
  assert.equal(contas.deQuemE(banco, sessao.token), null)
})

test('sessão vencida não vale', async () => {
  zerarFreio()
  const { sessao } = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA })
  banco.prepare(`UPDATE sessao SET expira_em = datetime('now', '-1 hour')`).run()
  assert.equal(contas.deQuemE(banco, sessao.token), null)
})

test('trocar a senha: uso único, e derruba todas as sessões', async () => {
  zerarFreio()
  const antes = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA })
  assert.ok(contas.deQuemE(banco, antes.sessao.token))

  zerarFreio()
  const { aviso } = contas.pedirTroca(banco, { email: 'gabriel@exemplo.com' })
  assert.ok(aviso?.token)

  const NOVA = 'bentinho e o seminario'
  await contas.trocarSenha(banco, { token: aviso.token, senha: NOVA })

  // a sessão antiga morreu
  assert.equal(contas.deQuemE(banco, antes.sessao.token), null)
  // o link não serve de novo
  await assert.rejects(contas.trocarSenha(banco, { token: aviso.token, senha: 'outra coisa aqui' }), /já foi usado/)
  // a senha nova vale, a antiga não
  zerarFreio()
  assert.ok(await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: NOVA }))
  zerarFreio()
  await assert.rejects(contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA }))
})

test('"esqueci" não conta se o e-mail existe', () => {
  zerarFreio()
  const existe = contas.pedirTroca(banco, { email: 'gabriel@exemplo.com' })
  zerarFreio()
  const naoExiste = contas.pedirTroca(banco, { email: 'fantasma@exemplo.com' })
  // por dentro há um token; por fora, as duas chamadas devolvem a mesma forma
  assert.equal(Object.keys(existe).join(), Object.keys(naoExiste).join())
  assert.equal(naoExiste.aviso, null)
})

test('link de troca vencido não vale', async () => {
  zerarFreio()
  const { aviso } = contas.pedirTroca(banco, { email: 'gabriel@exemplo.com' })
  banco.prepare(`UPDATE recuperacao SET expira_em = datetime('now','-1 minute') WHERE usado_em IS NULL`).run()
  await assert.rejects(contas.trocarSenha(banco, { token: aviso.token, senha: 'qualquer coisa boa' }), /venceu/)
})

test('o freio segura a força bruta', async () => {
  zerarFreio()
  let barrou = false
  for (let i = 0; i < 12; i++) {
    const erro = await contas.entrar(banco,
      { email: 'gabriel@exemplo.com', senha: `chute ${i} errado` }).catch(e => e)
    if (erro.status === 429) { barrou = true; break }
  }
  assert.ok(barrou, 'depois de algumas tentativas tem que barrar')
})

test('entrar certo limpa o contador de tentativas', async () => {
  zerarFreio()
  await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: 'errada de novo' }).catch(() => {})
  await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' })
  const { n } = banco.prepare(
    `SELECT COUNT(*) n FROM tentativa WHERE chave = 'entrar:gabriel@exemplo.com'`).get()
  assert.equal(n, 0)
})

test('conta desativada não entra', async () => {
  zerarFreio()
  banco.prepare('UPDATE leitor SET desativado = 1 WHERE email = ?').run('gabriel@exemplo.com')
  await assert.rejects(contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' }))
  banco.prepare('UPDATE leitor SET desativado = 0 WHERE email = ?').run('gabriel@exemplo.com')
})
