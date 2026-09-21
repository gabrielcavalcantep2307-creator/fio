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
import { criarBuscaNoTexto, comoConsulta } from './busca-no-texto.mjs'
import { reindexarCapitulos } from './reindexar.mjs'

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
  // O login virou por NOME DE USUÁRIO. Quem não disser um ganha o pedaço do
  // e-mail antes do arroba, que é o mesmo que a migração faz com as contas
  // que já existiam.
  ...(dados.usuario === undefined
    ? { usuario: String(dados.email ?? 'alguem').split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'alguem' }
    : {}),
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
    criarConta({ nome: 'Ninguém', email: 'convidado@y.com', senha: BOA, convite: 'FIO-XXXX-XXXX' }),
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
  const ok = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: BOA })
  assert.equal(ok.pessoa.nome, 'Gabriel')
  assert.ok(ok.sessao.token.length > 20)

  zerarFreio()
  await assert.rejects(
    contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'a casa de matacavalo' }),
    /não conferem/,
  )
})

test('a resposta é a mesma para e-mail que existe e que não existe', async () => {
  zerarFreio()
  const a = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'errada errada' })
    .catch(e => e.message)
  zerarFreio()
  const b = await contas.entrar(banco, { usuario: 'nao-existe@exemplo.com', senha: 'errada errada' })
    .catch(e => e.message)
  assert.equal(a, b, 'a mensagem não pode dizer se a conta existe')
})

test('o token da sessão não fica no banco em claro', async () => {
  zerarFreio()
  const { sessao } = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: BOA })
  const linhas = banco.prepare('SELECT token_hash FROM sessao').all()
  for (const l of linhas) {
    assert.ok(!Buffer.from(l.token_hash).toString('utf8').includes(sessao.token))
  }
  assert.ok(contas.deQuemE(banco, sessao.token))
  assert.equal(contas.deQuemE(banco, 'token-inventado'), null)
})

test('sair invalida a sessão', async () => {
  zerarFreio()
  const { sessao } = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: BOA })
  contas.sair(banco, sessao.token)
  assert.equal(contas.deQuemE(banco, sessao.token), null)
})

test('sessão vencida não vale', async () => {
  zerarFreio()
  const { sessao } = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: BOA })
  banco.prepare(`UPDATE sessao SET expira_em = datetime('now', '-1 hour')`).run()
  assert.equal(contas.deQuemE(banco, sessao.token), null)
})

test('recuperar sem e-mail: responder certo troca a senha e derruba as sessões', async () => {
  zerarFreio()
  const antes = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: BOA })
  assert.ok(contas.deQuemE(banco, antes.sessao.token))

  zerarFreio()
  const { perguntas } = contas.perguntasParaRecuperar(banco, { usuario: 'gabriel' })
  assert.equal(perguntas.length, 3)
  // as perguntas voltam; as respostas, nunca
  assert.ok(!JSON.stringify(perguntas).includes('Casmurro'))

  const NOVA = 'bentinho e o seminario'
  zerarFreio()
  await contas.recuperarComRespostas(banco, {
    usuario: 'gabriel@exemplo.com',
    // de propósito com acento e caixa trocados: a resposta é normalizada
    respostas: [{ ordem: 1, resposta: 'dom casmurro' },
                { ordem: 2, resposta: '  RUA das Laranjeiras ' },
                { ordem: 3, resposta: 'Bitú' }],
    senha: NOVA,
  })

  assert.equal(contas.deQuemE(banco, antes.sessao.token), null)
  zerarFreio()
  assert.ok(await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: NOVA }))
  zerarFreio()
  await assert.rejects(contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: BOA }))
})

test('resposta errada não troca senha nenhuma', async () => {
  zerarFreio()
  await assert.rejects(contas.recuperarComRespostas(banco, {
    usuario: 'gabriel@exemplo.com',
    respostas: [{ ordem: 1, resposta: 'errado' }, { ordem: 2, resposta: 'errado' }, { ordem: 3, resposta: 'errado' }],
    senha: 'senha que nao vai valer',
  }), /não conferem/)
  zerarFreio()
  assert.ok(await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' }))
})

test('as perguntas não contam se o e-mail existe', () => {
  zerarFreio()
  const existe = contas.perguntasParaRecuperar(banco, { usuario: 'gabriel' })
  zerarFreio()
  const fantasma = contas.perguntasParaRecuperar(banco, { usuario: 'fantasma' })
  // mesma forma e mesma quantidade: quem varre a base não aprende nada
  assert.equal(existe.perguntas.length, fantasma.perguntas.length)
  zerarFreio()
  const denovo = contas.perguntasParaRecuperar(banco, { usuario: 'fantasma' })
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
  const existe = contas.perguntasParaRecuperar(banco, { usuario: 'gabriel' })
  zerarFreio()
  const fantasma = contas.perguntasParaRecuperar(banco, { usuario: 'fantasma' })

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
// Buscar dentro dos livros
//
// A rota é pública e é a mais cara do servidor. A busca foi reescrita em dois
// passos — índice primeiro, resolução depois — para não travar o processo numa
// palavra comum. Estes testes cuidam do que não pode mudar com a reescrita:
// acha o que existe, mostra o trecho com a marca, e NUNCA devolve obra que o
// direito não deixa ler aqui.
// ─────────────────────────────────────────────────────────────


const semearLivro = (obraId, { titulo, autor, corpo, estado = 'dominio_publico' }) => {
  banco.prepare('INSERT INTO obra (id, titulo, publicada) VALUES (?,?,1)').run(obraId, titulo)
  const pid = Number(banco.prepare('INSERT INTO pessoa (nome, nome_ordem) VALUES (?,?)').run(autor, autor).lastInsertRowid)
  banco.prepare("INSERT INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,'autor')").run(obraId, pid)
  const tid = Number(banco.prepare(
    "INSERT INTO texto (obra_id, idioma, fonte, normalizado, palavras) VALUES (?, 'pt', 'gutenberg', 1, 100)")
    .run(obraId).lastInsertRowid)
  banco.prepare('INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,1,?,?,100)')
    .run(tid, 'Capítulo I', corpo)
  banco.prepare("INSERT INTO direito (texto_id, jurisdicao, estado, motivo) VALUES (?, 'BR', ?, 'teste')")
    .run(tid, estado)
}

test('a busca acha o livro pelo texto e devolve o trecho marcado', () => {
  semearLivro(9101, {
    titulo: 'A Cidade e as Serras', autor: 'Eça de Queirós',
    corpo: '<p>Jacinto morava num palácio cheio de máquinas e de aparelhos elétricos.</p>',
  })
  semearLivro(9102, {
    titulo: 'Outro Livro', autor: 'Outro Autor',
    corpo: '<p>Nada a ver com o assunto procurado nesta frase.</p>',
  })
  reindexarCapitulos(banco)

  const buscar = criarBuscaNoTexto(banco)
  const r = buscar('palácio')
  assert.equal(r.achados.length, 1, 'só um livro tem "palácio"')
  assert.equal(r.achados[0].obra, 9101)
  assert.match(r.achados[0].trecho, /<mark>/, 'o trecho vem com o termo marcado')
})

test('a busca NÃO devolve obra que o direito não deixa ler', () => {
  semearLivro(9103, {
    titulo: 'Livro Protegido', autor: 'Autor Vivo',
    corpo: '<p>Uma palavra rara: berkelium, que só aparece aqui.</p>',
    estado: 'protegido',
  })
  reindexarCapitulos(banco)

  const buscar = criarBuscaNoTexto(banco)
  assert.equal(buscar('berkelium').achados.length, 0,
    'achar o trecho e não poder abrir o livro é pior que não achar')
})

test('a busca no trabalhador à parte acha o mesmo, e lembra a busca repetida', async () => {
  const { criarBuscaParalela } = await import('./busca-paralela.mjs')
  const buscar = criarBuscaParalela(banco, { caminho: join(pasta, 'teste.db') })
  const r = await buscar('palácio')
  assert.equal(r.achados.length, 1)
  assert.equal(r.achados[0].obra, 9101)
  // o resultado lembrado é cópia: quem chama pode mexer sem estragar o próximo
  r.achados.length = 0
  assert.equal((await buscar('PALÁCIO')).achados.length, 1)
  assert.deepEqual((await buscar('  ')).achados, [])
  await buscar.parar()
})

test('o freio separa dois endereços do mesmo pedaço de operadora', async () => {
  const { chaveDeIp } = await import('./seguranca.mjs')
  const a = chaveDeIp('177.12.34.56'), b = chaveDeIp('177.12.99.1')
  assert.notEqual(a, b, 'CGNAT: vizinhos de operadora não dividem o freio')
  assert.equal(a, chaveDeIp('177.12.34.56'))
  assert.match(a, /^177\.12\.x\.x#/, 'o começo legível continua para o painel')
  assert.ok(!a.includes('34.56'), 'o IP inteiro não aparece')
  assert.equal(chaveDeIp('::ffff:177.12.34.56'), a)
  assert.equal(chaveDeIp('2804:14c:1:2:aaaa::1'), chaveDeIp('2804:14c:1:2:bbbb::9'), 'IPv6: o /64 é um aparelho')
  assert.equal(chaveDeIp(null), 'sem-ip')
})

test('a consulta limpa os operadores do FTS antes de chegar ao índice', () => {
  // um usuário digitando dois-pontos ou aspa solta não pode produzir erro de
  // SQL nem consulta cara — vira termo literal
  assert.equal(comoConsulta('direito: propriedade'), '"direito" AND "propriedade"')
  assert.equal(comoConsulta('  '), null)
  assert.equal(comoConsulta('"uma frase inteira"'), '"uma frase inteira"')
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

// ─────────────────────────────────────────────────────────────
// O trilho C: o livro que é SEU
//
// A coluna `texto.dono_id` existe no esquema desde o primeiro dia, com índice
// e um comentário dizendo "toda consulta de leitura filtra por isto" — e
// nunca tinha sido preenchida por nada. Agora é, e o que estes testes cuidam
// não é de o livro abrir: é de ele NÃO abrir para mais ninguém.
// ─────────────────────────────────────────────────────────────

const epubDeTeste = async (titulo, corpoExtra = '') => {
  const { montarEpub } = await import('./epub.mjs')
  return montarEpub({
    id: 1, titulo, autor: 'Autor de Teste', direito: 'teste', fonteUrl: 'x',
    capitulos: [
      { ordem: 1, titulo: 'Um', corpo: `<p>${'Texto do primeiro capítulo, comprido o bastante. '.repeat(4)}${corpoExtra}</p>` },
      { ordem: 2, titulo: 'Dois', corpo: `<p>${'Texto do segundo capítulo, também comprido. '.repeat(4)}</p>` },
    ],
  })
}

test('o livro que eu mando é meu, e some da estante de todo mundo', async () => {
  const meusLivros = await import('./meus-livros.mjs')
  const eu = banco.prepare("SELECT id FROM leitor WHERE email = 'gabriel@exemplo.com'").get()

  const guardado = meusLivros.guardar(banco, eu.id, await epubDeTeste('Livro Particular'))
  assert.ok(guardado.obra)
  assert.equal(guardado.capitulos, 3)   // folha de rosto + dois capítulos

  // é meu
  assert.ok(meusLivros.eDoLeitor(banco, guardado.obra, eu.id))
  assert.ok(meusLivros.meus(banco, eu.id).some((l) => l.id === guardado.obra))

  // NÃO é publicado: é isto que o mantém fora do catálogo do site, que é
  // gerado com `WHERE publicada = 1`
  const o = banco.prepare('SELECT publicada, trilho FROM obra WHERE id = ?').get(guardado.obra)
  assert.equal(o.publicada, 0)
  assert.equal(o.trilho, 'C')

  // e o texto tem dono, que é o que toda consulta de leitura já filtrava
  const t = banco.prepare('SELECT dono_id, fonte FROM texto WHERE obra_id = ?').get(guardado.obra)
  assert.equal(t.dono_id, eu.id)
  assert.equal(t.fonte, 'leitor')
})

test('o livro de um não aparece nem abre para o outro', async () => {
  const meusLivros = await import('./meus-livros.mjs')
  const eu = banco.prepare("SELECT id FROM leitor WHERE email = 'gabriel@exemplo.com'").get()
  const guardado = meusLivros.guardar(banco, eu.id, await epubDeTeste('Só Meu'))

  zerarFreio()
  const outro = await criarConta({ nome: 'Outro', email: 'outro-leitor@exemplo.com', senha: BOA })

  assert.equal(meusLivros.eDoLeitor(banco, guardado.obra, outro.pessoa.id), false)
  assert.equal(meusLivros.meus(banco, outro.pessoa.id).length, 0)
  await assert.rejects(
    async () => meusLivros.apagar(banco, outro.pessoa.id, guardado.obra),
    /não é seu/,
  )
  // e continua de pé para o dono
  assert.ok(meusLivros.eDoLeitor(banco, guardado.obra, eu.id))
})

test('mandar o mesmo arquivo duas vezes não cria dois livros', async () => {
  const meusLivros = await import('./meus-livros.mjs')
  const eu = banco.prepare("SELECT id FROM leitor WHERE email = 'gabriel@exemplo.com'").get()
  const bytes = await epubDeTeste('Repetido')
  const um = meusLivros.guardar(banco, eu.id, bytes)
  const dois = meusLivros.guardar(banco, eu.id, bytes)
  assert.equal(dois.obra, um.obra)
  assert.equal(dois.repetido, true)
})

// O corpo do capítulo vai para `dangerouslySetInnerHTML`. Um EPUB baixado da
// internet é tão de fora quanto o Wikisource.
test('o EPUB do leitor passa pelo mesmo saneador da ingestão', async () => {
  const meusLivros = await import('./meus-livros.mjs')
  const eu = banco.prepare("SELECT id FROM leitor WHERE email = 'gabriel@exemplo.com'").get()
  // a aspa solta no `title` é o caso que a auditoria achou: ela desarmava o
  // saneador inteiro na versão antiga
  const veneno = `<img src=x onerror=alert(1) title=a'b><script>alert(2)</script>`
  const bytes = await epubDeTeste('Com Veneno', veneno)

  const guardado = meusLivros.guardar(banco, eu.id, bytes)
  const corpos = banco.prepare(
    'SELECT corpo FROM capitulo WHERE texto_id = (SELECT id FROM texto WHERE obra_id = ?)')
    .all(guardado.obra).map((c) => c.corpo).join(' ')
  assert.ok(!/onerror|<script|<img/i.test(corpos), `passou marcação viva: ${corpos.slice(0, 120)}`)
})

test('tirar o livro da estante leva o texto e os capítulos junto', async () => {
  const meusLivros = await import('./meus-livros.mjs')
  const eu = banco.prepare("SELECT id FROM leitor WHERE email = 'gabriel@exemplo.com'").get()
  const guardado = meusLivros.guardar(banco, eu.id, await epubDeTeste('Para Apagar'))

  meusLivros.apagar(banco, eu.id, guardado.obra)
  assert.equal(banco.prepare('SELECT 1 FROM obra WHERE id = ?').get(guardado.obra), undefined)
  assert.equal(banco.prepare('SELECT 1 FROM texto WHERE obra_id = ?').get(guardado.obra), undefined)
})

// ─────────────────────────────────────────────────────────────
// O nome de usuário, e o ataque que ele abre
//
// Entrar por e-mail tinha dois defeitos — o endereço é o mesmo em toda a
// internet, e obriga a ter um. Entrar por NOME resolve os dois e traz um
// risco novo: numa biblioteca de amigos, o nome é o rosto. Se alguém
// consegue criar algo que se LÊ como `gabriel`, essa pessoa assina resenha
// com a cara do dono da casa.
//
// Por isso a unicidade é sobre a CHAVE — o nome sem caixa, sem separador e
// sem acento — e não sobre as letras cruas. Estes testes são sobre isso.
// ─────────────────────────────────────────────────────────────

test('o nome de usuário tem regra, e a regra explica o porquê', async () => {
  const { conferirUsuario } = await import('./usuario.mjs')

  assert.equal(conferirUsuario('gabriel'), null)
  assert.equal(conferirUsuario('ga.bri_el-2'), null)
  assert.equal(conferirUsuario('Machado99'), null)

  assert.match(conferirUsuario('ab'), /3 letras/)
  assert.match(conferirUsuario('2gatos'), /começar com uma letra/)
  assert.match(conferirUsuario('gabriel.'), /não pode terminar/)
  assert.match(conferirUsuario('ga__briel'), /Não repita/)
  assert.match(conferirUsuario('admin'), /reservado/)
  assert.match(conferirUsuario('AdMiN'), /reservado/)     // a reserva é sobre a chave
  // um nome só de dígitos é barrado antes, por não começar com letra — e a
  // trava do "só números" continua valendo para `a12345` e semelhantes
  assert.match(conferirUsuario('12345'), /começar com uma letra/)
  // acento e alfabeto de fora ficam de fora: é o que impede o nome disfarçado
  assert.match(conferirUsuario('gabriél'), /sem acento/)
  assert.match(conferirUsuario('gаbriel'), /sem acento/)  // o "а" aqui é cirílico
})

test('dois nomes que se leem igual são o mesmo nome', async () => {
  const { chaveDe } = await import('./usuario.mjs')
  const mesmo = ['gabriel', 'Gabriel', 'GABRIEL', 'ga.briel', 'ga_briel', 'ga-briel', 'G.a.b.r.i.e.l']
  for (const n of mesmo) assert.equal(chaveDe(n), 'gabriel', `${n} devia dar a mesma chave`)
  assert.notEqual(chaveDe('gabriela'), chaveDe('gabriel'))
})

test('ninguém cria um nome que se lê como o de outro', async () => {
  zerarFreio()
  await criarConta({ usuario: 'joaquim', nome: 'Joaquim', email: 'joaquim@exemplo.com', senha: BOA })

  for (const disfarce of ['Joaquim', 'JOAQUIM', 'jo.aquim', 'jo_a_quim', 'j.o.a.q.u.i.m']) {
    zerarFreio()
    await assert.rejects(
      criarConta({ usuario: disfarce, nome: 'Impostor', email: `i${Math.random()}@y.com`, senha: BOA }),
      /já está em uso/,
      `${disfarce} não podia passar`,
    )
  }
})

test('entra pelo nome, e também pelo e-mail de quem tiver um', async () => {
  zerarFreio()
  await criarConta({ usuario: 'bentinho', nome: 'Bento', email: 'bento@exemplo.com', senha: BOA })

  for (const jeito of ['bentinho', 'Bentinho', 'ben.tinho', 'bento@exemplo.com']) {
    zerarFreio()
    const { pessoa } = await contas.entrar(banco, { usuario: jeito, senha: BOA })
    assert.equal(pessoa.usuario, 'bentinho', `devia entrar com ${jeito}`)
  }
})

// O e-mail deixou de ser obrigatório quando a recuperação virou pergunta:
// não há link para mandar nem aviso para enviar.
test('dá para ter conta sem e-mail nenhum', async () => {
  zerarFreio()
  const { pessoa } = await criarConta({ usuario: 'semzap', nome: 'Sem Zap', email: null, senha: BOA })
  assert.equal(pessoa.email, null)
  zerarFreio()
  const entrou = await contas.entrar(banco, { usuario: 'semzap', senha: BOA })
  assert.equal(entrou.pessoa.usuario, 'semzap')
})

// Ele pediu "senha forte ou fraca": o piso desceu para oito e a força passou
// a ser DITA. O que continua barrado é o que já é público por construção.
test('senha fraca entra, mas entra avisada', async () => {
  const { avaliarSenha } = await import('./seguranca.mjs')

  assert.equal(avaliarSenha('girassol').erro, null)
  assert.equal(avaliarSenha('girassol').forca, 'fraca')
  assert.equal(avaliarSenha('a casa de matacavalos').forca, 'forte')

  assert.match(avaliarSenha('curta').erro, /8 caracteres/)
  assert.match(avaliarSenha('12345678').erro, /Só números/)
  assert.match(avaliarSenha('aaaaaaaaaa').erro, /Poucos caracteres/)
  assert.match(avaliarSenha('senha123').erro, /mais usadas do mundo/)
  // a senha não pode ser o nome com que se entra
  assert.match(avaliarSenha('gabriel123', { usuario: 'gabriel' }).erro, /nome de usuário/)
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
    const erro = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: `chute ${i} errado` }).catch(e => e)
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
      usuario: `alvo${i}`, senha: BOA, respostas: [],
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
    await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: `engano ${i}` }, { ip: '198.51.100.9' }).catch(() => {})
  }
  const { pessoa } = await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' }, { ip: '198.51.100.9' })
  assert.equal(pessoa.email, 'gabriel@exemplo.com')
})

test('entrar certo limpa o contador de tentativas', async () => {
  zerarFreio()
  await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'errada de novo' }).catch(() => {})
  await contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' })
  const { n } = banco.prepare(
    `SELECT COUNT(*) n FROM tentativa WHERE chave = 'entrar:gabriel'`).get()
  assert.equal(n, 0)
})

test('conta desativada não entra', async () => {
  zerarFreio()
  banco.prepare('UPDATE leitor SET desativado = 1 WHERE email = ?').run('gabriel@exemplo.com')
  await assert.rejects(contas.entrar(banco, { usuario: 'gabriel@exemplo.com', senha: 'bentinho e o seminario' }))
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
  await assert.rejects(contas.entrar(banco, { usuario: 'bia@exemplo.com', senha: BOA }))
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
    /8 caracteres/,
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
  assert.ok(await contas.entrar(banco, { usuario: 'gil@exemplo.com', senha: NOVA }))
  zerarFreio()
  await assert.rejects(contas.entrar(banco, { usuario: 'gil@exemplo.com', senha: BOA }))
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
  const { motorDisponivel, porQueNaoRoda } = await import('./servicos/motor-traducao.mjs')
  const m = motorDisponivel()
  assert.ok(m, 'o motor tem que estar sempre disponível: não há chave para faltar')
  assert.equal(m.custo, 0)
  assert.equal(porQueNaoRoda(), null)
})

test('o glossário força o termo mesmo sem poder instruir o tradutor', async () => {
  const { aplicarGlossario } = await import('./servicos/motor-traducao.mjs')
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
  const { prepararUnidade } = await import('./servicos/motor-traducao.mjs')
  const { entrada, refazer } = prepararUnidade('## Contents')
  // "## Contents" era traduzido como "Contígo"; "Contents", como "Conteúdo"
  assert.equal(entrada, 'Contents')
  assert.equal(refazer('Conteúdo'), '## Conteúdo')
})

test('a caixa alta do cabeçalho vira caixa de título, poupando romano', async () => {
  const { prepararUnidade, emCaixaDeTitulo } = await import('./servicos/motor-traducao.mjs')
  assert.equal(
    prepararUnidade('## CHAPTER XIII. CONCERNING AUXILIARIES').entrada,
    'Chapter XIII. Concerning Auxiliaries')
  // XIII não pode virar "Xiii"
  assert.equal(emCaixaDeTitulo('BOOK IV. OF THE LAWS'), 'Book IV. Of The Laws')
})

test('texto corrido não é tocado pelo preparo', async () => {
  const { prepararUnidade } = await import('./servicos/motor-traducao.mjs')
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
  const { abrasileirar } = await import('./servicos/motor-traducao.mjs')
  assert.equal(abrasileirar('Ele estava a fazer o jantar'), 'Ele estava fazendo o jantar')
  assert.equal(abrasileirar('K. estava a ser julgado'), 'K. estava sendo julgado')
  assert.equal(abrasileirar('Eles continuavam a esperar'), 'Eles continuavam esperando')
})

test('"está a par" não vira "está pando"', async () => {
  const { abrasileirar } = await import('./servicos/motor-traducao.mjs')
  // "estar a" + substantivo é outra construção, e sem a lista de exceções
  // esta frase saía destruída
  assert.equal(abrasileirar('Ele está a par do assunto'), 'Ele está a par do assunto')
})

test('quando o gênero muda, o artigo vai junto', async () => {
  const { abrasileirar } = await import('./servicos/motor-traducao.mjs')
  // "casa de banho" é feminino e "banheiro" masculino: trocar só o
  // substantivo produzia "na banheiro", que é pior que o problema
  assert.equal(abrasileirar('Estava na casa de banho'), 'Estava no banheiro')
  assert.equal(abrasileirar('Pôs no frigorífico'), 'Pôs na geladeira')
})

test('o acento não faz o termo escapar', async () => {
  const { abrasileirar } = await import('./servicos/motor-traducao.mjs')
  // o \b do JavaScript é ASCII e não reconhece "ã" como letra: "no ecrã"
  // atravessava intacto enquanto "comboio" era trocado
  assert.equal(abrasileirar('A imagem no ecrã'), 'A imagem na tela')
  assert.equal(abrasileirar('Pegou o comboio'), 'Pegou o trem')
})

// ─────────────────────────────────────────────────────────────
// Gosto, recomendação e avisos (16/09/2026)
//
// O que importa provar: recomendar nunca devolve o que a pessoa já tem nas
// mãos, o que ela LÊ passa a mandar mais do que o que ela DISSE, o
// questionário só aceita escolha de lista, e o aviso de um leitor nunca vai
// parar na conta de outro.
// ─────────────────────────────────────────────────────────────

import * as gosto from './gosto.mjs'

// Um teste anterior fecha o banco compartilhado; estes reabrem o mesmo arquivo.
const bd = () => abrir(join(pasta, 'teste.db'))

const obraFalsa = (id, titulo, autorId, autor, temas, extra = {}) =>
  ({ id, titulo, autor, autorId, temas, trilho: 'A', minutos: 200, capa: null, capaOL: null, ...extra })

function catalogoFalso() {
  return {
    obras: [
      obraFalsa(1, 'Crime e Castigo', 10, 'Fiódor Dostoiévski', ['Romance', 'Psicologia']),
      obraFalsa(2, 'O Processo', 20, 'Franz Kafka', ['Romance']),
      obraFalsa(3, 'Os Irmãos Karamázov', 10, 'Fiódor Dostoiévski', ['Romance', 'Filosofia']),
      obraFalsa(4, 'Vinte Mil Léguas', 30, 'Júlio Verne', ['Aventura']),
      obraFalsa(5, 'Uma Princesa de Marte', 40, 'Edgar Rice Burroughs', ['Aventura']),
      obraFalsa(6, 'Livro de Receitas', 50, 'Alguém', ['Culinária']),
    ],
    colecoes: [
      { nome: 'O homem contra ele mesmo', obras: [1, 2, 3], nossa: true },
      { nome: 'Entrar em outro mundo', obras: [4, 5], nossa: true },
    ],
  }
}
const fichasFalsas = { 1: { conexoes: [{ id: 2 }], tags: ['culpa'] }, 2: { tags: ['culpa'] } }
const indiceFalso = () => gosto.montarIndice(catalogoFalso(), (id) => fichasFalsas[id] ?? null)
const sinaisVazios = (extra = {}) => ({ progresso: new Map(), estante: new Map(), notas: new Map(), respostas: {}, ...extra })

test('recomendação: quem leu Crime e Castigo recebe o que conversa com ele, e nunca o que já leu', () => {
  const agora = Date.now()
  const sinais = sinaisVazios({ progresso: new Map([[1, { capitulo: 3, segundos: 1800, mudouEm: agora }]]) })
  const r = gosto.recomendar(indiceFalso(), sinais, { agora })
  const ids = r.obras.map((o) => o.id)
  assert.ok(!ids.includes(1), 'devolveu o livro que a pessoa já está lendo')
  assert.ok(ids.includes(2) && ids.includes(3))
  assert.equal(r.obras[0].motivo, 'porque você leu Crime e Castigo')
  assert.ok(!ids.includes(6), 'recomendou o que não tem ligação nenhuma')
})

test('recomendação: o que a pessoa lê pesa mais do que o que ela disse no questionário', () => {
  const agora = Date.now()
  const disse = { humores: ['mundo'] }
  const soDisse = gosto.recomendar(indiceFalso(), sinaisVazios({ respostas: disse }), { agora })
  assert.ok([4, 5].includes(soDisse.obras[0].id), 'sem leitura, manda o humor escolhido')

  const leituras = new Map([1, 3].map((id) => [id, { segundos: 3600, mudouEm: agora }]))
  // cinco leituras de verdade de livros de fora do acervo falso ainda contam como leitura
  for (const id of [101, 102, 103, 104, 105]) leituras.set(id, { segundos: 3600, mudouEm: agora })
  const leu = gosto.recomendar(indiceFalso(), sinaisVazios({ respostas: disse, progresso: leituras }), { agora })
  assert.equal(leu.obras[0].id, 2, 'a leitura real não passou na frente do questionário')
  assert.equal(leu.resumo, 'pelo que você anda lendo')
})

test('recomendação: sem sinal nenhum, não inventa', () => {
  const r = gosto.recomendar(indiceFalso(), sinaisVazios())
  assert.equal(r.obras.length, 0)
  assert.equal(r.semSinais, true)
})

test('o questionário só aceita escolha das listas fechadas', () => {
  const r = gosto.limparRespostas({
    humores: ['pensar', '<img src=x onerror=alert(1)>', 'pensar'],
    autores: ['Kafka', 'Autor Inventado'],
    favoritos: [1096, 999999, '1097'],
    tempo: 'para sempre',
    evitar: ['Poesia', 'Tudo'],
  })
  assert.deepEqual(r, { humores: ['pensar'], autores: ['Kafka'], favoritos: [1096, 1097], tempo: 'tanto', evitar: ['Poesia'] })
})

function leitorDeTeste(usuario) {
  return Number(bd().prepare(`INSERT INTO leitor (usuario, usuario_chave, nome, senha_hash, senha_sal, senha_params)
    VALUES (?, ?, ?, x'00', x'00', '{}')`).run(usuario, usuario, usuario).lastInsertRowid)
}

test('conta nova recebe o questionário; conta antiga não é interrompida', () => {
  gosto.garantirTabelas(bd())
  const antiga = leitorDeTeste('antigaconta')
  const nova = leitorDeTeste('novaconta')
  gosto.marcarContaNova(bd(), nova)
  assert.equal(gosto.lerSinais(bd(), antiga).pedido, false)
  assert.equal(gosto.lerSinais(bd(), nova).pedido, true)
})

test('aviso de "já dá para ler" vai só para quem tinha o livro na lista, e uma vez só', () => {
  gosto.garantirTabelas(bd())
  const ana = leitorDeTeste('anaaviso'), beto = leitorDeTeste('betoaviso')
  const obra = Number(bd().prepare(`INSERT INTO obra (titulo, trilho, publicada) VALUES ('Livro Que Chegou', 'A', 1)`).run().lastInsertRowid)
  const agora = Date.now()
  bd().prepare(`INSERT INTO guardado (leitor_id, tipo, chave, valor, mudou_em) VALUES (?, 'estante', ?, '"quero_ler"', ?)`)
    .run(ana, String(obra), agora - 10 * 86400000)
  bd().prepare(`INSERT INTO texto (obra_id, idioma, fonte, normalizado, criado_em) VALUES (?, 'pt', 'fio_traducao', 1, datetime('now'))`).run(obra)

  const indice = gosto.montarIndice({ obras: [obraFalsa(obra, 'Livro Que Chegou', 1, 'X', [])], colecoes: [] })
  gosto.gerarAvisos(bd(), ana, indice, { agora })
  gosto.gerarAvisos(bd(), beto, indice, { agora })
  gosto.gerarAvisos(bd(), ana, indice, { agora: agora + 10 * 60000 }) // passou o intervalo: gera de novo

  const deAna = bd().prepare(`SELECT chave FROM aviso WHERE leitor_id = ? AND tipo = 'pronto'`).all(ana)
  const deBeto = bd().prepare(`SELECT chave FROM aviso WHERE leitor_id = ?`).all(beto)
  assert.equal(deAna.length, 1, 'duplicou ou não avisou')
  assert.equal(deBeto.length, 0, 'aviso de uma conta foi parar em outra')
})

// ─────────────────────────────────────────────────────────────
// Catálogo de mangás (16/09/2026): o que o leitor manda nunca entra cru na
// consulta ao AniList, e o proxy de capa não vira porta para buscar qualquer
// endereço. Sem rede: só as funções puras.
// ─────────────────────────────────────────────────────────────

import * as mangas from './mangas.mjs'

test('mangás: filtro hostil vira padrão seguro, e texto de busca é saneado', () => {
  const f = mangas.filtros(new URLSearchParams('tipo=DROP&genero=Hentai&ordem=x&status=y&cor=z&pagina=-5&q=<img src=x onerror=1>'))
  assert.deepEqual(f.variaveis.country, null)
  assert.equal(f.variaveis.genre, null, 'gênero fora da lista entrou')
  assert.deepEqual(f.variaveis.sort, ['SEARCH_MATCH', 'POPULARITY_DESC'])
  assert.equal(f.pagina, 1)
  assert.ok(!/[<>=]/.test(f.variaveis.search), 'busca manteve caractere de marcação')
})

test('mangás: o proxy de capa só aceita o caminho de capa do CDN do AniList', () => {
  assert.equal(mangas.capaLocal('https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx1-abc.jpg'), '/api/capa-manga/large/bx1-abc.jpg')
  for (const ruim of ['https://evil.example/x.jpg', 'http://s4.anilist.co/file/anilistcdn/media/manga/cover/large/a.jpg',
    'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/../../etc.jpg', 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/a.jpg']) {
    assert.equal(mangas.capaLocal(ruim), null, ruim)
  }
})

test('mangás: tipo, cor, sentido e "oficial em português" saem certos da ficha', () => {
  const m = mangas.mapear({
    id: 1, title: { english: 'Dandadan' }, format: 'MANGA', countryOfOrigin: 'JP', status: 'RELEASING',
    genres: ['Action', 'Hentai'], tags: [{ name: 'Full Color', rank: 90 }],
    externalLinks: [
      { site: 'Twitter', url: 'https://x.com/a', language: 'Japanese' },
      { site: 'MANGA Plus', url: 'https://mangaplus.shueisha.co.jp/titles/1', language: 'Portuguese' },
      { site: 'Falso', url: 'javascript:alert(1)', language: 'Portuguese' },
    ],
  })
  assert.equal(m.tipo, 'mangá'); assert.equal(m.sentido, 'rtl'); assert.equal(m.colorido, true)
  assert.deepEqual(m.generos, ['Ação'], 'gênero adulto ou sem tradução apareceu')
  assert.equal(m.emPortugues, true)
  assert.deepEqual(m.ondeLer.map((l) => l.site), ['MANGA Plus'], 'rede social ou link não-https entrou')
})

// ─────────────────────────────────────────────────────────────
// Assinaturas e publicações (17/09/2026). O que se testa é o que NÃO pode
// passar: imagem com coisa escondida, quem não tem plano publicando, obra em
// revisão aparecendo para estranho, página de outra obra entrando num capítulo.
// ─────────────────────────────────────────────────────────────

import { deflateSync, crc32 as crc } from 'node:zlib'
import { limparImagem, ImagemRecusada } from './imagem.mjs'
import * as planos from './planos.mjs'
import { chaveDe } from './usuario.mjs'

function pngDeTeste(w, h, { extra = [], cauda = null } = {}) {
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'latin1'), tam = Buffer.alloc(4), c = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])))
    return Buffer.concat([tam, t, dados, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const cru = Buffer.alloc(Math.min(h, 2000) * (1 + 3 * Math.min(w, 2000)))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr),
    ...extra.map(([t, d]) => bloco(t, Buffer.from(d))), bloco('IDAT', deflateSync(cru)), bloco('IEND', Buffer.alloc(0)),
    ...(cauda ? [Buffer.from(cauda)] : [])])
}

function jpegDeTeste(w, h) {
  const seg = (m, dados) => { const t = Buffer.alloc(4); t[0] = 0xff; t[1] = m; t.writeUInt16BE(dados.length + 2, 2); return Buffer.concat([t, Buffer.from(dados)]) }
  const sof = Buffer.alloc(9); sof[0] = 8; sof.writeUInt16BE(h, 1); sof.writeUInt16BE(w, 3); sof[5] = 1; sof[6] = 1; sof[7] = 0x11; sof[8] = 0
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPS-LATITUDE-23.5', 'latin1')), seg(0xfe, Buffer.from('<script>alert(1)</script>')),
    seg(0xdb, Buffer.alloc(65)), seg(0xc0, sof), seg(0xc4, Buffer.alloc(29)), seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]), Buffer.from([0xff, 0xd9]), Buffer.from('PK\x03\x04<html>esconderijo</html>', 'latin1')])
}

test('imagem: PNG perde texto escondido e o que vem depois do fim', () => {
  const r = limparImagem(pngDeTeste(40, 60, { extra: [['tEXt', 'Comment\0<script>x</script>']], cauda: '<html><script>alert(1)</script>' }))
  assert.equal(r.mime, 'image/png'); assert.equal(r.largura, 40); assert.equal(r.altura, 60)
  const s = r.bytes.toString('latin1')
  assert.ok(!s.includes('script') && !s.includes('tEXt'), 'sobrou texto ou cauda no PNG')
  assert.equal(s.slice(-8, -4), 'IEND', 'PNG não termina no IEND')
})

test('imagem: JPEG perde EXIF (GPS), comentário e o ZIP colado atrás', () => {
  const r = limparImagem(jpegDeTeste(320, 480))
  assert.equal(r.mime, 'image/jpeg'); assert.equal(r.largura, 320); assert.equal(r.altura, 480)
  const s = r.bytes.toString('latin1')
  assert.ok(!s.includes('Exif') && !s.includes('GPS') && !s.includes('script') && !s.includes('PK'), 'metadado ou cauda sobreviveu')
  assert.equal(r.bytes.at(-1), 0xd9)
})

test('imagem: WebP estático passa; SVG, GIF, HTML e PNG adulterado não', () => {
  const webp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')
  assert.equal(limparImagem(webp).largura, 1)
  const ruins = [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'),
    Buffer.from('<!doctype html><script>alert(1)</script>'),
  ]
  const adulterado = pngDeTeste(10, 10); adulterado[adulterado.length - 20] ^= 0xff
  ruins.push(adulterado, pngDeTeste(20000, 10), Buffer.alloc(0))
  for (const b of ruins) assert.throws(() => limparImagem(b), ImagemRecusada)
})

test('planos: admin é Tear; cortesia vale até vencer; admin não recebe linha', () => {
  const b = bd(); planos.garantirTabelas(b)
  const adm = leitorDeTeste('admplano'); b.prepare("UPDATE leitor SET papel = 'admin' WHERE id = ?").run(adm)
  const zeca = leitorDeTeste('zecaplano')
  const p = (id) => b.prepare('SELECT id, usuario, papel FROM leitor WHERE id = ?').get(id)
  const ctx = { chaveDe, Recusa: contas.Recusa }
  assert.equal(planos.planoDe(b, p(adm)).chave, 'tear')
  assert.equal(planos.planoDe(b, p(zeca)).chave, 'leitor')
  planos.conceder(b, adm, { usuario: 'ZecaPlano', plano: 'trama' }, ctx)
  assert.equal(planos.planoDe(b, p(zeca)).chave, 'trama')
  b.prepare("UPDATE assinatura SET ate = datetime('now', '-1 day') WHERE leitor_id = ?").run(zeca)
  assert.equal(planos.planoDe(b, p(zeca)).chave, 'leitor', 'cortesia vencida continuou valendo')
  assert.throws(() => planos.conceder(b, adm, { usuario: 'admplano', plano: 'novelo' }, ctx), contas.Recusa)
  assert.throws(() => planos.conceder(b, adm, { usuario: 'zecaplano', plano: 'ouro' }, ctx), contas.Recusa)
  assert.equal(planos.vitrine(b, null).disponivel, false, 'assinatura apareceu como disponível')
})

test('publicações: sem plano não publica; com Trama publica só depois da revisão, e dentro do limite', async () => {
  process.env.FIO_PUBLICACOES = join(pasta, 'publicacoes')
  const pub = await import('./publicacoes.mjs')
  const b = bd(); planos.garantirTabelas(b); pub.garantirTabelas(b); gosto.garantirTabelas(b)
  const p = (id) => b.prepare('SELECT id, usuario, papel FROM leitor WHERE id = ?').get(id)
  const ctx = { chaveDe, Recusa: contas.Recusa }
  const adm = leitorDeTeste('admpub'); b.prepare("UPDATE leitor SET papel = 'admin' WHERE id = ?").run(adm)
  const semPlano = leitorDeTeste('semplanopub'), autora = leitorDeTeste('autorapub'), leitora = leitorDeTeste('leitorapub')
  const obra = { tipo: 'livro', titulo: 'A Torre de Sal', formato: 'romance', generos: ['fantasia', 'progressao'],
    classificacao: '14', sinopse: 'Uma menina sobe andar por andar de uma torre que muda.', autoria: true }

  assert.throws(() => pub.salvarObra(b, p(semPlano), obra), (e) => e.status === 403)
  planos.conceder(b, adm, { usuario: 'autorapub', plano: 'trama' }, ctx)
  assert.throws(() => pub.salvarObra(b, p(autora), { ...obra, autoria: false }), contas.Recusa, 'publicou sem declarar autoria')
  assert.throws(() => pub.salvarObra(b, p(autora), { ...obra, generos: ['hentai'] }), contas.Recusa, 'gênero fora da lista')

  const { id } = pub.salvarObra(b, p(autora), obra)
  pub.salvarParte(b, p(autora), { publicacao: id, titulo: 'Primeiro andar', texto: 'Era uma vez uma torre. '.repeat(20) })
  assert.throws(() => pub.enviar(b, p(autora), { id }), /capa/)
  assert.throws(() => pub.receberImagem(b, p(autora), { id, uso: 'capa' }, pngDeTeste(600, 300)), /em pé/)
  const capa = pub.receberImagem(b, p(autora), { id, uso: 'capa' }, pngDeTeste(400, 600))
  assert.equal(pub.enviar(b, p(autora), { id }).estado, 'revisao')

  const busca = (q) => new URLSearchParams(q)
  assert.equal(pub.listar(b, null, busca('')).obras.length, 0, 'obra em revisão apareceu na vitrine')
  assert.throws(() => pub.ficha(b, p(leitora), id), (e) => e.status === 404)
  const nomeCapa = capa.arquivo.split('.')[0]
  assert.equal(pub.podeVerArquivo(b, null, nomeCapa), null, 'capa em revisão servida a estranho')
  assert.ok(pub.podeVerArquivo(b, p(autora), nomeCapa), 'autora não vê a própria capa')

  pub.decidir(b, p(adm), { alvo: 'obra', id, acao: 'aprovar' })
  assert.equal(pub.listar(b, null, busca('genero=fantasia')).obras.length, 1)
  assert.equal(pub.listar(b, null, busca('genero=terror')).obras.length, 0, 'filtro de gênero não filtrou')
  assert.equal(pub.listar(b, null, busca('tipo=quadrinho')).obras.length, 0, 'filtro de tipo não filtrou')
  assert.equal(pub.listar(b, null, busca('classificacao=12')).obras.length, 0, 'classificação 14 passou no filtro até 12')
  assert.ok(pub.podeVerArquivo(b, null, nomeCapa)?.publico)
  assert.match(pub.lerParte(b, null, id, 1).texto, /torre/)

  // capítulo novo em obra publicada: fica escondido até a revisão
  pub.salvarParte(b, p(autora), { publicacao: id, titulo: 'Segundo andar', texto: 'O segundo andar tinha água. '.repeat(10) })
  pub.enviar(b, p(autora), { id })
  assert.throws(() => pub.lerParte(b, null, id, 2), (e) => e.status === 404)

  // limite do plano Trama: 3 obras
  pub.salvarObra(b, p(autora), obra); pub.salvarObra(b, p(autora), obra)
  assert.throws(() => pub.salvarObra(b, p(autora), obra), (e) => e.status === 403, 'passou do limite de obras')
})

test('publicações: página de outra obra não entra; três denúncias suspendem', async () => {
  const pub = await import('./publicacoes.mjs')
  const b = bd()
  const p = (id) => b.prepare('SELECT id, usuario, papel FROM leitor WHERE id = ?').get(id)
  const ctx = { chaveDe, Recusa: contas.Recusa }
  const adm = b.prepare("SELECT id FROM leitor WHERE usuario = 'admpub'").get().id
  const a1 = leitorDeTeste('quadrinista1'), a2 = leitorDeTeste('quadrinista2')
  for (const u of ['quadrinista1', 'quadrinista2']) planos.conceder(b, adm, { usuario: u, plano: 'tear' }, ctx)
  const base = { tipo: 'quadrinho', formato: 'manga', generos: ['acao'], classificacao: 'livre', cor: 'pb', sentido: 'rtl',
    sinopse: 'Um lutador que não sabe perder aprende a cair.', autoria: true }
  const o1 = pub.salvarObra(b, p(a1), { ...base, titulo: 'Queda' }).id
  const o2 = pub.salvarObra(b, p(a2), { ...base, titulo: 'Outra' }).id
  const alheia = pub.receberImagem(b, p(a2), { id: o2, uso: 'pagina' }, pngDeTeste(80, 120)).arquivo
  assert.throws(() => pub.receberImagem(b, p(a1), { id: o2, uso: 'pagina' }, pngDeTeste(80, 120)), (e) => e.status === 404, 'subiu imagem na obra alheia')
  assert.throws(() => pub.salvarParte(b, p(a1), { publicacao: o1, titulo: 'Cap 1', paginas: [alheia] }), /não pertence/)
  assert.throws(() => pub.salvarParte(b, p(a1), { publicacao: o1, titulo: 'Cap 1', paginas: ['../../etc/passwd'] }), /não pertence/)
  const minha = pub.receberImagem(b, p(a1), { id: o1, uso: 'pagina' }, pngDeTeste(80, 120)).arquivo
  pub.salvarParte(b, p(a1), { publicacao: o1, titulo: 'Cap 1', paginas: [minha] })
  pub.receberImagem(b, p(a1), { id: o1, uso: 'capa' }, pngDeTeste(400, 600))
  pub.enviar(b, p(a1), { id: o1 }); pub.decidir(b, p(adm), { alvo: 'obra', id: o1, acao: 'aprovar' })
  assert.equal(pub.lerParte(b, null, o1, 1).paginas.length, 1)

  // 17/09: denúncia vai para a revisão, nunca tira do ar sozinha
  for (const u of ['den1', 'den2', 'den3']) pub.denunciar(b, p(leitorDeTeste(u)), { id: o1, motivo: 'direitos' })
  assert.equal(b.prepare('SELECT estado FROM publicacao WHERE id = ?').get(o1).estado, 'publicada', 'denúncia tirou a obra do ar sozinha')
  assert.equal(pub.filaDeRevisao(b).denuncias.filter((d) => d.publicacao_id === o1).length, 3)

  // edição de capítulo publicado: a versão antiga fica no ar até aprovar
  const nova = pub.receberImagem(b, p(a1), { id: o1, uso: 'pagina' }, pngDeTeste(80, 120)).arquivo
  const idParte = b.prepare('SELECT id FROM publicacao_parte WHERE publicacao_id = ?').get(o1).id
  assert.equal(pub.salvarParte(b, p(a1), { publicacao: o1, id: idParte, titulo: 'Cap 1 (nova)', paginas: [nova] }).pendente, true)
  pub.enviar(b, p(a1), { id: o1 })
  assert.equal(pub.lerParte(b, null, o1, 1).parte.titulo, 'Cap 1', 'edição pendente apareceu para o leitor')
  assert.ok(pub.podeVerArquivo(b, null, minha.split('.')[0]), 'página antiga saiu do ar durante a revisão')
  assert.equal(pub.podeVerArquivo(b, null, nova.split('.')[0]), null, 'página da edição pendente ficou pública')
  pub.decidir(b, p(adm), { alvo: 'parte', id: idParte, acao: 'aprovar' })
  assert.equal(pub.lerParte(b, null, o1, 1).parte.titulo, 'Cap 1 (nova)')
  assert.equal(pub.podeVerArquivo(b, null, minha.split('.')[0]), null, 'página que saiu do capítulo continuou servida')

  pub.apagarObra(b, p(a1), o1)
  assert.equal(b.prepare('SELECT COUNT(*) n FROM publicacao_arquivo WHERE publicacao_id = ?').get(o1).n, 0, 'arquivos ficaram para trás')
})

// ─────────────────────────────────────────────────────────────
// Limite do plano grátis, amostra, pulso da esteira e correções (17/09)
// ─────────────────────────────────────────────────────────────

test('acesso: sem conta é amostra; grátis abre 3 livros por mês e livro aberto não fecha; lei não conta; plano pago não tem limite', async () => {
  const acesso = await import('./acesso.mjs')
  const b = bd(); planos.garantirTabelas(b); acesso.garantirTabelas(b)
  const p = (id) => b.prepare('SELECT id, usuario, papel FROM leitor WHERE id = ?').get(id)
  const gratis = leitorDeTeste('gratislimite'), pago = leitorDeTeste('pagolimite')
  const adm = b.prepare("SELECT id FROM leitor WHERE usuario = 'admplano'").get().id
  planos.conceder(b, adm, { usuario: 'pagolimite', plano: 'novelo' }, { chaveDe, Recusa: contas.Recusa })

  assert.equal(acesso.decidir(b, null, 1).motivo, 'conta')
  for (const obra of [101, 102, 103]) assert.equal(acesso.decidir(b, p(gratis), obra).pode, true)
  const quarta = acesso.decidir(b, p(gratis), 104)
  assert.equal(quarta.pode, false); assert.equal(quarta.motivo, 'limite'); assert.ok(quarta.renovaEm)
  assert.equal(acesso.decidir(b, p(gratis), 102).pode, true, 'livro já aberto fechou')
  assert.equal(acesso.decidir(b, p(gratis), 999, { ehLei: true }).pode, true, 'lei contou no limite')
  b.prepare("UPDATE livro_liberado SET liberado_em = datetime('now', '-31 days') WHERE leitor_id = ? AND obra_id = 101").run(gratis)
  assert.equal(acesso.decidir(b, p(gratis), 104).pode, true, 'o limite não renovou depois de 30 dias')
  for (let obra = 200; obra < 230; obra++) assert.equal(acesso.decidir(b, p(pago), obra).pode, true)
  assert.match(acesso.capituloDoMuro(quarta).corpo, /planos/)
})

test('esteira: o pulso guarda só os campos conhecidos, com tamanho limitado', async () => {
  const esteira = await import('./esteira.mjs')
  const b = bd(); esteira.garantirTabelas(b)
  esteira.guardarPulso(b, { estado: '<script>', atual: { titulo: 'x'.repeat(999), feitas: 10, total: 40 }, log: Array(50).fill('linha'), extra: 'não entra' })
  const e = esteira.estado(b)
  assert.equal(e.pulso.estado, 'traduzindo'); assert.equal(e.pulso.atual.titulo.length, 160); assert.equal(e.pulso.log.length, 12)
  assert.equal(e.pulso.extra, undefined); assert.equal(e.viva, true)
  assert.equal(esteira.chaveConfere, undefined, 'a rota do pulso por HTTP saiu em 19/09; a chave não pode voltar sozinha')
})

test('esteira: livro só entra se TODOS os autores e tradutores morreram a tempo', async () => {
  const { avaliar } = await import('./esteira.mjs')
  const base = { id: 1, title: 'X', languages: ['en'], livreEUA: true }
  const a = (name, death_year) => ({ name, death_year })
  assert.equal(avaliar({ ...base, authors: [a('Lait, Jack', 1954)] }).pode, true)
  const dois = avaliar({ ...base, authors: [a('Lait, Jack', 1954), a('Mortimer, Lee', 1963)] })
  assert.equal(dois.pode, false); assert.equal(dois.morte, 1963); assert.equal(dois.autor, 'Jack Lait e Lee Mortimer')
  assert.equal(avaliar({ ...base, authors: [a('A, B', 1900), a('C, D', null)] }).pode, false, 'coautor sem data não entra')
  const trad = avaliar({ ...base, authors: [a('Dostoyevsky, Fyodor', 1881)], translators: [a('Novo, Tradutor', 1990)] })
  assert.equal(trad.pode, false); assert.match(trad.problema, /Tradutor Novo, que morreu em 1990/)
  assert.equal(avaliar({ ...base, authors: [a('Dostoyevsky, Fyodor', 1881)], translators: [a('Garnett, Constance', 1946)] }).pode, true)
  assert.equal(avaliar({ ...base, authors: [a('X, Y', 1881)], translators: [a('Sem, Data', null)] }).pode, false)
})

test('correções: acha o trecho através da marcação, aplica só se for único, e credita quem sugeriu', async () => {
  const cor = await import('./correcoes.mjs')
  const b = bd(); cor.garantirTabelas(b); gosto.garantirTabelas(b)
  const obra = Number(b.prepare("INSERT INTO obra (titulo, trilho, publicada) VALUES ('Livro Traduzido', 'A', 1)").run().lastInsertRowid)
  const texto = Number(b.prepare("INSERT INTO texto (obra_id, idioma, fonte, normalizado, revisao) VALUES (?, 'pt', 'fio_traducao', 1, 'automatica')").run(obra).lastInsertRowid)
  b.prepare('INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?, 1, NULL, ?, 20)')
    .run(texto, '<p>O homem <em>saiu</em> da menoridade da qual ele próprio é culpado.</p><p>Repetido aqui. Repetido aqui.</p>')
  const leitora = leitorDeTeste('revisora1')
  const adm = { id: b.prepare("SELECT id FROM leitor WHERE usuario = 'admplano'").get().id, papel: 'admin' }
  const p = { id: leitora, usuario: 'revisora1' }

  assert.throws(() => cor.sugerir(b, p, { obra, capitulo: 1, trecho: 'não existe isso', proposta: 'x' }), /Não achei/)
  assert.equal(cor.sugerir(b, p, { obra, capitulo: 99, trecho: 'próprio é', proposta: 'mesmo é' }).ok, true, 'não achou o trecho em outro capítulo')
  cor.decidir(b, { id: 0 }, { id: cor.fila(b).pendentes.at(-1).id, acao: 'recusar' })
  cor.sugerir(b, p, { obra, capitulo: 1, trecho: 'O homem saiu da menoridade', proposta: 'O ser humano saiu da menoridade' })
  cor.sugerir(b, p, { obra, capitulo: 1, trecho: 'Repetido aqui.', proposta: 'Uma vez só.' })
  const [c1, c2] = cor.fila(b).pendentes
  assert.equal(c1.achados, 1); assert.equal(c2.achados, 2)
  cor.decidir(b, adm, { id: c1.id, acao: 'aceitar' })
  assert.throws(() => cor.decidir(b, adm, { id: c2.id, acao: 'aceitar' }), (e) => e.status === 409, 'aplicou em trecho ambíguo')
  const corpo = b.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?').get(texto).corpo
  assert.match(corpo, /<p>O ser humano saiu da menoridade da qual/)
  const r = cor.resumo(b, obra)
  assert.equal(r.aceitas, 1); assert.deepEqual(r.revisores.map((x) => x.usuario), ['revisora1'])
  cor.sugerir(b, p, { obra, capitulo: 1, trecho: 'culpado', proposta: '<img src=x onerror=alert(1)>' })
  cor.decidir(b, adm, { id: cor.fila(b).pendentes.find((x) => x.trecho === 'culpado').id, acao: 'aceitar' })
  assert.ok(!/<img/.test(b.prepare('SELECT corpo FROM capitulo WHERE texto_id = ?').get(texto).corpo), 'correção entrou como HTML')
  cor.marcarRevisado(b, adm, { obra })
  assert.equal(b.prepare('SELECT revisao FROM texto WHERE id = ?').get(texto).revisao, 'humana')
  assert.equal(cor.resumo(b, obra).revisao, 'comunitaria')
})

// ─────────────────────────────────────────────────────────────
// Curadoria, controle de fluxo, meta, quadrinhos na conta, seguir (17/09, noite)
// ─────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from 'node:fs'
import { fluxoPassa } from './seguranca.mjs'

function siteDeTeste() {
  const site = join(pasta, 'site')
  mkdirSync(join(site, 'dados', 'fichas'), { recursive: true })
  writeFileSync(join(site, 'dados', 'catalogo.json'), JSON.stringify({
    obras: [{ id: 1, titulo: 'Livro Um', autor: 'A', temas: ['Contos'], capa: null }, { id: 2, titulo: 'Livro Dois', autor: 'B', temas: [], capa: null }],
    temas: [{ nome: 'Contos' }, { nome: 'Filosofia' }], autores: [], colecoes: [{ nome: 'C', obras: [1, 2] }],
  }))
  writeFileSync(join(site, 'dados', 'fichas', '1.json'), JSON.stringify({ id: 1, titulo: 'Livro Um', autor: 'A', temas: ['Contos'], porque: 'original', capitulos: [] }))
  writeFileSync(join(site, 'dados', 'fichas', '2.json'), JSON.stringify({ id: 2, titulo: 'Livro Dois', autor: 'B', temas: [], capitulos: [] }))
  writeFileSync(join(site, 'dados', 'quadrinhos.json'), JSON.stringify({ series: [
    { id: 'serie-a', titulo: 'A', capa: '/quadrinhos/serie-a/01/000.jpg', capitulos: [{ n: 1, paginas: ['/quadrinhos/serie-a/01/000.jpg', '/quadrinhos/serie-a/01/001.jpg'] }] },
    { id: 'serie-b', titulo: 'B', capa: '/quadrinhos/serie-b/01/000.jpg', capitulos: [{ n: 1, paginas: ['/quadrinhos/serie-b/01/000.jpg'] }] }] }))
  return site
}

function respostaFalsa() {
  const r = { status: 0, cabecalhos: {}, corpo: '' }
  return Object.assign(r, { writeHead(s, h) { r.status = s; Object.assign(r.cabecalhos, h ?? {}) }, end(c) { r.corpo = c ? String(c) : '' } })
}

test('curadoria: edição vale por cima do catálogo; obra oculta some do catálogo, da ficha e das coleções; capa de série só de página da série', async () => {
  process.env.FIO_CURADORIA = join(pasta, 'curadoria')
  const cur = await import('./curadoria.mjs')
  const b = bd(); cur.garantirTabelas(b)
  const site = siteDeTeste()
  const adm = { id: 1, papel: 'admin' }
  const pedido = (caminho) => { const res = respostaFalsa(); cur.servirCatalogo(b, site, { headers: {}, method: 'GET' }, res, caminho); return res }

  cur.salvarObra(b, adm, site, { id: 1, titulo: 'Título Corrigido', porque: '<b>novo</b> texto', temas: ['Filosofia', 'Inventado'] })
  let cat = JSON.parse(pedido('/dados/catalogo.json').corpo)
  assert.equal(cat.obras.find((o) => o.id === 1).titulo, 'Título Corrigido')
  assert.deepEqual(cat.obras.find((o) => o.id === 1).temas, ['Filosofia'], 'tema fora da lista entrou')
  const ficha = JSON.parse(pedido('/dados/fichas/1.json').corpo)
  assert.equal(ficha.porque, '<b>novo</b> texto', 'o texto vai como texto; quem escapa é a tela')

  cur.salvarObra(b, adm, site, { id: 2, oculta: true })
  cat = JSON.parse(pedido('/dados/catalogo.json').corpo)
  assert.equal(cat.obras.some((o) => o.id === 2), false, 'obra oculta ficou no catálogo')
  assert.deepEqual(cat.colecoes[0].obras, [1], 'obra oculta ficou na coleção')
  assert.equal(pedido('/dados/fichas/2.json').status, 404)
  assert.equal(cur.obraOculta(b, 2), true)

  cur.salvarObra(b, adm, site, { id: 1, titulo: '' })
  assert.equal(JSON.parse(pedido('/dados/catalogo.json').corpo).obras.find((o) => o.id === 1).titulo, 'Livro Um', 'campo vazio não voltou ao original')

  assert.throws(() => cur.salvarSerie(b, adm, site, { id: 'serie-a', capa: '/etc/passwd' }), /página da própria série/)
  cur.salvarSerie(b, adm, site, { id: 'serie-b', destaque: true, capa: '/quadrinhos/serie-b/01/000.jpg' })
  cur.salvarSerie(b, adm, site, { id: 'serie-a', oculta: true })
  const q = JSON.parse(pedido('/dados/quadrinhos.json').corpo)
  assert.deepEqual(q.series.map((s) => s.id), ['serie-b'])
  assert.throws(() => cur.salvarObra(b, adm, site, { id: 999 }), (e) => e.status === 404)
})

test('controle de fluxo: passa até o teto por IP, e um IP não gasta o do outro', () => {
  const ip = `teste-${Date.now()}`
  let passou = 0
  for (let i = 0; i < 320; i++) if (fluxoPassa(ip, 'api').passa) passou++
  assert.equal(passou, 300)
  const barrado = fluxoPassa(ip, 'api')
  assert.equal(barrado.passa, false); assert.ok(barrado.esperar > 0)
  assert.equal(fluxoPassa(`${ip}-outro`, 'api').passa, true, 'um IP gastou o teto do outro')
})

test('meta, quadrinhos na conta e seguir obra: o mais novo vence, lixo não entra, aviso chega a quem segue', async () => {
  const ext = await import('./extras.mjs')
  const pub = await import('./publicacoes.mjs')
  const b = bd(); ext.garantirTabelas(b)
  const leitora = leitorDeTeste('extrasleitora')
  const p = { id: leitora, usuario: 'extrasleitora', papel: 'leitor' }

  const ano = new Date().getUTCFullYear()
  b.prepare(`INSERT INTO guardado (leitor_id, tipo, chave, valor, mudou_em) VALUES (?, 'estante', '10', '"lido"', ?), (?, 'estante', '11', '"lendo"', ?)`)
    .run(leitora, Date.UTC(ano, 2, 5), leitora, Date.now())
  assert.throws(() => ext.definirMeta(b, p, { livros: 0 }), /meta entre/)
  const m = ext.definirMeta(b, p, { livros: 12 })
  assert.equal(m.meta, 12); assert.equal(m.lidos.length, 1); assert.equal(m.porMes[2], 1); assert.equal(m.lendo, 1)

  ext.guardarProgressoQuadrinho(b, p, { itens: [{ serie: 'little-nemo', cap: 2, pag: 5, lidos: [1], em: 2000 }] })
  ext.guardarProgressoQuadrinho(b, p, { itens: [{ serie: 'little-nemo', cap: 1, pag: 0, lidos: [], em: 1000 }, { serie: '../../x', cap: 1, pag: 0, em: 3000 }] })
  const prog = ext.progressoQuadrinhos(b, p).series
  assert.equal(prog.length, 1, 'série com nome inválido entrou')
  assert.equal(prog[0].cap, 2, 'progresso velho passou por cima do novo')

  // seguir: obra publicada de outra autora; capítulo aprovado avisa quem segue
  const b2 = bd()
  const adm = b2.prepare("SELECT id FROM leitor WHERE usuario = 'admpub'").get().id
  const autora = leitorDeTeste('autoraseguida')
  planos.conceder(b2, adm, { usuario: 'autoraseguida', plano: 'trama' }, { chaveDe, Recusa: contas.Recusa })
  const pa = { id: autora, usuario: 'autoraseguida', papel: 'leitor' }
  const obra = pub.salvarObra(b2, pa, { tipo: 'livro', titulo: 'Seguida', formato: 'romance', generos: ['drama'], classificacao: 'livre', sinopse: 'Uma obra para seguir de perto.', autoria: true }).id
  pub.salvarParte(b2, pa, { publicacao: obra, titulo: 'Um', texto: 'Primeiro capítulo com texto suficiente. '.repeat(3) })
  pub.receberImagem(b2, pa, { id: obra, uso: 'capa' }, pngDeTeste(400, 600))
  pub.enviar(b2, pa, { id: obra }); pub.decidir(b2, { id: adm, papel: 'admin' }, { alvo: 'obra', id: obra, acao: 'aprovar' })
  assert.equal(ext.seguir(b2, p, { id: obra, seguir: true }).seguidores, 1)
  assert.equal(pub.listar(b2, p, new URLSearchParams('seguindo=1')).obras.length, 1)
  const parte2 = pub.salvarParte(b2, pa, { publicacao: obra, titulo: 'Dois', texto: 'Segundo capítulo com texto suficiente. '.repeat(3) }).id
  pub.enviar(b2, pa, { id: obra })
  pub.decidir(b2, { id: adm, papel: 'admin' }, { alvo: 'parte', id: parte2, acao: 'aprovar' })
  const avisos = b2.prepare("SELECT titulo, link FROM aviso WHERE leitor_id = ? AND tipo = 'seguindo'").all(leitora)
  assert.equal(avisos.length, 1, 'quem segue não recebeu aviso do capítulo novo')
  assert.match(avisos[0].link, new RegExp(`id=${obra}&cap=2`))

  // reordenar: lista incompleta é recusada; lista certa inverte
  const ids = b2.prepare('SELECT id FROM publicacao_parte WHERE publicacao_id = ? ORDER BY ordem').all(obra).map((x) => x.id)
  assert.throws(() => pub.reordenarPartes(b2, pa, { publicacao: obra, ids: [ids[0]] }), /não confere/)
  pub.reordenarPartes(b2, pa, { publicacao: obra, ids: [...ids].reverse() })
  assert.deepEqual(b2.prepare('SELECT id FROM publicacao_parte WHERE publicacao_id = ? ORDER BY ordem').all(obra).map((x) => x.id), [...ids].reverse())
})

test('google: conta nova, entrar de novo, nunca juntar pelo e-mail, vincular, senha e desligar', async () => {
  const g = await import('./google.mjs')
  const b = bd(); g.garantirTabelas(b); gosto.garantirTabelas(b)
  process.env.FIO_CONVITE = 'aberto'
  try {
    // alguém cadastrou o e-mail da vítima antes: o Google dela NÃO pode cair nessa conta
    const intruso = leitorDeTeste('intrusogoogle')
    b.prepare("UPDATE leitor SET email = 'vitima@gmail.com' WHERE id = ?").run(intruso)
    const perfil = { sub: 'g-111', email: 'vitima@gmail.com', nome: 'Vítima Real' }
    const nova = await g.resolver(b, { perfil, modo: 'entrar' }, { ip: '10.0.0.1' })
    assert.ok(nova.novo && nova.sessao?.token)
    assert.notEqual(nova.leitorId, intruso, 'juntou a conta do Google com a conta de quem usou o e-mail antes')
    assert.equal(b.prepare('SELECT email FROM leitor WHERE id = ?').get(nova.leitorId).email, null)
    // de novo: entra na mesma
    const de2 = await g.resolver(b, { perfil, modo: 'entrar' }, {})
    assert.equal(de2.leitorId, nova.leitorId); assert.ok(!de2.novo)
    // nasce sem senha conhecida: não desliga antes de criar uma
    assert.equal(g.situacao(b, nova.leitorId).semSenha, true)
    assert.throws(() => g.desligar(b, nova.leitorId), /Defina uma senha/)
    await assert.rejects(g.definirSenha(b, nova.leitorId, { nova: '123' }))
    await g.definirSenha(b, nova.leitorId, { nova: 'uma senha boa de verdade 42' })
    await assert.rejects(g.definirSenha(b, nova.leitorId, { nova: 'outra senha boa de verdade 43' }), /já tem senha/)
    assert.deepEqual(g.desligar(b, nova.leitorId), { ok: true })
    // vincular: exige estar entrado; Google de outra pessoa não troca de dono
    const eu = leitorDeTeste('vinculadora')
    await assert.rejects(g.resolver(b, { perfil: { sub: 'g-222', email: null, nome: 'X' }, modo: 'vincular', leitorId: null }), /Entre na sua conta/)
    assert.equal((await g.resolver(b, { perfil: { sub: 'g-222', email: null, nome: 'X' }, modo: 'vincular', leitorId: eu })).vinculou, true)
    await assert.rejects(g.resolver(b, { perfil: { sub: 'g-222', email: null, nome: 'X' }, modo: 'vincular', leitorId: intruso }), /já está ligada a outra/)
    // porta fechada: Google não cria conta
    delete process.env.FIO_CONVITE
    await assert.rejects(g.resolver(b, { perfil: { sub: 'g-333', email: 'x@y.com', nome: 'Y' }, modo: 'entrar' }, {}), /cadastro está fechado/)
  } finally { delete process.env.FIO_CONVITE }

  // a volta só aceita o navegador que começou, e nunca manda para fora da casa
  process.env.GOOGLE_CLIENT_ID = 'id-teste'; process.env.GOOGLE_CLIENT_SECRET = 'segredo-teste'; process.env.FIO_GOOGLE = 'ligado'
  try {
    const { url, navegador } = g.comecar(b, { modo: 'entrar', volta: 'https://mal.com/x', redirectUri: 'https://fiolib.duckdns.org/api/google/volta', ip: '10.0.0.2' })
    const state = new URL(url).searchParams.get('state')
    assert.equal(new URL(url).searchParams.get('code_challenge_method'), 'S256')
    assert.equal(g._pendentes.get(state).volta, '/#/', 'aceitou volta para outro site')
    await assert.rejects(g.receber({ code: 'x', state, navegador: 'outro-navegador' }), /não começou neste navegador/)
    await assert.rejects(g.receber({ code: 'x', state, navegador }), /venceu/, 'o mesmo state serviu duas vezes')
    assert.equal(g.enderecoDeVolta('evil.com', 'https://fiolib.duckdns.org'), 'https://fiolib.duckdns.org/api/google/volta')
    assert.equal(g.enderecoDeVolta('fio.142-93-57-2.sslip.io', 'https://fiolib.duckdns.org'), 'https://fio.142-93-57-2.sslip.io/api/google/volta')
  } finally { delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.FIO_GOOGLE }
})

test('google: o Gmail do dono entra direto na conta configurada, e só com e-mail verificado', async () => {
  const g = await import('./google.mjs')
  const b = bd(); g.garantirTabelas(b)
  const curadoria = leitorDeTeste('curadorteste')
  process.env.FIO_GOOGLE_DONO = 'Dono@Gmail.com, outro@gmail.com'; process.env.FIO_GOOGLE_DONO_CONTA = 'curadorteste'
  try {
    // e-mail não verificado chega como null e não liga nada
    await assert.rejects(g.resolver(b, { perfil: { sub: 'g-dono-x', email: null, nome: 'X' }, modo: 'entrar' }, {}), /cadastro está fechado/)
    const r = await g.resolver(b, { perfil: { sub: 'g-dono', email: 'dono@gmail.com', nome: 'Dono' }, modo: 'entrar' }, {})
    assert.equal(r.leitorId, curadoria); assert.ok(r.sessao?.token); assert.ok(!r.novo)
    // o segundo e-mail do dono não toma a conta que já tem Google ligado
    await assert.rejects(g.resolver(b, { perfil: { sub: 'g-dono-2', email: 'outro@gmail.com', nome: 'Dono 2' }, modo: 'entrar' }, {}), /cadastro está fechado/)
  } finally { delete process.env.FIO_GOOGLE_DONO; delete process.env.FIO_GOOGLE_DONO_CONTA }
})

// ─────────────────────────────────────────────────────────────
// A esteira na VPS (18/09): a fila no banco, a instalação e a busca livro a livro
// ─────────────────────────────────────────────────────────────

function obraDeTeste(b, titulo, autor = 'Autor de Teste', morte = 1900) {
  const pessoa = Number(b.prepare('INSERT INTO pessoa (nome, nome_ordem, morte) VALUES (?,?,?)').run(autor, autor, morte).lastInsertRowid)
  const obra = Number(b.prepare("INSERT INTO obra (titulo, titulo_pt, trilho, publicada) VALUES (?,?, 'B', 1)").run(titulo, titulo).lastInsertRowid)
  b.prepare("INSERT INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,'autor')").run(obra, pessoa)
  return obra
}

const traducaoFalsa = (palavra) => ({
  fonte: 'https://www.gutenberg.org/ebooks/1.txt.utf-8',
  capitulos: [1, 2].map((ordem) => ({
    ordem, titulo: `Capítulo ${ordem}`,
    corpo: `<p>${`${palavra} `.repeat(300)}</p>`, palavras: 300,
  })),
})

test('esteira na VPS: promove, ordena (pedido > menor > prateleira), espera depois de falhar e desiste no fim', async () => {
  const esteira = await import('./esteira.mjs')
  const b = bd(); esteira.garantirTabelas(b)
  b.exec('DELETE FROM fila_traducao')
  const poe = b.prepare("INSERT INTO fila_traducao (titulo, autor, morte, fonte, idioma, prioridade) VALUES (?,?,?,?, 'en', ?)")
  poe.run('Livro Grande', 'Fulano Grande', 1900, 'https://www.gutenberg.org/ebooks/11.txt.utf-8', 0)
  poe.run('Livro Pequeno', 'Fulano Pequeno', 1900, 'https://www.gutenberg.org/ebooks/12.txt.utf-8', 0)
  poe.run('Pedido de Assinante', 'Fulano Pedido', 1900, 'https://www.gutenberg.org/ebooks/13.txt.utf-8', 1)

  assert.equal(esteira.promover(b), 3)
  const fila = b.prepare('SELECT titulo, estado, obra_id FROM fila_traducao ORDER BY id').all()
  assert.ok(fila.every((f) => f.estado === 'na_esteira' && f.obra_id), 'todo pedido virou obra')
  assert.equal(esteira.promover(b), 0, 'promover de novo não duplica')

  const id = (t) => b.prepare('SELECT id FROM fila_traducao WHERE titulo = ?').get(t).id
  esteira.guardarTamanho(b, id('Livro Grande'), 900_000)
  esteira.guardarTamanho(b, id('Livro Pequeno'), 40_000)
  esteira.guardarTamanho(b, id('Pedido de Assinante'), 2_000_000)
  assert.equal(esteira.semTamanho(b).length, 0)
  assert.equal(esteira.proximo(b).titulo, 'Pedido de Assinante', 'pedido de assinante passa na frente')

  // falha passageira: sai da frente até a hora marcada
  const f1 = esteira.falhou(b, id('Pedido de Assinante'), 'MinT devolveu 503')
  assert.deepEqual([f1.estado, f1.esperaMin], ['na_esteira', esteira.ESPERAS_MIN[0]])
  assert.equal(esteira.proximo(b).titulo, 'Livro Pequeno', 'o menor vem antes do maior')
  // a hora chegou: volta a ser o primeiro
  b.prepare("UPDATE fila_traducao SET tentar_depois = datetime('now', '-1 minute') WHERE id = ?").run(id('Pedido de Assinante'))
  assert.equal(esteira.proximo(b).titulo, 'Pedido de Assinante')

  // esgotou as esperas: vira erro, e o painel pode mandar de volta
  for (let i = 1; i < esteira.ESPERAS_MIN.length; i++) esteira.falhou(b, id('Pedido de Assinante'), 'de novo')
  assert.equal(esteira.falhou(b, id('Pedido de Assinante'), 'última').estado, 'erro')
  assert.equal(esteira.proximo(b).titulo, 'Livro Pequeno')
  assert.equal(esteira.retentar(b, id('Pedido de Assinante')), 1)
  assert.equal(esteira.proximo(b).titulo, 'Pedido de Assinante')
  assert.equal(esteira.retentar(b, id('Livro Pequeno')), 0, 'só o que está em erro volta')

  // falha que não melhora esperando vai direto para erro
  assert.equal(esteira.falhou(b, id('Livro Grande'), 'saíram só 12 palavras — esta fonte não é um livro', { permanente: true }).estado, 'erro')

  // pausa
  assert.equal(esteira.pausada(b), false)
  esteira.pausar(b, true); assert.equal(esteira.pausada(b), true)
  assert.equal(esteira.estado(b).pausada, true)
  esteira.pausar(b, false); assert.equal(esteira.pausada(b), false)

  const c = esteira.contagem(b)
  assert.deepEqual([c.total, c.erro, c.faltam], [3, 1, 2])
  b.exec('DELETE FROM fila_traducao')
})

test('esteira na VPS: instalar põe o livro no banco e na busca, e reinstalar troca sem deixar o velho na busca', async () => {
  const esteira = await import('./esteira.mjs')
  const { instalarTraducao } = await import('./servicos/acervo.mjs')
  const { indexarTexto, indexarObra } = await import('./reindexar.mjs')
  const b = bd(); esteira.garantirTabelas(b)
  const obra = obraDeTeste(b, 'O Livro da Esteira', 'Autora Antiga', 1850)
  b.prepare("INSERT INTO fila_traducao (titulo, autor, fonte, idioma, estado, obra_id) VALUES ('O Livro da Esteira', 'Autora Antiga', 'https://www.gutenberg.org/ebooks/1.txt.utf-8', 'en', 'na_esteira', ?)").run(obra)
  const acha = (palavra) => b.prepare('SELECT COUNT(*) n FROM busca_capitulo WHERE busca_capitulo MATCH ?').get(palavra).n

  assert.throws(() => instalarTraducao(b, { fonte: 'x', capitulos: [{ ordem: 1, corpo: '<p>curto</p>', palavras: 2 }] }, { obraId: obra }), /não é um livro/)
  assert.throws(() => instalarTraducao(b, traducaoFalsa('nada'), { obraId: 999999 }), /não existe/)

  const r = instalarTraducao(b, traducaoFalsa('ornitorrinco'), { obraId: obra, morte: 1850 })
  assert.equal(indexarTexto(b, r.textoId), 2)
  assert.equal(indexarObra(b, obra), true)
  assert.equal(acha('ornitorrinco'), 2)
  assert.equal(b.prepare('SELECT COUNT(*) n FROM busca_obra WHERE busca_obra MATCH ?').get('esteira').n >= 1, true)
  const o = b.prepare('SELECT trilho FROM obra WHERE id = ?').get(obra)
  assert.equal(o.trilho, 'A')
  assert.match(b.prepare('SELECT motivo FROM direito WHERE texto_id = ?').get(r.textoId).motivo, /1850/)
  assert.match(b.prepare('SELECT corpo FROM capitulo WHERE texto_id = ? LIMIT 1').get(r.textoId).corpo, /^<p>ornitorrinco/)

  // a fila vê que ficou pronto
  esteira.reconciliar(b)
  assert.equal(b.prepare('SELECT estado FROM fila_traducao WHERE obra_id = ?').get(obra).estado, 'pronto')

  // reinstalar: um texto só, e a palavra velha some da busca
  const r2 = instalarTraducao(b, traducaoFalsa('tamanduá'), { obraId: obra })
  indexarTexto(b, r2.textoId); indexarObra(b, obra)
  assert.equal(b.prepare("SELECT COUNT(*) n FROM texto WHERE obra_id = ? AND fonte = 'fio_traducao'").get(obra).n, 1)
  assert.equal(acha('ornitorrinco'), 0, 'a tradução apagada continuou na busca')
  assert.equal(acha('tamanduá'), 2)
  // (o id do texto pode ser reaproveitado; o que importa é não sobrar capítulo sem texto)
  assert.equal(b.prepare('SELECT COUNT(*) n FROM capitulo c WHERE NOT EXISTS (SELECT 1 FROM texto t WHERE t.id = c.texto_id)').get().n, 0, 'capítulos órfãos')
  assert.equal(b.prepare('SELECT COUNT(*) n FROM capitulo WHERE texto_id = ?').get(r2.textoId).n, 2)
  assert.equal(b.prepare('SELECT COUNT(*) n FROM busca_obra WHERE conteudo_obra_id = ?').get(obra).n, 1, 'obra duplicada na busca')
  b.exec('DELETE FROM fila_traducao')
})

test('esteira na VPS: o plano antigo do PC só entra na obra certa', async () => {
  const esteira = await import('./esteira.mjs')
  const b = bd(); esteira.garantirTabelas(b)
  const certa = obraDeTeste(b, 'Contos da Importação')
  const outra = obraDeTeste(b, 'Um Título Diferente')
  const linha = (obra, titulo, fonte = 'https://www.gutenberg.org/ebooks/77.txt.utf-8') =>
    ({ obra, titulo, autor: 'X', morte: 1900, fonte, de: 'en', saida: `obra${obra}`, emTrilha: 1 })
  const r = esteira.importarPlano(b, [
    linha(certa, 'Contos da importação'),                  // entra (caixa e acento não importam)
    linha(outra, 'Contos da Importação', 'https://www.gutenberg.org/ebooks/78.txt.utf-8'), // id aponta para outro livro
    linha(999999, 'Não Existe'),
    linha(certa, 'Contos da Importação', 'https://exemplo.com/livro.txt'),
  ])
  assert.equal(r.entraram, 1)
  assert.equal(r.recusados.length, 3)
  assert.equal(esteira.importarPlano(b, [linha(certa, 'Contos da Importação')]).jaEstavam, 1, 'importar de novo duplicou')
  const f = b.prepare('SELECT estado, obra_id, em_trilha FROM fila_traducao WHERE obra_id = ?').get(certa)
  assert.deepEqual([f.estado, f.em_trilha], ['na_esteira', 1])
  b.exec('DELETE FROM fila_traducao')
})

// ─────────────────────────────────────────────────────────────
// Os serviços (19/09): tradução, catálogo e a porta de entrada dos lotes
// ─────────────────────────────────────────────────────────────

test('esteira: o lote sem obra (formato do gerador de lotes) entra como espera, uma vez só', async () => {
  const esteira = await import('./esteira.mjs')
  const b = bd(); esteira.garantirTabelas(b)
  b.exec('DELETE FROM fila_traducao')
  const lote = [
    { titulo: 'Um Conto', autor: 'Fulana', morte: 1900, fonte: 'https://www.gutenberg.org/ebooks/555.txt.utf-8', de: 'en' },
    { titulo: 'Sem Autor', fonte: 'https://www.gutenberg.org/ebooks/556.txt.utf-8' },
    { titulo: 'De Fora', autor: 'X', fonte: 'https://exemplo.com/a.txt' },
  ]
  const r = esteira.importarPlano(b, lote)
  assert.deepEqual([r.entraram, r.recusados.length], [1, 2])
  assert.equal(esteira.importarPlano(b, lote.slice(0, 1)).jaEstavam, 1)
  assert.equal(b.prepare("SELECT estado FROM fila_traducao WHERE titulo = 'Um Conto'").get().estado, 'espera')
  assert.equal(esteira.promover(b), 1)
  assert.equal(esteira.proximo(b).titulo, 'Um Conto')
  b.exec('DELETE FROM fila_traducao')
})

test('serviço de tradução: baixa, divide em capítulos, retoma pelo caderno e para quando mandam', async () => {
  const { createServer } = await import('node:http')
  const { traduzirLivro, traducaoPronta } = await import('./servicos/traducao.mjs')
  const { readFileSync: ler, existsSync } = await import('node:fs')
  const capitulo = (n) => `CAPÍTULO ${['I', 'II', 'III'][n]}\n\n` + Array.from({ length: 12 }, (_, i) =>
    `Ele estava a pensar no parágrafo ${i + 1} do capítulo ${n + 1}, e o facto é que ` + 'a casa era grande e silenciosa. '.repeat(6)).join('\n\n')
  const texto = `Cabeçalho do Gutenberg\n*** START OF THE PROJECT GUTENBERG EBOOK TESTE ***\n\n${[0, 1, 2].map(capitulo).join('\n\n')}\n\n*** END OF THE PROJECT GUTENBERG EBOOK TESTE ***\nlicença`
  const srv = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end(texto) })
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  const fonte = `http://127.0.0.1:${srv.address().port}/livro.txt`
  const pastaT = join(pasta, 'traducoes-servico')
  try {
    // parar antes de começar: nenhum parágrafo sai, e o erro diz por quê
    const parado = new AbortController(); parado.abort(new Error('teste'))
    await assert.rejects(traduzirLivro({ fonte, de: 'pt', nome: 'parado', pasta: pastaT, sinal: parado.signal }), /parado: teste/)

    const andou = []
    const r = await traduzirLivro({ fonte, de: 'pt', titulo: 'Teste', nome: 'livro', pasta: pastaT, aoAndar: (f, t) => andou.push([f, t]) })
    assert.equal(r.livro.capitulos.length, 3)
    assert.deepEqual(r.livro.capitulos.map((c) => c.titulo), ['Capítulo I', 'Capítulo II', 'Capítulo III'], 'o título em caixa alta sai em caixa de título')
    assert.ok(!/licença|START OF/.test(JSON.stringify(r.livro)), 'cabeçalho ou rodapé do Gutenberg entrou no livro')
    assert.match(r.livro.capitulos[0].corpo, /estava pensando/, 'a norma brasileira não foi aplicada')
    assert.ok(andou.length && andou.at(-1)[0] === andou.at(-1)[1], 'o andamento não chegou ao fim')
    assert.equal(traducaoPronta(pastaT, 'livro').capitulos.length, 3)
    const linhas = ler(join(pastaT, 'livro.caderno.jsonl'), 'utf8').trim().split('\n').length
    assert.equal(linhas, 39, 'cada unidade (3 títulos + 36 parágrafos) vai para o caderno')

    // de novo: tudo sai do caderno, nada é pedido outra vez
    const r2 = await traduzirLivro({ fonte, de: 'pt', nome: 'livro', pasta: pastaT })
    assert.deepEqual(r2.livro.capitulos, r.livro.capitulos)
    assert.equal(ler(join(pastaT, 'livro.caderno.jsonl'), 'utf8').trim().split('\n').length, linhas)
    assert.ok(!existsSync(join(pastaT, 'parado.json')))
  } finally { srv.close() }
})

test('catálogo: publicar UMA obra dá o mesmo que refazer o catálogo inteiro', async () => {
  const { publicarCatalogo, publicarObra } = await import('./servicos/catalogo.mjs')
  const { instalarLivro } = await import('./servicos/acervo.mjs')
  const { readFileSync: ler, mkdirSync: mk } = await import('node:fs')
  const b = bd()
  // três obras num tema (prateleira precisa de 3), uma delas ainda sem texto
  const tema = Number(b.prepare("INSERT INTO tema (nome, resumo) VALUES ('Tema do Catálogo', 'x')").run().lastInsertRowid)
  const ids = ['Primeira do Tema', 'Segunda do Tema', 'Terceira do Tema'].map((t) => obraDeTeste(b, t))
  for (const id of ids) b.prepare('INSERT INTO obra_tema (obra_id, tema_id, peso) VALUES (?,?,1)').run(id, tema)
  const inc = join(pasta, 'cat-incremental'), inteiro = join(pasta, 'cat-inteiro')
  mk(inc, { recursive: true }); mk(inteiro, { recursive: true })

  assert.equal(publicarCatalogo(b, inc).trocou, true)
  const antes = JSON.parse(ler(join(inc, 'catalogo.json'), 'utf8'))
  assert.equal(antes.obras.find((o) => o.id === ids[1]).trilho, 'B')

  // a esteira traduz a segunda: ela vira legível
  instalarLivro(b, traducaoFalsa('capivara'), { obraId: ids[1] })
  assert.deepEqual(publicarObra(b, inc, ids[1]), { publicada: true, trilho: 'A' })
  // uma obra nova, que ainda não estava no catálogo
  const nova = obraDeTeste(b, 'Aaa Obra Nova no Catálogo', 'Autora Nova do Catálogo')
  assert.equal(publicarObra(b, inc, nova).publicada, true)

  publicarCatalogo(b, inteiro)
  const a = JSON.parse(ler(join(inc, 'catalogo.json'), 'utf8')), c = JSON.parse(ler(join(inteiro, 'catalogo.json'), 'utf8'))
  const porId = (l) => Object.fromEntries(l.map((o) => [o.id, o]))
  assert.deepEqual(porId(a.obras), porId(c.obras), 'as linhas do catálogo divergem')
  assert.deepEqual(a.temas.find((t) => t.nome === 'Tema do Catálogo'), c.temas.find((t) => t.nome === 'Tema do Catálogo'))
  assert.deepEqual(porId(a.autores), porId(c.autores))
  for (const id of [ids[1], nova]) {
    assert.equal(ler(join(inc, 'fichas', `${id}.json`), 'utf8'), ler(join(inteiro, 'fichas', `${id}.json`), 'utf8'))
  }

  // o catálogo encolhido não substitui o que está no ar
  assert.equal(publicarCatalogo(b, inteiro, { minimo: 100 }).trocou, false)
})

test('a primeira conta só vira admin uma vez na vida do banco', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const { casaFundada } = await import('./contas.mjs')
  const b = new DatabaseSync(':memory:')
  b.exec("CREATE TABLE leitor (id INTEGER PRIMARY KEY, papel TEXT NOT NULL DEFAULT 'leitor')")
  assert.equal(casaFundada(b), false, 'banco novo ainda não tem dona')
  b.exec("INSERT INTO leitor (papel) VALUES ('admin')")
  assert.equal(casaFundada(b), true)
  // a dona e todo mundo apagam a conta: a casa continua fundada
  b.exec('DELETE FROM leitor')
  assert.equal(casaFundada(b), true, 'banco esvaziado voltou a dar o painel ao próximo cadastro')
})

// ── 19/09/2026: a trava do painel ──

test('a administração entra só pelo Google quando ele está ligado, e a senha certa vira alerta', async () => {
  const b = bd()
  b.exec('DELETE FROM tentativa')
  const g = await import('./google.mjs'); g.garantirTabelas(b)
  const { pessoa } = await contas.criar(b, { usuario: 'chefe', nome: 'Chefe', email: 'chefe@exemplo.com', senha: BOA, perguntas: PERGUNTAS, convite: contas.criarConvite(b).codigo })
  b.prepare("UPDATE leitor SET papel = 'admin' WHERE id = ?").run(pessoa.id)
  const env = { GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', FIO_GOOGLE: 'ligado' }
  try {
    // sem Google ligado, a senha é a porta
    assert.ok((await contas.entrar(b, { usuario: 'chefe', senha: BOA })).sessao)
    Object.assign(process.env, env)
    // Google ligado mas a conta sem Google vinculado: a senha continua (senão trancava o dono)
    b.exec('DELETE FROM tentativa')
    assert.ok((await contas.entrar(b, { usuario: 'chefe', senha: BOA })).sessao)
    b.prepare('INSERT INTO leitor_google (sub, leitor_id, email) VALUES (?,?,?)').run('g-chefe', pessoa.id, 'chefe@gmail.com')
    b.exec('DELETE FROM tentativa')
    await assert.rejects(contas.entrar(b, { usuario: 'chefe', senha: BOA }, { ip: '200.1.2.3' }), /só pelo botão/)
    assert.equal(b.prepare("SELECT COUNT(*) n FROM alerta_seguranca WHERE tipo = 'senha-admin-certa'").get().n, 1)
    // senha ERRADA continua a resposta genérica, sem revelar que a conta é de administração
    b.exec('DELETE FROM tentativa')
    await assert.rejects(contas.entrar(b, { usuario: 'chefe', senha: 'errada errada' }), /não conferem/)
    // a saída de emergência
    process.env.FIO_ADMIN_SENHA = 'permitida'
    b.exec('DELETE FROM tentativa')
    assert.ok((await contas.entrar(b, { usuario: 'chefe', senha: BOA })).sessao)
  } finally {
    for (const k of [...Object.keys(env), 'FIO_ADMIN_SENHA']) delete process.env[k]
  }
})

test('a sessão de administração vence 7 dias depois da entrada, mesmo em uso', async () => {
  const b = bd()
  b.exec('DELETE FROM tentativa')
  const { sessao } = await contas.entrar(b, { usuario: 'chefe', senha: BOA })
  assert.equal(sessao.dias, 7)
  const { resumo } = await import('./seguranca.mjs')
  assert.ok(contas.deQuemE(b, sessao.token))
  b.prepare(`UPDATE sessao SET criado_em = datetime('now', '-8 days') WHERE token_hash = ?`).run(resumo(sessao.token))
  assert.equal(contas.deQuemE(b, sessao.token), null)
  assert.equal(b.prepare('SELECT COUNT(*) n FROM sessao WHERE token_hash = ?').get(resumo(sessao.token)).n, 0)
})

test('usar uma sessão renova ESSA sessão, e não outra', async () => {
  const b = bd()
  b.exec('DELETE FROM tentativa')
  const { resumo } = await import('./seguranca.mjs')
  await contas.criar(b, { usuario: 'renova', nome: 'Renova', senha: BOA, perguntas: PERGUNTAS, convite: contas.criarConvite(b).codigo })
  b.exec('DELETE FROM tentativa')
  const sa = (await contas.entrar(b, { usuario: 'renova', senha: BOA })).sessao
  const sb = (await contas.entrar(b, { usuario: 'renova', senha: BOA })).sessao
  const perto = b.prepare(`UPDATE sessao SET expira_em = datetime('now', '+1 day') WHERE token_hash = ?`)
  perto.run(resumo(sa.token)); perto.run(resumo(sb.token))
  const prazo = (t) => b.prepare('SELECT expira_em e FROM sessao WHERE token_hash = ?').get(resumo(t)).e
  const antesA = prazo(sa.token)
  assert.ok(contas.deQuemE(b, sb.token))
  assert.ok(prazo(sb.token) > antesA, 'a sessão usada não foi renovada')
  assert.equal(prazo(sa.token), antesA, 'renovou a sessão de outro aparelho')
})

// ── 19/09/2026: a varredura de bugs e as seis ideias ──

test('nome de autor do Gutenberg vira nome de gente', async () => {
  const { nomeDoGutenberg, limparNome } = await import('./nomes.mjs')
  assert.equal(nomeDoGutenberg('Chesterton, G. K. (Gilbert Keith)'), 'G. K. Chesterton')
  assert.equal(nomeDoGutenberg('La Motte-Fouqué, Friedrich Heinrich Karl, Freiherr de'), 'Friedrich Heinrich Karl La Motte-Fouqué')
  assert.equal(nomeDoGutenberg('Lytton, Edward Bulwer Lytton, Baron'), 'Edward Bulwer Lytton')
  assert.equal(nomeDoGutenberg('Tolstoy, Leo, graf'), 'Leo Tolstoy')
  assert.equal(nomeDoGutenberg('King, Martin Luther, Jr.'), 'Martin Luther King Jr.')
  assert.equal(limparNome('Fernanda Soares Andrade (página não existe)'), 'Fernanda Soares Andrade')
  assert.equal(limparNome('H. Rider (Henry Rider) Haggard'), 'H. Rider Haggard')
  // o que é nome de verdade fica
  assert.equal(limparNome('Anônimo (cantar de gesta)'), 'Anônimo (cantar de gesta)')
  assert.equal(limparNome('Conde de Penha Garcia'), 'Conde de Penha Garcia')
  assert.equal(limparNome('Lord Byron'), 'Lord Byron')
})

test('o livro começa no capítulo I, e não na página de epígrafes', async () => {
  const { ondeComecaOLivro } = await import('./folha-de-rosto.mjs')
  const cap = (ordem, titulo, palavras) => ({ ordem, titulo, palavras, corpo: '<p>texto</p>' })
  // O Cortiço: epígrafes e índice antes do I
  assert.equal(ondeComecaOLivro([cap(1, 'PARIS', 162), cap(2, 'INDICE', 46), cap(3, 'I', 5001), cap(4, 'II', 3649)]), 3)
  // peça de teatro: "1.º Tamborileiro" é personagem, não capítulo
  assert.equal(ondeComecaOLivro([cap(1, 'COMEDIA EM TRÊS ACTOS', 1130), cap(2, '1.º Tamborileiro', 37), cap(3, 'Pantaleão', 82)]), 1)
  // seções numeradas desde o começo: não pula nada
  assert.equal(ondeComecaOLivro([cap(1, 'I', 207), cap(2, 'II', 87), cap(3, 'I', 282)]), 1)
  // prefácio longo é livro
  assert.equal(ondeComecaOLivro([cap(1, 'Prefácio', 4000), cap(2, 'Capítulo I', 3000)]), 1)
})

test('cadastro: nome em branco, e-mail errado e nome invisível', async () => {
  const b = bd()
  b.exec('DELETE FROM tentativa')
  const base = { nome: 'X', senha: BOA, perguntas: PERGUNTAS }
  await assert.rejects(contas.criar(b, { ...base, email: '    ', convite: contas.criarConvite(b).codigo }), /Escolha um nome de usuário/)
  await assert.rejects(contas.criar(b, { ...base, email: 'fulano@', convite: contas.criarConvite(b).codigo }), /e-mail não parece válido/)
  const invisivel = String.fromCharCode(0x200b).repeat(3)
  assert.equal(contas.limparNomeDeTela(`  Ana${invisivel}\n\nClara  `), 'Ana Clara')
  assert.equal(contas.limparNomeDeTela(invisivel), '')
})

test('errar a senha no cadastro não tranca a pessoa', async () => {
  const b = bd()
  b.exec('DELETE FROM tentativa')
  for (let i = 0; i < 20; i++) {
    await assert.rejects(contas.criar(b, { usuario: 'desastrada', nome: 'D', senha: '123', perguntas: PERGUNTAS, convite: contas.criarConvite(b).codigo }), /8 caracteres/)
  }
  const { pessoa } = await contas.criar(b, { usuario: 'desastrada', nome: 'D', senha: BOA, perguntas: PERGUNTAS, convite: contas.criarConvite(b).codigo })
  assert.equal(pessoa.usuario, 'desastrada')
})

test('entrar de um aparelho novo avisa; o mesmo aparelho não avisa de novo', async () => {
  const b = bd()
  b.exec('DELETE FROM tentativa')
  await contas.criar(b, { usuario: 'viajante', nome: 'V', senha: BOA, perguntas: PERGUNTAS, convite: contas.criarConvite(b).codigo },
    { ip: '200.10.1.1', agente: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' })
  const id = b.prepare("SELECT id FROM leitor WHERE usuario = 'viajante'").get().id
  const avisos = () => b.prepare("SELECT COUNT(*) n FROM aviso WHERE leitor_id = ? AND tipo = 'seguranca'").get(id).n
  assert.equal(avisos(), 0, 'criar a conta não é entrada estranha')
  await contas.entrar(b, { usuario: 'viajante', senha: BOA }, { ip: '200.10.1.1', agente: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' })
  assert.equal(avisos(), 0, 'mesmo aparelho, mesma rede')
  await contas.entrar(b, { usuario: 'viajante', senha: BOA }, { ip: '177.20.3.4', agente: 'Mozilla/5.0 (iPhone) Safari/604' })
  assert.equal(avisos(), 1, 'aparelho novo avisa')
})

test('"você quis dizer": uma letra errada ainda acha o livro', async () => {
  const b = bd()
  const { criarQuisDizer } = await import('./quis-dizer.mjs')
  b.prepare("INSERT INTO obra (id, titulo, publicada) VALUES (9301, 'Dom Casmurro', 1)").run()
  const pid = Number(b.prepare("INSERT INTO pessoa (nome, nome_ordem) VALUES ('Machado de Assis', 'Assis, Machado de')").run().lastInsertRowid)
  b.prepare("INSERT INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (9301, ?, 'autor')").run(pid)
  const tid = Number(b.prepare("INSERT INTO texto (obra_id, idioma, fonte, normalizado, palavras) VALUES (9301, 'pt', 'gutenberg', 1, 100)").run().lastInsertRowid)
  b.prepare("INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?, 1, 'I', '<p>x</p>', 100)").run(tid)
  b.prepare("INSERT INTO direito (texto_id, jurisdicao, estado, motivo) VALUES (?, 'BR', 'dominio_publico', 'teste')").run(tid)
  const quis = criarQuisDizer(b)
  const r = quis('dom casmuro')
  assert.equal(r[0]?.obra, 9301)
  assert.match(r[0].trecho, /Você quis dizer <mark>Dom Casmurro<\/mark>/)
  assert.equal(quis('machdo de asis')[0]?.obra, 9301, 'erro no autor também')
  assert.deepEqual(quis('dom casmurro'), [], 'escrito certo, a busca normal resolve')
  assert.deepEqual(quis('xyzzy'), [])
})

test('minha lista de mangás: guarda, valida e tira', async () => {
  const b = bd()
  const lista = await import('./manga-lista.mjs')
  const id = leitorDeTeste('leitoramanga')
  lista.por(b, id, { id: 30013, titulo: 'One Piece', capa: '/api/capa-manga/large/bx30013.jpg', tipo: 'mangá' })
  const r = lista.por(b, id, { id: 105398, titulo: 'Solo Leveling', capa: 'https://mal.example/x.jpg', tipo: 'script' })
  assert.equal(r.itens.length, 2)
  const solo = r.itens.find((i) => i.id === 105398)
  assert.equal(solo.capa, null, 'capa de fora não entra')
  assert.equal(solo.tipo, null)
  assert.throws(() => lista.por(b, id, { id: 'abc', titulo: 'x' }), /inválido/)
  assert.throws(() => lista.por(b, id, { id: 5, titulo: '   ' }), /sem título/)
  assert.equal(lista.tirar(b, id, { id: 30013 }).itens.length, 1)
})

test('o diário do painel não guarda senha', async () => {
  const { resumir } = await import('./diario.mjs')
  const r = resumir({ pausada: true, senha: 'segredo123', livros: [1, 2, 3], nota: 'x'.repeat(200) })
  assert.match(r, /pausada=true/)
  assert.match(r, /senha=•••/)
  assert.doesNotMatch(r, /segredo123/)
  assert.match(r, /livros=\[3 itens\]/)
  assert.ok(r.length < 200)
})

test('a previsão da fila sai do ritmo dos últimos livros', async () => {
  const b = bd()
  const { previsao, garantirTabelas } = await import('./esteira.mjs')
  garantirTabelas(b)
  b.exec("DELETE FROM fila_traducao")
  b.prepare("INSERT INTO fila_traducao (titulo, autor, fonte, estado, bytes) VALUES ('A', 'x', 'https://www.gutenberg.org/ebooks/1.txt.utf-8', 'espera', 600000)").run()
  b.prepare("INSERT INTO fila_traducao (titulo, autor, fonte, estado, bytes) VALUES ('B', 'x', 'https://www.gutenberg.org/ebooks/2.txt.utf-8', 'na_esteira', 600000)").run()
  const p = previsao(b, { ultimos: [{ ok: true, palavras: 100_000, min: 20 }, { ok: false, titulo: 'falhou' }] })
  assert.equal(p.livros, 2)
  assert.equal(p.porMinuto, 5000)
  assert.equal(p.palavras, 200_000)
  assert.equal(previsao(b, { ultimos: [] }), null, 'sem livro feito, sem previsão')
})

// ── diagramação (19/09/2026): o capítulo como página de livro ──
test('diagramar: emenda a frase cortada, tira página e cabeçalho, conserta o OCR', async () => {
  const { diagramar } = await import('./diagramar.mjs')
  const [c] = diagramar([{ ordem: 1, titulo: '', palavras: 0, corpo:
    '<p>João Romão foi, dos treze aos vinte e cinco annos, empregado de um</p>' +
    '<p>36</p><p>314 ESTUDOS DA EDADE MEDIA</p>' +
    '<p>vendeiro que enriqueceu entre as quatro paredes de uma suja e com-</p>' +
    '<p>mercial taverna. E a noite nSo acabava, entSo veio d^entre as casas.</p>' +
    '<p>Outro parágrafo, que começa depois de um ponto final e fica sozinho.</p>' }], { fonte: 'archive' })
  assert.equal(c.corpo,
    '<p>João Romão foi, dos treze aos vinte e cinco annos, empregado de um vendeiro que enriqueceu entre as quatro paredes de uma suja e commercial taverna. E a noite não acabava, então veio d\'entre as casas.</p>' +
    '<p>Outro parágrafo, que começa depois de um ponto final e fica sozinho.</p>')
})

test('diagramar: título, epígrafe, pausa, nota e fala separada por <br>', async () => {
  const { diagramar } = await import('./diagramar.mjs')
  const [a, b] = diagramar([
    { ordem: 1, titulo: 'I', palavras: 0, corpo: '<p> «Periculum dicendi non recuso.» </p><p>(CICERO.)</p><p>Texto do capítulo.[1]</p><p>* * * * *</p><p>Depois.</p>' },
    { ordem: 2, titulo: 'CAPITULO II', palavras: 0, corpo: '<p>CAPITULO II</p><p>Ele escutou em silencio.<br> Quando acabou, repetiu:<br> — Quem?</p><p>Tu que me deste o teu cuidado,<br>e o teu amor, e a tua mão<br>no inverno escuro</p>' },
  ])
  assert.match(a.corpo, /^<p class="fio-cap" aria-hidden="true" data-rot="Capítulo" data-titulo="I"><\/p>/, 'o título entra sem virar texto')
  assert.match(a.corpo, /<p class="epigrafe">«Periculum dicendi non recuso.»<\/p><p class="atribuicao">\(CICERO.\)<\/p>/)
  assert.match(a.corpo, /capítulo.<sup class="nota">1<\/sup>/)
  assert.match(a.corpo, /<p class="pausa">\* \* \*<\/p>/)
  assert.match(b.corpo, /^<p class="fio-cap">CAPITULO II<\/p>/, 'o título que já está no texto vira o título')
  assert.match(b.corpo, /<p>Ele escutou em silencio.<\/p><p>Quando acabou, repetiu:<\/p><p>— Quem\?<\/p>/, 'prosa: uma fala por parágrafo')
  assert.match(b.corpo, /<p class="estrofe">Tu que me deste o teu cuidado,<br>e o teu amor/, 'verso continua verso')
  // sem título no EPUB, que escreve o seu
  assert.doesNotMatch(diagramar([{ ordem: 1, titulo: 'I', palavras: 0, corpo: '<p>a.</p>' }], { titulo: false })[0].corpo, /fio-cap/)
})

test('diagramar: fala entre aspas no começo NÃO vira epígrafe, e o texto do muro vira parágrafos', async () => {
  const { diagramar } = await import('./diagramar.mjs')
  const [a, b] = diagramar([
    { ordem: 1, titulo: '', palavras: 0, corpo: '<p>“Vem cá”, disse ela.</p><p>E ele foi.</p>' },
    { ordem: 2, titulo: '', palavras: 0, corpo: 'Este foi o primeiro capítulo.\n\nCrie uma conta.' },
  ])
  assert.doesNotMatch(a.corpo, /epigrafe/)
  assert.equal(b.corpo, '<p>Este foi o primeiro capítulo.</p><p>Crie uma conta.</p>')
})

test('nota do OCR: aviso só abaixo do limiar, e a nota guardada é lida', async () => {
  const q = await import('./qualidade.mjs')
  const b = bd()
  q.garantirTabelas(b)
  assert.equal(q.avisoDeOcr(null), null, 'sem nota (livro digitado): sem aviso')
  assert.equal(q.avisoDeOcr(0.93), null)
  assert.match(q.avisoDeOcr(0.8), /algumas palavras/)
  assert.match(q.avisoDeOcr(0.6), /ilegíveis/)
  b.prepare('INSERT OR REPLACE INTO nota_ocr (obra_id, nota) VALUES (?, ?)').run(424242, 0.61)
  assert.ok(q.notas(b) instanceof Map)
})

// ── "fale com a gente" e o termômetro dos planos (19/09/2026) ──
test('contato: recusa o que não dá para responder, guarda o que dá, e avisa a administração', async () => {
  const contato = await import('./contato.mjs')
  const planos = await import('./planos.mjs')
  const b = bd()
  contato.garantirTabelas(b)
  const ruim = (dado, parte) => assert.throws(() => contato.receber(b, dado), (e) => e.message.includes(parte), parte)
  ruim({ nome: '', email: 'a@b.com', mensagem: 'uma mensagem comprida o bastante' }, 'seu nome')
  ruim({ nome: 'Ana', email: 'nao-e-email', mensagem: 'uma mensagem comprida o bastante' }, 'e-mail válido')
  ruim({ nome: 'Ana', email: 'a@b.com', mensagem: 'oi' }, 'um pouco mais')
  ruim({ tipo: 'direito', nome: 'Ana', email: 'a@b.com', mensagem: 'esta obra é minha e peço a retirada' }, 'qual obra')
  ruim({ tipo: 'direito', nome: 'Ana', email: 'a@b.com', obra: '/livro/1', mensagem: 'esta obra é minha e peço a retirada' }, 'boa-fé')

  const admin = b.prepare("SELECT id FROM leitor WHERE papel = 'admin'").get()
  const antes = b.prepare('SELECT COUNT(*) n FROM aviso WHERE leitor_id = ?').get(admin.id).n
  const r = contato.receber(b, { tipo: 'direito', nome: 'Ana', email: 'ana@exemplo.com', obra: '/livro/1', mensagem: 'esta obra é minha e peço a retirada', boaFe: true }, { ip: '187.1.2.3' })
  assert.match(r.protocolo, /^FIO-\d{5}$/)
  assert.equal(contato.pendentes(b) >= 1, true)
  assert.equal(b.prepare('SELECT COUNT(*) n FROM aviso WHERE leitor_id = ?').get(admin.id).n, antes + 1, 'a administração é avisada')
  const [m] = contato.listar(b)
  assert.equal(m.nome, 'Ana')
  assert.equal(m.ip_dica, undefined, 'a lista do painel não devolve o IP')
  contato.resolver(b, { id: m.id, resposta: 'respondido' })
  assert.equal(contato.listar(b).find((x) => x.id === m.id).resolvido_em != null, true)
  void planos
})

test('planos: "me avise quando abrir" e a lista de contas do painel', async () => {
  const planos = await import('./planos.mjs')
  const b = bd()
  planos.garantirTabelas(b)
  const pessoa = b.prepare("SELECT id, usuario FROM leitor WHERE papel <> 'admin' ORDER BY id LIMIT 1").get()
  planos.querer(b, pessoa, 'trama')
  assert.equal(planos.interesseDe(b, pessoa.id).plano, 'trama')
  planos.querer(b, pessoa, 'inventado')
  assert.equal(planos.interesseDe(b, pessoa.id).plano, 'novelo', 'plano desconhecido vira o básico')

  const todas = planos.listarContas(b, {})
  assert.ok(todas.total >= 1)
  assert.ok(todas.contas.every((c) => c.planoAtual))
  assert.equal(todas.resumo.interessados >= 1, true)
  const so = planos.listarContas(b, { filtro: 'interessados' })
  assert.ok(so.contas.some((c) => c.id === pessoa.id))
  const busca = planos.listarContas(b, { q: pessoa.usuario })
  assert.ok(busca.contas.some((c) => c.id === pessoa.id))
  assert.equal(planos.listarContas(b, { q: 'nao-existe-mesmo-zzz' }).total, 0)
  const admins = planos.listarContas(b, { filtro: 'admin' })
  assert.ok(admins.contas.every((c) => c.papel === 'admin' && c.planoAtual === 'tear'), 'admin é sempre Tear')
})

// ─────────────────────────────────────────────────────────────
// A REVISORA (20/09/2026)
//
// O que se testa aqui não é "consegue consertar" — é **consegue NÃO
// estragar**. O dono autorizou este serviço com uma condição explícita: que
// ele não possa quebrar as traduções. Cada teste abaixo é uma das travas de
// servidor/revisao.mjs, e o dia em que um deles ficar vermelho é o dia em que
// a revisora tem que ficar parada.
// ─────────────────────────────────────────────────────────────

test('revisora: mede a língua do parágrafo pelas palavras de função', async () => {
  const r = await import('./revisao.mjs')
  const pt = r.medirLingua('Ele não sabia o que era, mas tinha certeza de que a casa estava vazia e de que ninguém viria.')
  assert.equal(pt.lingua, 'pt')
  const de = r.medirLingua('Der Gedanke an den Prozeß verließ ihn nicht mehr. Öfters schon hatte er überlegt, ob es nicht gut wäre.')
  assert.equal(de.lingua, 'de')
  const en = r.medirLingua('The thought of the trial never left him, and he had often wondered whether it would not be a good thing.')
  assert.equal(en.lingua, 'en')
})

test('revisora: só acusa parágrafo que ficou MESMO na língua de origem', async () => {
  const r = await import('./revisao.mjs')
  // alemão inteiro, como em O Processo e O Castelo: é defeito
  assert.equal(r.ficouNaOrigem('Der Gedanke an den Prozeß verließ ihn nicht mehr. Öfters schon hatte er überlegt, ob es nicht gut wäre, eine Verteidigung zu schreiben und sie bei dem Gericht einzureichen.'), 'de')
  // português com um nome estrangeiro no meio: NÃO é defeito
  assert.equal(r.ficouNaOrigem('Heathcliff entrou na sala sem dizer nada, e Catherine Earnshaw olhou para ele como se não o reconhecesse depois de tantos anos longe da casa.'), null)
  // frase curta: não dá para medir, então não se mexe
  assert.equal(r.ficouNaOrigem('The window was open.'), null)
})

test('revisora: o glossário troca a palavra inteira e respeita a caixa', async () => {
  const r = await import('./revisao.mjs')
  // O exemplo era "queer" até 20/09, quando a auditoria derrubou essa entrada
  // (adjetivo estrangeiro: a flexão depende da frase). "flanel" é substantivo
  // e faz o mesmo serviço aqui.
  const { html, usadas } = r.aplicarGlossarioNoHtml('<p>A camisa de flanel, e Flanel outra vez.</p>')
  assert.match(html, /camisa de flanela/)
  assert.match(html, /Flanela outra vez/, 'maiúscula do original é preservada')
  assert.ok(usadas.includes('flanel'))
  // não casa dentro de outra palavra
  assert.equal(r.aplicarGlossarioNoHtml('<p>flanelinha</p>').usadas.length, 0)
})

test('revisora: o glossário nunca escreve dentro de uma tag', async () => {
  const r = await import('./revisao.mjs')
  const entrada = '<p class="flanel"><a href="/flanel">flanel</a></p>'
  const { html } = r.aplicarGlossarioNoHtml(entrada)
  assert.match(html, /class="flanel"/, 'a classe fica intacta')
  assert.match(html, /href="\/flanel"/, 'o endereço fica intacto')
  assert.match(html, />flanela</, 'só o texto é trocado')
})

test('revisora: conserta número por extenso quebrado', async () => {
  const r = await import('./revisao.mjs')
  assert.match(r.consertarNumeros('<p>ele aumentou para trêscentos de mil</p>').html, /trezentos/)
  assert.match(r.consertarNumeros('<p>um exército de vinte e cincocentos homens</p>').html, /quinhentos/)
})

test('revisora: TRAVA do tamanho — troca que encolhe ou incha é recusada', async () => {
  const r = await import('./revisao.mjs')
  const antes = '<p>' + 'uma frase inteira e comprida que diz alguma coisa. '.repeat(10) + '</p>'
  assert.equal(r.trocaSegura(antes, '<p>curto</p>').pode, false)
  assert.equal(r.trocaSegura(antes, '<p>' + 'texto '.repeat(400) + '</p>').pode, false)
})

test('revisora: TRAVA da prova — só grava se ficou MAIS português', async () => {
  const r = await import('./revisao.mjs')
  const alemao = '<p>Der Gedanke an den Prozeß verließ ihn nicht mehr, und er hatte schon oft überlegt, ob es nicht gut wäre.</p>'
  const portugues = '<p>O pensamento do processo não o deixava mais, e ele já tinha pensado muitas vezes se não seria bom.</p>'
  assert.equal(r.trocaSegura(alemao, portugues).pode, true, 'alemão → português passa')
  assert.equal(r.trocaSegura(portugues, alemao).pode, false, 'português → alemão é recusado')
  // o motor devolvendo a mesma língua de novo (o caso que mais acontece)
  const outroAlemao = '<p>Der Gedanke an das Verfahren verließ ihn nicht mehr, und er hatte schon oft gedacht, dass es gut wäre.</p>'
  assert.equal(r.trocaSegura(alemao, outroAlemao).pode, false, 'voltou em alemão: recusa')
})

test('revisora: TRAVA da marcação — troca que perde tag é recusada', async () => {
  const r = await import('./revisao.mjs')
  const antes = '<p>O pensamento do <em>processo</em> não o deixava mais em paz nenhum instante.</p>'
  const depois = '<p>O pensamento do processo não o deixava mais em paz nenhum instante hoje.</p>'
  assert.equal(r.trocaSegura(antes, depois, { exigirMaisPortugues: false }).pode, false)
})

test('revisora: o desfazer devolve o capítulo exatamente como estava', async () => {
  const r = await import('./revisao.mjs')
  const b = bd()
  r.garantirTabelas(b)
  const original = '<p>A camisa de flanel estava na mesa.</p>'
  const cap = b.prepare('SELECT id, corpo FROM capitulo LIMIT 1').get()
  if (!cap) return // banco de teste sem capítulo: nada a provar aqui
  const antes = cap.corpo
  b.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?').run(original, cap.id)
  const trocado = r.aplicarGlossarioNoHtml(original).html
  b.prepare(`INSERT INTO revisao_troca (texto_id, capitulo_id, tipo, regra, antes, depois, estado)
    VALUES (0, ?, 'glossario', 'flanel', ?, ?, 'aplicada')`).run(cap.id, original, trocado)
  b.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?').run(trocado, cap.id)
  assert.match(b.prepare('SELECT corpo FROM capitulo WHERE id = ?').get(cap.id).corpo, /flanela/)
  assert.equal(r.desfazer(b, { textoId: 0 }), 1)
  assert.equal(b.prepare('SELECT corpo FROM capitulo WHERE id = ?').get(cap.id).corpo, original, 'voltou byte a byte')
  b.prepare('UPDATE capitulo SET corpo = ? WHERE id = ?').run(antes, cap.id)
})

test('revisora: o painel não consegue gravar um modo inventado', async () => {
  const ajustes = await import('./ajustes.mjs')
  const b = bd()
  ajustes.escrever(b, 'revisora', 'propor')
  assert.equal(ajustes.ler(b, 'revisora'), 'propor')
  assert.throws(() => ajustes.escrever(b, 'revisora', 'aplicarr'), /inválido/)
  assert.equal(ajustes.ler(b, 'revisora'), 'propor', 'o valor bom continua lá')
})

test('revisora: corta texto comprido em frases inteiras, nunca no meio de uma', async () => {
  const r = await import('./revisao.mjs')
  const frase = 'Ele caminhou até a porta e bateu três vezes sem obter resposta nenhuma. '
  const pedacos = r.emPedacos(frase.repeat(30), 300)
  assert.ok(pedacos.length > 1, 'texto grande vira vários pedaços')
  for (const p of pedacos) {
    assert.ok(p.length <= 400, 'nenhum pedaço estoura muito o teto: ' + p.length)
    assert.match(p.trim(), /[.!?…»"”]$/, 'todo pedaço fecha numa frase')
  }
  assert.equal(pedacos.join(' ').replace(/[ ]+/g, ' ').trim(), frase.repeat(30).replace(/[ ]+/g, ' ').trim(), 'nada se perde no corte')
  // frase sozinha maior que o teto vai inteira, e não picada
  const semPonto = 'palavra '.repeat(200)
  assert.equal(r.emPedacos(semPonto, 100).length, 1)
})

test('nomes: acha o personagem que o tradutor comeu, pela contagem', async () => {
  const n = await import('./nomes-do-livro.mjs')
  // o original diz "White Fang" muitas vezes; a nossa tradução diz "Fingão
  // Branco" o mesmo tanto, e nenhuma das duas aparece do outro lado
  const original = new Map([['White Fang', 243], ['Beauty Smith', 60], ['Alce', 9]])
  const nossa = new Map([['Fingão Branco', 241], ['Beauty Smith', 58], ['Alce', 9]])
  const r = n.casarPorFrequencia(nossa, original)
  assert.equal(r.casados.length, 1)
  assert.deepEqual(
    { de: r.casados[0].de, para: r.casados[0].para },
    { de: 'Fingão Branco', para: 'White Fang' })
})

test('nomes: na dúvida entre dois candidatos, não casa nenhum', async () => {
  const n = await import('./nomes-do-livro.mjs')
  const original = new Map([['White Fang', 100]])
  // dois nomes nossos com a MESMA contagem: escolher seria chutar
  const nossa = new Map([['Fingão Branco', 100], ['Presa Branca', 98]])
  assert.equal(n.casarPorFrequencia(nossa, original).casados.length, 0)
})

test('nomes: contagem distante não casa, e nome raro nem entra', async () => {
  const n = await import('./nomes-do-livro.mjs')
  assert.equal(n.casarPorFrequencia(new Map([['Outro', 40]]), new Map([['White Fang', 100]])).casados.length, 0,
    'contagem 40 contra 100 não é o mesmo personagem')
  assert.equal(n.casarPorFrequencia(new Map([['Outro', 4]]), new Map([['Nome', 5]])).casados.length, 0,
    'abaixo do piso de 8 aparições não se arrisca')
})

test('nomes: tira do texto os nomes próprios e ignora começo de frase', async () => {
  const n = await import('./nomes-do-livro.mjs')
  const contas = n.nomesDe('<p>Depois disso Heathcliff saiu. Catherine olhou para Heathcliff. Ele sorriu para Catherine.</p>')
  assert.equal(contas.get('Heathcliff'), 2, 'os dois Heathcliff estão no meio da frase')
  // "Catherine olhou..." abre a frase, e no começo de frase TODA palavra tem
  // maiúscula: essa não conta. Sobra a de "Ele sorriu para Catherine".
  // A contagem sai menor que a verdadeira de propósito — e como a comparação
  // com o original usa a mesma régua dos dois lados, a subtração continua
  // valendo.
  assert.equal(contas.get('Catherine'), 1)
  assert.equal(contas.get('Depois'), undefined, '"Depois" é começo de frase, não nome')
  assert.equal(contas.get('Ele'), undefined)
})

// ─────────────────────────────────────────────────────────────
// A AUDITORIA DA REVISORA, virada em teste (20/09/2026)
//
// Depois de 1.504 trocas aplicadas, a auditoria (ingestao/auditar-revisora.mjs)
// achou cinco entradas minhas que criavam frases sem sentido — o oposto do
// serviço. Tudo foi desfeito e as entradas saíram. Os testes abaixo são para
// que elas não voltem por distração, minha ou de quem vier depois.
// ─────────────────────────────────────────────────────────────

test('glossário: toda entrada é de uma classe que se troca sem ler a frase', async () => {
  const r = await import('./revisao.mjs')
  const entradas = r.glossario()
  assert.ok(entradas.length > 15, 'o glossário não pode ter esvaziado')
  for (const e of entradas) {
    assert.ok(r.CLASSES.has(e.classe), `"${e.de}" tem classe inválida: ${e.classe}`)
    assert.ok(e.onde, `"${e.de}" não traz a frase em que foi vista`)
  }
})

test('glossário: adjetivo e verbo estrangeiros NÃO podem voltar', async () => {
  const r = await import('./revisao.mjs')
  const tem = (p) => r.glossario().some((e) => e.de === p)
  // As cinco que a auditoria derrubou. Cada uma virou frase errada no ar:
  //   'armadilha queer' → 'armadilha estranho'   (era estranha)
  //   'os homens gays'  → 'os homens vistosas'   (era vistosos)
  //   'bandeiras fluttered' → 'esvoaçou'         (era esvoaçaram)
  for (const p of ['queer', 'gays', 'fluttered', 'fluttering', 'gurgling', 'jingling']) {
    assert.equal(tem(p), false, `"${p}" voltou ao glossário: a flexão dele depende da frase`)
  }
})

test('glossário: a palavra errada carrega a flexão que a certa precisa', async () => {
  const r = await import('./revisao.mjs')
  // As duas formas de "dionisíaco" são DUAS entradas justamente por isso:
  // cada palavra errada já diz o gênero, então a certa é única.
  const g = r.glossario()
  const m = g.find((e) => e.de === 'diônico')
  const f = g.find((e) => e.de === 'diônica')
  assert.equal(m?.para, 'dionisíaco')
  assert.equal(f?.para, 'dionisíaca')
  // e o mesmo para número no verbo
  assert.equal(g.find((e) => e.de === 'tremiava')?.para, 'tremia')
  assert.equal(g.find((e) => e.de === 'tremiavam')?.para, 'tremiam')
})

test('revisora: composto com hífen fica intacto (o caso Gay-Head / yew-tree)', async () => {
  const r = await import('./revisao.mjs')
  // "Gay-Headers" é gente de Gay Head, um lugar em Moby Dick. A primeira
  // versão escreveu "Vistosas-Headers" no livro.
  assert.equal(r.aplicarGlossarioNoHtml('<p>chamados de "Gay-Headers".</p>').usadas.length, 0)
  // "yew-tree" virou "teixo-tree": meia palavra traduzida.
  const y = r.aplicarGlossarioNoHtml('<p>a sombra de uma grande yew-tree.</p>')
  assert.equal(y.usadas.length, 0)
  assert.match(y.html, /yew-tree/)
  // mas a palavra sozinha continua sendo trocada
  assert.match(r.aplicarGlossarioNoHtml('<p>atrás de uma yew, e vi sua figura.</p>').html, /teixo/)
})

test('revisora: o glossário está agrupado por família, e nenhuma sumiu', async () => {
  const r = await import('./revisao.mjs')
  const familias = Object.fromEntries(r.porIdioma())
  // inglês deixado para trás, espanhol do tradutor escorregando, e português
  // inventado — as três famílias que o raio-x achou
  for (const f of ['en', 'es', 'pt']) assert.ok(familias[f] > 0, `a família ${f} sumiu do glossário`)
})

// ─────────────────────────────────────────────────────────────
// O DIVISOR DE CAPÍTULOS DA ESTEIRA (21/09/2026)
//
// 12 das 53 traduções mais recentes saíram num capítulo só — Júlia, ou a
// Nova Heloísa com 296.623 palavras numa página. Cada teste abaixo é uma forma
// medida num original de verdade, e cada trava é um estrago que a primeira
// versão do conserto causou e a medida pegou.
// ─────────────────────────────────────────────────────────────

const livroDe = (...partes) => partes.join('\n\n\n') + '\n'
const miolo = (n) => Array.from({ length: n }, (_, i) => `Parágrafo ${i + 1} de um texto de verdade, longo o bastante para não ser cabeçalho de nada.`).join('\n\n')

test('capítulos: a marca embrulhada em *negrito* e _itálico_ do Gutenberg', async () => {
  const { emCapitulos } = await import('./servicos/traducao.mjs')
  const cs = emCapitulos(livroDe('*CHAPTER I*', miolo(3), '*CHAPTER II*', miolo(3), '*CHAPTER III*', miolo(3)))
  assert.equal(cs.length, 3)
  assert.equal(cs[0].titulo, 'CHAPTER I', 'o título sai sem o embrulho')
  assert.equal(emCapitulos(livroDe('_I_', miolo(3), '_II_', miolo(3))).length, 2)
})

test('capítulos: cartas, alemão, francês e o número por extenso com travessão', async () => {
  const { emCapitulos } = await import('./servicos/traducao.mjs')
  assert.equal(emCapitulos(livroDe('Letter I. To Eloisa.', miolo(2), 'Letter II. To Eloisa.', miolo(2), 'Letter III. Answer.', miolo(2))).length, 3, 'Júlia')
  assert.equal(emCapitulos(livroDe('Erstes Hauptstück:', miolo(2), 'Zweites Hauptstück:', miolo(2))).length, 2, 'Nietzsche')
  assert.equal(emCapitulos(livroDe('CHAPITRE PREMIER.', miolo(2), 'CHAPITRE II.', miolo(2))).length, 2, 'Tocqueville')
  assert.equal(emCapitulos(livroDe('CHAPTER. I.', miolo(2), 'CHAPTER. II.', miolo(2))).length, 2, 'Locke, com ponto no meio')
  assert.equal(emCapitulos(livroDe('ONE -- The Absence of Mr Glass', miolo(2), 'TWO -- The Paradise of Thieves', miolo(2))).length, 2, 'Padre Brown')
})

test('capítulos: cabeçalho de página repetido NÃO vira capítulo (TOME PREMIER. ×61)', async () => {
  const { emCapitulos } = await import('./servicos/traducao.mjs')
  // o cabeçalho a cada página, e dois capítulos de verdade no meio
  const paginas = []
  for (let p = 0; p < 12; p++) {
    if (p === 0) paginas.push('CHAPITRE I.')
    if (p === 6) paginas.push('CHAPITRE II.')
    paginas.push('TOME PREMIER.', miolo(2))
  }
  const cs = emCapitulos(livroDe(...paginas))
  assert.equal(cs.length, 2, 'só os dois capítulos: ' + cs.map((c) => c.titulo).join(' | '))
})

test('capítulos: livro em volumes que RECOMEÇA a numeração continua inteiro (Udolpho)', async () => {
  const { emCapitulos } = await import('./servicos/traducao.mjs')
  const vol = () => ['CHAPTER I', miolo(4), 'CHAPTER II', miolo(4), 'CHAPTER III', miolo(4)]
  const cs = emCapitulos(livroDe('VOLUME ONE', ...vol(), 'VOLUME TWO', ...vol(), 'VOLUME THREE', ...vol()))
  // a primeira versão da trava descartava "CHAPTER I" por aparecer 3 vezes, e
  // Udolpho caiu de 62 capítulos para 9
  assert.ok(cs.length >= 9, 'os nove capítulos continuam: ' + cs.length)
})

test('capítulos: partes com o mesmo título, longe uma da outra, ficam separadas (Gibbon)', async () => {
  const { emCapitulos } = await import('./servicos/traducao.mjs')
  const longe = miolo(60) // bem mais de uma página impressa
  const t = 'Chapter I: The Extent Of The Empire In The Age Of The'
  const cs = emCapitulos(livroDe(t, longe, t, longe, t, longe, 'Chapter II: The Internal Prosperity', longe))
  assert.equal(cs.length, 4, 'as três partes do capítulo I e o capítulo II')
})

test('capítulos: linha quebrada no meio do parágrafo não é cabeçalho', async () => {
  const { emCapitulos } = await import('./servicos/traducao.mjs')
  // o .txt quebra a cada ~70 letras: "first letter. And when…" chegou a abrir
  // um capítulo em A Vida dos Doze Césares
  const txt = livroDe('CHAPTER I', 'Ele escreveu a\nfirst letter. And when it came back\nnada mudou.', miolo(3), 'CHAPTER II', miolo(3))
  assert.equal(emCapitulos(txt).length, 2)
})
