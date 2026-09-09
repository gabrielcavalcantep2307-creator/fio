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
import { conferirSenha, guardarSenha, ipDoPedido } from './seguranca.mjs'
import { SUGESTOES, normalizar as achatarPergunta } from './perguntas.mjs'

const pasta = mkdtempSync(join(tmpdir(), 'fio-teste-'))
let banco

const BOA = 'a casa de matacavalos'

before(() => { banco = abrir(join(pasta, 'teste.db')) })
after(() => { fechar(); rmSync(pasta, { recursive: true, force: true }) })

const zerarFreio = () => banco.exec('DELETE FROM tentativa')
const novoConvite = () => contas.criarConvite(banco).codigo

// As perguntas de segurança são obrigatórias no cadastro desde que a
// recuperação por e-mail saiu. Um conjunto padrão evita repetir isto em
// vinte chamadas — e os testes que cuidam DAS PERGUNTAS passam o seu.
// As perguntas saem do CATÁLOGO, e não da imaginação de quem escreve o teste:
// desde a auditoria de 09/09 pergunta escrita à mão é recusada, porque ela
// furava o disfarce que esconde quem tem conta aqui.
const PERGUNTAS = [
  { pergunta: SUGESTOES[0], resposta: 'Dom Casmurro' },
  { pergunta: SUGESTOES[1], resposta: 'Rua das Laranjeiras' },
  { pergunta: SUGESTOES[2], resposta: 'Bitu' },
]

// A porta da casa passou a falhar FECHADA, então criar conta exige convite. A
// maioria destes testes não é sobre convite nenhum — é sobre senha, sessão,
// avaliação — e não deve carregar um `novoConvite()` em cada chamada. Quem
// não falar no assunto ganha um convite válido; quem QUISER testar a porta
// passa `convite: null` de propósito, e aí a recusa é o resultado esperado.
const criarConta = (dados, ctx) => contas.criar(banco, {
  perguntas: PERGUNTAS,
  ...('convite' in dados ? {} : { convite: novoConvite() }),
  ...dados,
}, ctx)

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

// A porta agora falha FECHADA. Antes, `portaAberta()` era
// `FIO_CONVITE !== 'obrigatorio'`: sem variável no ambiente ela abria, e como
// a variável não estava no docker-compose.yml a instalação de produção passou
// dias aceitando cadastro de qualquer um. Este teste é o que impede a volta.
test('sem configuração nenhuma a porta está fechada', async () => {
  zerarFreio()
  assert.equal(contas.portaAberta(), false)
  await assert.rejects(
    criarConta({ nome: 'Ninguém', email: 'sem-convite@exemplo.com', senha: BOA, convite: null }),
    /Convite inválido/,
  )
})

test('convite errado é recusado', async () => {
  zerarFreio()
  // aceitar em silêncio faria a pessoa achar que gastou o convite dela
  await assert.rejects(
    criarConta({ nome: 'Ninguém', email: 'x@y.com', senha: BOA, convite: 'FIO-XXXX-XXXX' }),
    /Convite inválido/,
  )
})

test('FIO_CONVITE=aberto abre a porta, e a primeira conta administra', async () => {
  zerarFreio()
  process.env.FIO_CONVITE = 'aberto'
  try {
    assert.equal(contas.portaAberta(), true)
    const { pessoa } = await criarConta({ nome: 'Primeira', email: 'primeira@exemplo.com', senha: BOA, convite: null })
    assert.equal(pessoa.email, 'primeira@exemplo.com')
    // a primeira conta da casa administra: sem isto, uma instalação nova não
    // teria ninguém que pudesse convidar ou revisar ficha nenhuma
    assert.equal(pessoa.papel, 'admin')
  } finally { delete process.env.FIO_CONVITE }
  assert.equal(contas.portaAberta(), false)
})

test('com convite se cria, e o convite não serve duas vezes', async () => {
  zerarFreio()
  const codigo = novoConvite()
  const { pessoa } = await criarConta({ nome: 'Gabriel', email: 'Gabriel@Exemplo.com', senha: BOA, convite: codigo })
  assert.equal(pessoa.email, 'gabriel@exemplo.com') // guardado em minúsculas
  assert.equal(pessoa.papel, 'leitor')

  await assert.rejects(
    criarConta({ nome: 'Outro', email: 'outro@exemplo.com', senha: BOA, convite: codigo }),
    /já usado/,
  )
})

test('senha fraca é recusada', async () => {
  zerarFreio()
  for (const fraca of ['curta', '1234567890', 'aaaaaaaaaaaa']) {
    await assert.rejects(
      criarConta({ nome: 'X', email: `f${Math.random()}@y.com`, senha: fraca, convite: novoConvite() }),
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

test('recuperar sem e-mail: responder certo troca a senha e derruba as sessões', async () => {
  zerarFreio()
  const antes = await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA })
  assert.ok(contas.deQuemE(banco, antes.sessao.token))

  zerarFreio()
  const { perguntas } = contas.perguntasParaRecuperar(banco, { email: 'gabriel@exemplo.com' })
  assert.equal(perguntas.length, 3)
  // as perguntas voltam; as respostas, nunca
  assert.ok(!JSON.stringify(perguntas).includes('Casmurro'))

  const NOVA = 'bentinho e o seminario'
  zerarFreio()
  await contas.recuperarComRespostas(banco, {
    email: 'gabriel@exemplo.com',
    // de propósito com acento e caixa trocados: a resposta é normalizada
    respostas: [{ ordem: 1, resposta: 'dom casmurro' },
                { ordem: 2, resposta: '  RUA das Laranjeiras ' },
                { ordem: 3, resposta: 'Bitú' }],
    senha: NOVA,
  })

  assert.equal(contas.deQuemE(banco, antes.sessao.token), null)
  zerarFreio()
  assert.ok(await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: NOVA }))
  zerarFreio()
  await assert.rejects(contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: BOA }))
})

test('resposta errada não troca senha nenhuma', async () => {
  zerarFreio()
  await assert.rejects(contas.recuperarComRespostas(banco, {
    email: 'gabriel@exemplo.com',
    respostas: [{ ordem: 1, resposta: 'errado' }, { ordem: 2, resposta: 'errado' }, { ordem: 3, resposta: 'errado' }],
    senha: 'senha que nao vai valer',
  }), /não conferem/)
  zerarFreio()
  assert.ok(await contas.entrar(banco, { email: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' }))
})

test('as perguntas não contam se o e-mail existe', () => {
  zerarFreio()
  const existe = contas.perguntasParaRecuperar(banco, { email: 'gabriel@exemplo.com' })
  zerarFreio()
  const fantasma = contas.perguntasParaRecuperar(banco, { email: 'fantasma@exemplo.com' })
  // mesma forma e mesma quantidade: quem varre a base não aprende nada
  assert.equal(existe.perguntas.length, fantasma.perguntas.length)
  zerarFreio()
  const denovo = contas.perguntasParaRecuperar(banco, { email: 'fantasma@exemplo.com' })
  // e as fingidas são ESTÁVEIS: um endereço inexistente devolve sempre as
  // mesmas, como uma conta de verdade devolveria
  assert.deepEqual(fantasma.perguntas, denovo.perguntas)
})

// ACHADO 6 da auditoria de 09/09/2026, e o mais sutil dos seis.
//
// `perguntasDe` esconde o e-mail que não existe devolvendo três perguntas
// sorteadas do catálogo público. O disfarce só funciona enquanto TUDO o que a
// rota devolve puder ter vindo de lá — e `pergunta` era texto livre. Quem
// escrevesse a própria pergunta furava o disfarce sozinho: a resposta trazia
// um texto que não está no catálogo, e isso prova que a conta existe.
//
// Contar quantas perguntas voltaram, que era o que se testava, não pega isso.
test('a rota de recuperar nunca devolve pergunta fora do catálogo', () => {
  const publico = new Set(SUGESTOES.map(achatarPergunta))

  zerarFreio()
  const existe = contas.perguntasParaRecuperar(banco, { email: 'gabriel@exemplo.com' })
  zerarFreio()
  const fantasma = contas.perguntasParaRecuperar(banco, { email: 'fantasma@exemplo.com' })

  for (const { pergunta } of [...existe.perguntas, ...fantasma.perguntas]) {
    assert.ok(publico.has(achatarPergunta(pergunta)),
      `pergunta fora do catálogo entrega que a conta existe: ${pergunta}`)
  }
})

test('pergunta escrita à mão é recusada no cadastro', async () => {
  zerarFreio()
  await assert.rejects(
    criarConta({
      nome: 'Escreveu', email: 'escreveu@exemplo.com', senha: BOA,
      perguntas: [
        { pergunta: 'Qual o nome do meu primeiro cachorro?', resposta: 'Rex' },
        { pergunta: SUGESTOES[1], resposta: 'Rua das Laranjeiras' },
        { pergunta: SUGESTOES[2], resposta: 'Bitu' },
      ],
    }),
    /Escolha uma pergunta da lista/,
  )
})

// ─────────────────────────────────────────────────────────────
// Modernizar: o mesmo livro, na língua de hoje
//
// Não é tradução de idioma. É "elle disse que o pharmaceutico era attento"
// virar "ele disse que o farmacêutico era atento". Roda em regra, sem rede e
// sem custo: um livro inteiro sai em menos de um segundo.
//
// 33.715 dos 86.588 capítulos do acervo têm grafia anterior aos acordos.
// ─────────────────────────────────────────────────────────────

test('a grafia de 1880 vira a de hoje', async () => {
  const { modernizar } = await import('../ingestao/modernizar.mjs')
  assert.equal(modernizar('Elle fallou de aquelle anno'), 'Ele falou de aquele ano')
  assert.equal(modernizar('o pharmaceutico e a sciencia'), 'o farmacêutico e a ciência')
  assert.equal(modernizar('o director da officina'), 'o diretor da oficina')
  assert.equal(modernizar("na noite d'este dia"), 'na noite deste dia')
  assert.equal(modernizar('aſſim mesmo'), 'assim mesmo')
})

// A regra da consoante dobrada estragava justamente os nomes por onde alguém
// procuraria o livro: Hobbes virava "Hobes" e Cromwell virava "Cromwel".
test('nome próprio não passa pela reforma ortográfica', async () => {
  const { modernizar } = await import('../ingestao/modernizar.mjs')
  for (const nome of ['Hobbes', 'Cromwell', 'Rossetti', 'Villa-Lobos', 'Rousseau']) {
    assert.equal(modernizar(nome), nome)
  }
})

test('rr e ss continuam dobrados, que é como se escreve hoje', async () => {
  const { modernizar } = await import('../ingestao/modernizar.mjs')
  assert.equal(modernizar('o carro passou assim pela terra'), 'o carro passou assim pela terra')
})

test('a marcação atravessa sem ser tocada', async () => {
  const { modernizar } = await import('../ingestao/modernizar.mjs')
  // sem isto, um atributo com "th" ou consoante dobrada viraria outra coisa
  assert.equal(
    modernizar('<p class="anno">Elle</p>'),
    '<p class="anno">Ele</p>')
})

test('a resposta nunca é guardada em claro', () => {
  const l = banco.prepare('SELECT id FROM leitor WHERE email = ?').get('gabriel@exemplo.com')
  const linhas = banco.prepare('SELECT * FROM pergunta WHERE leitor_id = ?').all(l.id)
  assert.equal(linhas.length, 3)
  for (const r of linhas) {
    assert.ok(!Buffer.from(r.resposta_hash).toString('utf8').toLowerCase().includes('casmurro'))
    assert.equal(r.resposta_sal.length, 16)
  }
})

test('trocar as perguntas exige a senha atual', async () => {
  zerarFreio()
  const l = banco.prepare('SELECT id FROM leitor WHERE email = ?').get('gabriel@exemplo.com')
  await assert.rejects(contas.trocarMinhasPerguntas(banco, l.id, {
    atual: 'senha errada mesmo', perguntas: PERGUNTAS,
  }), /não confere/)
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

// ─────────────────────────────────────────────────────────────
// Auditoria de 09/09/2026 — três achados, três testes
// ─────────────────────────────────────────────────────────────

// ACHADO 1. `ipDe` lia o PRIMEIRO item do X-Forwarded-For. O Caddy acrescenta
// o IP real ao que chegou em vez de substituir, então quem mandasse o
// cabeçalho de fora escolhia o próprio "IP" — e escolher IP novo a cada
// pedido é passar por todo freio que conta por IP.
test('o X-Forwarded-For de fora não escolhe o IP do pedido', () => {
  // um proxy só: o valor que ele pôs é o último, e é o que vale
  assert.equal(ipDoPedido('203.0.113.7', '127.0.0.1'), '203.0.113.7')

  // o atacante mandou 1.2.3.4; o Caddy anexou o IP de verdade atrás
  assert.equal(ipDoPedido('1.2.3.4, 203.0.113.7', '127.0.0.1'), '203.0.113.7')

  // e uma cadeia inteira forjada não muda nada: o fim continua sendo nosso
  assert.equal(ipDoPedido('9.9.9.9, 8.8.8.8, 203.0.113.7', '127.0.0.1'), '203.0.113.7')

  // sem cabeçalho nenhum, o soquete
  assert.equal(ipDoPedido(undefined, '10.0.0.9'), '10.0.0.9')
  assert.equal(ipDoPedido('', '10.0.0.9'), '10.0.0.9')
})

// ACHADO 2. `esqueci` e `responder` freavam por `email ?? ip` — OU um OU
// outro. Como ataque nenhum manda e-mail malformado, só o balde do e-mail
// contava: cinco chutes por conta por hora, e nada impedia cinco chutes em
// cada uma de duzentas contas na mesma hora, da mesma máquina.
test('a varredura de muitas contas de um IP só esbarra no teto do IP', async () => {
  zerarFreio()
  const ctx = { ip: '198.51.100.4' }
  let barrou = 0
  // trinta e cinco endereços diferentes, um chute em cada: nenhum estoura o
  // balde do próprio e-mail, e o do IP tem que estourar
  for (let i = 0; i < 35; i++) {
    const erro = await contas.recuperarComRespostas(banco, {
      email: `alvo${i}@exemplo.com`, senha: BOA, respostas: [],
    }, ctx).catch(e => e)
    if (erro.status === 429) barrou++
  }
  assert.ok(barrou > 0, 'varrer contas de um IP só tem que barrar')
})

test('o teto do IP não tranca quem só errou a própria senha', async () => {
  zerarFreio()
  // o balde do e-mail é 8 em 15 minutos e o do IP é 60: sete enganos seguidos
  // do mesmo aparelho continuam cabendo, e a oitava tentativa é a certa
  for (let i = 0; i < 7; i++) {
    await contas.entrar(banco,
      { email: 'gabriel@exemplo.com', senha: `engano ${i}` }, { ip: '198.51.100.9' }).catch(() => {})
  }
  const { pessoa } = await contas.entrar(banco,
    { email: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' }, { ip: '198.51.100.9' })
  assert.equal(pessoa.email, 'gabriel@exemplo.com')
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

// ── o que a auditoria de segurança encontrou, e que agora tem teste ────

test('apagar os dados apaga no servidor — senão a sincronia ressuscita', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Ana', email: 'ana@exemplo.com', senha: BOA, convite: novoConvite() })

  contas.guardar(banco, pessoa.id, {
    itens: [{ tipo: 'progresso', chave: '1', valor: { capitulo: 3 }, mudouEm: Date.now() }],
  })
  assert.equal(contas.lerGuardado(banco, pessoa.id).itens.length, 1)

  contas.apagarGuardado(banco, pessoa.id)
  assert.equal(contas.lerGuardado(banco, pessoa.id).itens.length, 0,
    'depois de apagar, o servidor nao pode devolver nada')
})

test('apagar a conta apaga sessao e dados junto', async () => {
  zerarFreio()
  const { pessoa, sessao } = await criarConta({ nome: 'Bia', email: 'bia@exemplo.com', senha: BOA, convite: novoConvite() })
  contas.guardar(banco, pessoa.id, {
    itens: [{ tipo: 'marcacao', chave: 'x', valor: { trecho: 'oi' }, mudouEm: Date.now() }],
  })

  contas.apagarConta(banco, pessoa.id)

  assert.equal(contas.deQuemE(banco, sessao.token), null, 'a sessao tem que morrer')
  assert.equal(banco.prepare('SELECT COUNT(*) n FROM guardado WHERE leitor_id = ?').get(pessoa.id).n, 0)
  assert.equal(banco.prepare('SELECT COUNT(*) n FROM leitor WHERE id = ?').get(pessoa.id).n, 0)
  zerarFreio()
  await assert.rejects(contas.entrar(banco, { email: 'bia@exemplo.com', senha: BOA }))
})

test('as sessoes tem teto — nao crescem para sempre', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Caio', email: 'caio@exemplo.com', senha: BOA, convite: novoConvite() })
  for (let i = 0; i < 20; i++) contas.abrirSessao(banco, pessoa.id, {})
  const { n } = banco.prepare('SELECT COUNT(*) n FROM sessao WHERE leitor_id = ?').get(pessoa.id)
  assert.ok(n <= 12, `sobraram ${n} sessoes, e o teto e 12`)
})

test('a sincronia nao aceita lixo', () => {
  zerarFreio()
  const l = banco.prepare("SELECT id FROM leitor WHERE email = 'ana@exemplo.com'").get()

  contas.guardar(banco, l.id, {
    itens: [
      { tipo: 'invadir', chave: 'x', valor: 1, mudouEm: Date.now() },
      { tipo: 'progresso', chave: 'y'.repeat(500), valor: 1, mudouEm: Date.now() },
      { tipo: 'progresso', chave: 'z', valor: 1, mudouEm: -5 },
    ],
  })
  assert.equal(contas.lerGuardado(banco, l.id).itens.length, 0)
  assert.throws(() => contas.guardar(banco, l.id, { itens: 'nao e lista' }), /Formato/)
})

test('relogio do futuro nao vence para sempre', () => {
  zerarFreio()
  const l = banco.prepare("SELECT id FROM leitor WHERE email = 'ana@exemplo.com'").get()
  const daquiA100Anos = Date.now() + 100 * 365 * 24 * 3600 * 1000
  contas.guardar(banco, l.id, {
    itens: [{ tipo: 'progresso', chave: '9', valor: { capitulo: 1 }, mudouEm: daquiA100Anos }],
  })
  const gravado = banco.prepare(
    "SELECT mudou_em FROM guardado WHERE leitor_id = ? AND chave = '9'").get(l.id)
  assert.ok(gravado.mudou_em < Date.now() + 120000,
    'um relogio adiantado grudaria o registro para sempre; tem que ser aparado')
})

test('o convite aceita como a pessoa digita, nao como o sistema imprime', async () => {
  zerarFreio()
  const codigo = novoConvite()                     // FIO-7K2M-9QXB
  const bagunca = ` ${codigo.toLowerCase().replaceAll('-', ' ')}  `
  const { pessoa } = await criarConta({ nome: 'Dora', email: 'dora@exemplo.com', senha: BOA, convite: bagunca })
  assert.equal(pessoa.nome, 'Dora')
})

test('convite errado por um caractere continua sendo errado', async () => {
  zerarFreio()
  const codigo = novoConvite()
  await assert.rejects(
    criarConta({ nome: 'Eva', email: 'eva@exemplo.com', senha: BOA, convite: codigo + 'D' }),
    /Convite inválido/,
  )
})

// ── a conta por dentro ────────────────────────────────────────

test('trocar a senha por dentro exige a senha atual', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Fabio', email: 'fabio@exemplo.com', senha: BOA })

  await assert.rejects(
    contas.trocarMinhaSenha(banco, pessoa.id, { atual: 'chute errado aqui', nova: 'outra senha boa' }),
    /não confere/,
  )
  await assert.rejects(
    contas.trocarMinhaSenha(banco, pessoa.id, { atual: BOA, nova: '123' }),
    /10 caracteres/,
  )
  await assert.rejects(
    contas.trocarMinhaSenha(banco, pessoa.id, { atual: BOA, nova: BOA }),
    /igual à antiga/,
  )
})

test('trocar a senha derruba os outros aparelhos e mantém este', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Gil', email: 'gil@exemplo.com', senha: BOA })
  const celular = contas.abrirSessao(banco, pessoa.id, { agente: 'celular' })
  const outro = contas.abrirSessao(banco, pessoa.id, { agente: 'outro' })
  assert.ok(contas.deQuemE(banco, celular.token))

  const NOVA = 'o cortico do joao romao'
  const { sessao } = await contas.trocarMinhaSenha(banco, pessoa.id, { atual: BOA, nova: NOVA })

  assert.equal(contas.deQuemE(banco, celular.token), null, 'o celular tem que cair')
  assert.equal(contas.deQuemE(banco, outro.token), null)
  assert.ok(contas.deQuemE(banco, sessao.token), 'quem trocou continua dentro')

  zerarFreio()
  assert.ok(await contas.entrar(banco, { email: 'gil@exemplo.com', senha: NOVA }))
  zerarFreio()
  await assert.rejects(contas.entrar(banco, { email: 'gil@exemplo.com', senha: BOA }))
})

test('a lista de aparelhos não entrega o token de nenhum deles', async () => {
  zerarFreio()
  const { pessoa, sessao } = await criarConta({ nome: 'Hugo', email: 'hugo@exemplo.com', senha: BOA })
  contas.abrirSessao(banco, pessoa.id, { agente: 'Mozilla/5.0 (iPhone) Safari/605' })

  const { sessoes } = contas.minhasSessoes(banco, pessoa.id, sessao.token)
  assert.equal(sessoes.length, 2)
  assert.equal(sessoes.filter(s => s.esta).length, 1, 'um, e só um, é o aparelho atual')

  const texto = JSON.stringify(sessoes)
  assert.ok(!texto.includes(sessao.token), 'o token não pode sair daqui')
  assert.ok(!texto.includes('token_hash'), 'nem o resumo dele')
  assert.ok(sessoes.some(s => s.aparelho.includes('iPhone')))
})

test('sair dos outros mantém este aparelho', async () => {
  zerarFreio()
  const { pessoa, sessao } = await criarConta({ nome: 'Ivo', email: 'ivo@exemplo.com', senha: BOA })
  const a = contas.abrirSessao(banco, pessoa.id, {})
  const b = contas.abrirSessao(banco, pessoa.id, {})

  const { encerradas } = contas.sairDosOutros(banco, pessoa.id, sessao.token)
  assert.equal(encerradas, 2)
  assert.ok(contas.deQuemE(banco, sessao.token))
  assert.equal(contas.deQuemE(banco, a.token), null)
  assert.equal(contas.deQuemE(banco, b.token), null)
})

test('exportar leva os dados e não leva a senha', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Julia', email: 'julia@exemplo.com', senha: BOA })
  contas.guardar(banco, pessoa.id, {
    itens: [{ tipo: 'progresso', chave: '7', valor: { capitulo: 2 }, mudouEm: Date.now() }],
  })

  const tudo = contas.exportarTudo(banco, pessoa.id)
  assert.equal(tudo.conta.email, 'julia@exemplo.com')
  assert.equal(tudo.guardado.length, 1)

  const texto = JSON.stringify(tudo)
  assert.ok(!texto.includes('senha_hash'))
  assert.ok(!texto.includes('senha_sal'))
  assert.ok(!/matacavalos/.test(texto))
})

test('mudar o nome não deixa passar nome vazio', () => {
  const l = banco.prepare("SELECT id FROM leitor WHERE email = 'julia@exemplo.com'").get()
  assert.throws(() => contas.mudarNome(banco, l.id, { nome: ' ' }), /como quer ser chamado/)
  const { pessoa } = contas.mudarNome(banco, l.id, { nome: '  Julia Prado  ' })
  assert.equal(pessoa.nome, 'Julia Prado')
})


// ── nota e resenha ────────────────────────────────────────────

test('a nota só vale de 1 a 5, e alguma coisa tem que ser dita', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Nina', email: 'nina@exemplo.com', senha: BOA })
  banco.prepare(`INSERT INTO obra (id, titulo, publicada) VALUES (9001, 'Obra de teste', 1)`).run()

  assert.throws(() => contas.avaliar(banco, pessoa.id, 9001, { nota: 9 }), /1 a 5/)
  assert.throws(() => contas.avaliar(banco, pessoa.id, 9001, { nota: 0 }), /1 a 5/)
  assert.throws(() => contas.avaliar(banco, pessoa.id, 9001, { nota: 2.5 }), /1 a 5/)
  assert.throws(() => contas.avaliar(banco, pessoa.id, 9001, {}), /Dê uma nota/)
  assert.throws(() => contas.avaliar(banco, pessoa.id, 9002, { nota: 5 }), /não existe/)
})

test('avaliar de novo corrige a nota, não empilha outra', async () => {
  zerarFreio()
  const l = banco.prepare("SELECT id FROM leitor WHERE email = 'nina@exemplo.com'").get()

  contas.avaliar(banco, l.id, 9001, { nota: 5 })
  contas.avaliar(banco, l.id, 9001, { nota: 3 })
  const r = contas.avaliacoesDa(banco, 9001, l.id)
  assert.equal(r.quantas, 1, 'uma pessoa, um voto')
  assert.equal(r.media, 3)
  assert.equal(r.minha.nota, 3)
})

test('a média é a das notas de gente diferente', async () => {
  zerarFreio()
  const a = banco.prepare("SELECT id FROM leitor WHERE email = 'nina@exemplo.com'").get()
  const { pessoa: b } = await criarConta({ nome: 'Otto', email: 'otto@exemplo.com', senha: BOA })
  contas.avaliar(banco, a.id, 9001, { nota: 3 })
  contas.avaliar(banco, b.id, 9001, { nota: 5, resenha: 'muito bom' })

  const r = contas.avaliacoesDa(banco, 9001)
  assert.equal(r.quantas, 2)
  assert.equal(r.media, 4)
  assert.equal(r.resenhas.length, 1, 'só quem escreveu aparece na lista')
  assert.equal(r.resenhas[0].quem, 'Otto')
  assert.equal(r.minha, null, 'sem leitor, não há "a minha"')
})

test('a resenha sai com o nome e nunca com o id de quem escreveu', () => {
  const r = contas.avaliacoesDa(banco, 9001)
  const texto = JSON.stringify(r.resenhas)
  assert.ok(texto.includes('Otto'))
  assert.ok(!texto.includes('leitor_id'), 'o id do leitor não pode vazar')
})

test('tirar a própria avaliação tira da média', () => {
  zerarFreio()
  const b = banco.prepare("SELECT id FROM leitor WHERE email = 'otto@exemplo.com'").get()
  const r = contas.desavaliar(banco, b.id, 9001)
  assert.equal(r.quantas, 1)
  assert.equal(r.resenhas.length, 0)
})

test('apagar a conta leva as avaliações junto', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Pedro', email: 'pedro@exemplo.com', senha: BOA })
  contas.avaliar(banco, pessoa.id, 9001, { nota: 4, resenha: 'gostei' })
  assert.equal(contas.avaliacoesDa(banco, 9001).resenhas.length, 1)

  contas.apagarConta(banco, pessoa.id)
  assert.equal(contas.avaliacoesDa(banco, 9001).resenhas.length, 0,
    'resenha órfã com nome de gente é dado pessoal sem dono')
})

test('exportar leva também o que a pessoa avaliou', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ nome: 'Rita', email: 'rita@exemplo.com', senha: BOA })
  contas.avaliar(banco, pessoa.id, 9001, { nota: 2, resenha: 'não é para mim' })
  const tudo = contas.exportarTudo(banco, pessoa.id)
  assert.equal(tudo.avaliacoes.length, 1)
  assert.equal(tudo.avaliacoes[0].nota, 2)
})

test('a sincronia guarda as preferências de leitura', () => {
  zerarFreio()
  const l = banco.prepare("SELECT id FROM leitor WHERE email = 'julia@exemplo.com'").get()
  contas.guardar(banco, l.id, {
    itens: [{ tipo: 'prefs', chave: 'leitura', valor: { tema: 'sepia', corpo: 1.3 }, mudouEm: Date.now() }],
  })
  const guardado = contas.lerGuardado(banco, l.id).itens.find(i => i.tipo === 'prefs')
  assert.ok(guardado, 'prefs é um tipo aceito pela sincronia')
  assert.equal(guardado.valor.tema, 'sepia')
})

// ─────────────────────────────────────────────────────────────
// O saneador de HTML
//
// Estes testes existem por causa de um bug de verdade, achado numa auditoria
// de segurança e não em leitura de código. A limpeza era feita por expressão
// regular; ela foi ensinada a pular strings entre aspas — e passou a EXIGIR
// que as aspas fechassem. O navegador não exige: em HTML5, aspa dentro de um
// valor sem aspas é só erro de parsing, e a tag termina no `>` do mesmo jeito.
//
// Resultado: uma aspa solta desarmava o saneador inteiro, e como o corpo do
// capítulo vai para `dangerouslySetInnerHTML` no leitor, qualquer pessoa que
// edita uma página do Wikisource podia executar script no site.
//
// Estão aqui, e não em ingestao/, porque este é o arquivo que roda no CI.
// ─────────────────────────────────────────────────────────────

test('o saneador não deixa passar tag com aspa solta', async () => {
  const { limpar } = await import('../ingestao/normalizar.mjs')

  const ataques = [
    // o caso que a auditoria achou: a aspa solta impedia o casamento
    "<p>Texto</p><p><img src=x onerror=alert(1) title=a'b></p>",
    '<p>a</p><img src=x onerror=alert(1)>',
    '<p>a</p><IMG SRC=x ONERROR=alert(1) ALT="fecha">',
    '<p>a</p><img src="x>y" onerror=alert(1)>',   // `>` dentro de aspas
    '<p>a</p><svg/onload=alert(1)>',
    '<p>a</p><script>alert(1)</script>',
    '<p>a</p><iframe src=javascript:alert(1)></iframe>',
    '<p>a</p><a href="javascript:alert(1)">x</a>',
  ]
  for (const ataque of ataques) {
    const limpo = limpar(ataque)
    assert.ok(!/onerror|onload|<script|<img|<svg|<iframe|javascript:/i.test(limpo),
      `passou marcação viva: ${limpo}`)
  }
})

test('o saneador preserva o texto e as tags permitidas', async () => {
  const { limpar } = await import('../ingestao/normalizar.mjs')

  // o caso do Parsoid, que foi o que motivou a mudança de expressão
  assert.equal(
    limpar(`<p data-mw='{"h":"<poem>x</poem>"}' id="mwA">Bom dia</p>`),
    '<p>Bom dia</p>')

  // tradução de tags, que o acervo depende para epígrafe e ênfase
  assert.equal(limpar('<i>it</i> e <b>bold</b> e <h5>tit</h5>'),
    '<em>it</em> e <strong>bold</strong> e <h3>tit</h3>')

  // `<` que é texto vira entidade em vez de virar começo de tag
  assert.ok(limpar('<p>5 < 6</p>').includes('&lt;'))
})

// ─────────────────────────────────────────────────────────────
// Custo zero, verificado — e não prometido
//
// O projeto passou a ter custo operacional zero por decisão do dono do
// acervo. Uma decisão dessas só vale se alguém puder conferir: promessa em
// README não impede ninguém de colar uma chamada paga seis meses depois,
// num commit que ninguém revisa.
//
// Este teste roda no CI e falha se o custo voltar.
// ─────────────────────────────────────────────────────────────

test('nenhum código chama serviço pago', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join, extname } = await import('node:path')
  const { RAIZ } = await import('./banco/base.mjs')

  // O que denuncia um serviço pago: o endereço, o nome da variável de chave,
  // ou a palavra que só aparece em quem cobra.
  const PROIBIDO = [
    /api\.anthropic\.com/i,
    /api\.openai\.com/i,
    /ANTHROPIC_API_KEY/,
    /OPENAI_API_KEY/,
    /FIO_IA_CHAVE/,
  ]

  const IGNORAR = new Set(['node_modules', 'dist', '.git', 'dados', 'traducoes', 'capas'])
  const achados = []

  function varrer(pasta) {
    for (const nome of readdirSync(pasta)) {
      if (IGNORAR.has(nome)) continue
      const caminho = join(pasta, nome)
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue }
      if (!['.mjs', '.js', '.ts', '.tsx', '.json', '.yml'].includes(extname(nome))) continue
      // este próprio arquivo contém os padrões, por definição
      if (nome === 'testes.mjs') continue
      const texto = readFileSync(caminho, 'utf8')
      for (const re of PROIBIDO) {
        if (re.test(texto)) achados.push(`${caminho}: ${re}`)
      }
    }
  }
  varrer(join(RAIZ, 'servidor'))
  varrer(join(RAIZ, 'ingestao'))
  varrer(join(RAIZ, 'web', 'src'))

  assert.deepEqual(achados, [], 'voltou a haver chamada a serviço pago:\n' + achados.join('\n'))
})

test('o tradutor gratuito não precisa de chave nenhuma', async () => {
  const { motorDisponivel, porQueNaoRoda } = await import('../ingestao/motor-traducao.mjs')
  const m = motorDisponivel()
  assert.ok(m, 'o motor tem que estar sempre disponível: não há chave para faltar')
  assert.equal(m.custo, 0)
  assert.equal(porQueNaoRoda(), null)
})

test('o glossário força o termo mesmo sem poder instruir o tradutor', async () => {
  const { aplicarGlossario } = await import('../ingestao/motor-traducao.mjs')
  // o motor gratuito não lê instrução; a garantia é mecânica
  assert.equal(
    aplicarGlossario('A virtude do príncipe e a Virtude dele', { virtude: 'virtù' }),
    'A virtù do príncipe e a Virtù dele')
})

// ─────────────────────────────────────────────────────────────
// Catalogação — o vínculo com a Open Library
//
// O acervo tinha a ficha de "Duna" apontando para OL20884176W, que é
// "Imperador Deus de Duna" — o quarto livro da série. O autor batia e o
// título continha a palavra "Duna", então tudo o que olhasse por
// semelhança dizia que estava certo. Quem clicasse em "ver na Open
// Library" a partir do Duna chegava a outro livro.
//
// O conserto foi comparar CONJUNTO de palavras significativas, e este
// teste é o que impede o `includes` de voltar.
// ─────────────────────────────────────────────────────────────

test('a escolha entre fichas repetidas prefere a portuguesa', async () => {
  const { escolher } = await import('../ingestao/catalogar.mjs')
  const candidatos = [
    { id: 979, titulo: 'Dune', titulo_pt: 'Dune', capa: null, textos: 0 },
    { id: 1057, titulo: 'Duna', titulo_pt: 'Duna', capa: null, textos: 0 },
  ]
  // sem o critério do título, o id menor ganharia e a estante mostraria "Dune"
  assert.equal(escolher(candidatos, 'Duna').obra.id, 1057)
  assert.deepEqual(escolher(candidatos, 'Duna').sobras.map(s => s.id), [979])
})

test('a ficha com texto ganha de qualquer outra', async () => {
  const { escolher } = await import('../ingestao/catalogar.mjs')
  const candidatos = [
    { id: 10, titulo: 'A Arte da Guerra', titulo_pt: 'A Arte da Guerra', capa: 'x.jpg', textos: 0 },
    { id: 99, titulo: '孫子兵法', titulo_pt: 'A Arte da Guerra', capa: null, textos: 2 },
  ]
  // é o exemplar que a pessoa vai conseguir abrir; título e capa vêm depois
  assert.equal(escolher(candidatos, 'A Arte da Guerra').obra.id, 99)
})

// ─────────────────────────────────────────────────────────────
// Tradução — o cabeçalho, que o tradutor automático não sabe ler
//
// Traduzindo "O Príncipe", o capítulo XIII saiu assim:
//
//   "## CHAPTER XIII. CONCERNING AUXILIARIES, MIXED SOLDIERY, AND ONE'S OWN"
//   → "Capítulo XIII. CONCERENTE A AUSILARIOS, SOBRE MIXO, E A SUA PELIGIA"
//
// "Concerente", "ausilarios" e "peligia" não são palavras. A causa são dois
// defeitos somados: a CAIXA ALTA é rara no texto de treino de um tradutor
// neural, e o "##" do Markdown entra na frase como se fosse palavra. O mesmo
// título em caixa mista e sem cerquilha sai limpo.
// ─────────────────────────────────────────────────────────────

test('o cabeçalho perde a cerquilha para traduzir e a recupera depois', async () => {
  const { prepararUnidade } = await import('../ingestao/motor-traducao.mjs')
  const { entrada, refazer } = prepararUnidade('## Contents')
  // "## Contents" era traduzido como "Contígo"; "Contents", como "Conteúdo"
  assert.equal(entrada, 'Contents')
  assert.equal(refazer('Conteúdo'), '## Conteúdo')
})

test('a caixa alta do cabeçalho vira caixa de título, poupando romano', async () => {
  const { prepararUnidade, emCaixaDeTitulo } = await import('../ingestao/motor-traducao.mjs')
  assert.equal(
    prepararUnidade('## CHAPTER XIII. CONCERNING AUXILIARIES').entrada,
    'Chapter XIII. Concerning Auxiliaries')
  // XIII não pode virar "Xiii"
  assert.equal(emCaixaDeTitulo('BOOK IV. OF THE LAWS'), 'Book IV. Of The Laws')
})

test('texto corrido não é tocado pelo preparo', async () => {
  const { prepararUnidade } = await import('../ingestao/motor-traducao.mjs')
  const p = 'Um parágrafo comum, com uma SIGLA no meio, que deve passar inteiro.'
  const { entrada, refazer } = prepararUnidade(p)
  assert.equal(entrada, p)
  assert.equal(refazer('qualquer coisa'), 'qualquer coisa')
})

// ─────────────────────────────────────────────────────────────
// Tradução — português de Portugal, que o MinT devolve sem avisar
//
// Ele é treinado em "português", e português tem duas normas escritas.
// Medindo as seis primeiras obras traduzidas:
//
//     172  "estava a fazer", "está a ver", "estão a chegar"
//      19  "facto"
//      10  "pequeno-almoço"
//
// A palavra solta um leitor brasileiro atravessa. A CONSTRUÇÃO, não: 172
// ocorrências em seis livros são o que faz o texto inteiro soar de outro
// lugar — e ela é gramatical, então nenhum glossário a pega.
// ─────────────────────────────────────────────────────────────

test('"estava a fazer" vira "estava fazendo"', async () => {
  const { abrasileirar } = await import('../ingestao/motor-traducao.mjs')
  assert.equal(abrasileirar('Ele estava a fazer o jantar'), 'Ele estava fazendo o jantar')
  assert.equal(abrasileirar('K. estava a ser julgado'), 'K. estava sendo julgado')
  assert.equal(abrasileirar('Eles continuavam a esperar'), 'Eles continuavam esperando')
})

test('"está a par" não vira "está pando"', async () => {
  const { abrasileirar } = await import('../ingestao/motor-traducao.mjs')
  // "estar a" + substantivo é outra construção, e sem a lista de exceções
  // esta frase saía destruída
  assert.equal(abrasileirar('Ele está a par do assunto'), 'Ele está a par do assunto')
})

test('quando o gênero muda, o artigo vai junto', async () => {
  const { abrasileirar } = await import('../ingestao/motor-traducao.mjs')
  // "casa de banho" é feminino e "banheiro" masculino: trocar só o
  // substantivo produzia "na banheiro", que é pior que o problema
  assert.equal(abrasileirar('Estava na casa de banho'), 'Estava no banheiro')
  assert.equal(abrasileirar('Pôs no frigorífico'), 'Pôs na geladeira')
})

test('o acento não faz o termo escapar', async () => {
  const { abrasileirar } = await import('../ingestao/motor-traducao.mjs')
  // o \b do JavaScript é ASCII e não reconhece "ã" como letra: "no ecrã"
  // atravessava intacto enquanto "comboio" era trocado
  assert.equal(abrasileirar('A imagem no ecrã'), 'A imagem na tela')
  assert.equal(abrasileirar('Pegou o comboio'), 'Pegou o trem')
})
