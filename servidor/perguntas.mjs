// A recuperação de senha sem e-mail.
//
// O caminho antigo era o de sempre: esqueci a senha → chega um link no
// e-mail → clica → troca. Ele funciona, mas amarra a conta a uma caixa de
// mensagens que não é nossa. Quem perde o acesso ao e-mail perde a conta, e
// quem tem o e-mail invadido tem a conta junto — o link é a chave mestra.
//
// Aqui a chave é o que a pessoa SABE. No cadastro ela escolhe perguntas e
// responde; para recuperar, responde de novo. Se não souber, perdeu a conta,
// e isso é dito na cara antes de ela terminar o cadastro. É uma troca
// deliberada: menos conveniência, nenhuma dependência de terceiro.
//
// Três decisões que sustentam isso:
//
//   A RESPOSTA É UMA SENHA. Nunca é gravada em texto — mesmo scrypt, mesmo
//   sal por resposta, mesma comparação em tempo constante. Um vazamento do
//   banco não entrega o nome do primeiro cachorro de ninguém.
//
//   A RESPOSTA É NORMALIZADA ANTES DE VIRAR HASH. "São Paulo", "sao paulo"
//   e " SAO  PAULO " são a mesma resposta. Sem isso a pergunta de segurança
//   vira uma adivinhação de acentuação, e o dono legítimo é o que mais erra.
//
//   O E-MAIL NÃO VOLTA A SER LIVRE. Perder a conta não apaga a conta: o
//   registro fica, desativado, e aquele endereço não serve para abrir outra.
//   Sem isso "esqueci a resposta" viraria "crio outra e pronto", e a
//   pergunta de segurança não protegeria nada.

import { randomBytes, createHash } from 'node:crypto'
import { guardarSenha, conferirSenha } from './seguranca.mjs'

/** Quantas perguntas a conta guarda, e quantas precisam bater para recuperar. */
export const QUANTAS = 3
export const PRECISA_ACERTAR = 3

/**
 * O CATÁLOGO. Não é sugestão: é a lista de onde as três têm que sair.
 *
 * São perguntas cuja resposta não está no perfil de rede social de ninguém —
 * o defeito clássico da pergunta de segurança é "nome de solteira da sua
 * mãe", que qualquer pessoa descobre. Estas puxam memória, não cadastro.
 *
 * ── por que texto livre saiu ──────────────────────────────────
 *
 * Antes, `pergunta` era texto livre. A auditoria de 09/09/2026 mostrou o que
 * isso custava: `perguntasDe` disfarça o e-mail que não existe devolvendo
 * três perguntas sorteadas DESTA lista, e a lista é pública
 * (`GET /api/sugestoes`). O disfarce só funciona enquanto tudo o que a rota
 * devolve puder ter vindo dela.
 *
 * Quem escrevia a própria pergunta furava o disfarce sozinho: a resposta
 * trazia um texto que não está no catálogo, e isso PROVA que a conta existe.
 * Bastava varrer endereços para montar a lista de quem tem conta aqui.
 *
 * Então a escolha passou a ser fechada, e a lista cresceu para vinte e
 * quatro em troca. Perde-se a pergunta sob medida; ganha-se que o disfarce
 * volte a ser um disfarce.
 */
export const SUGESTOES = [
  'Qual foi o primeiro livro que você leu inteiro por vontade própria?',
  'Qual o nome da rua onde você morava quando tinha dez anos?',
  'Qual apelido só a sua família usava com você?',
  'Qual foi o primeiro show ou espetáculo a que você foi?',
  'Qual professor marcou a sua escola, e de que matéria?',
  'Qual foi o nome do seu primeiro animal de estimação?',
  'Qual prato alguém da sua família fazia melhor que qualquer restaurante?',
  'Em que cidade você estava na virada do ano 2000 — ou do ano em que nasceu?',
  'Qual filme você viu tantas vezes que sabe as falas?',
  'Qual objeto você guarda até hoje sem conseguir explicar por quê?',
  'Qual foi o primeiro disco ou álbum que você ouviu do começo ao fim?',
  'Qual era o nome do seu melhor amigo de infância?',
  'Que lugar da sua cidade você evitava quando era criança, e por quê?',
  'Qual foi o primeiro dinheiro que você ganhou trabalhando, e no quê?',
  'Qual cheiro te leva direto para a casa de alguém da sua família?',
  'Qual foi a primeira viagem que você fez sem os seus pais?',
  'Que matéria da escola você era bom sem nunca ter estudado?',
  'Qual foi o primeiro jogo que você terminou até o fim?',
  'Qual era o apelido do lugar onde a sua turma se encontrava?',
  'Que presente você recebeu e nunca usou uma vez sequer?',
  'Qual foi a primeira coisa que você consertou sozinho?',
  'Que música tocava sem parar no ano em que você terminou a escola?',
  'Qual professor você reencontraria hoje só para dizer obrigado?',
  'Qual foi o primeiro livro que você leu duas vezes seguidas?',
]

// O catálogo achatado, para conferir se uma pergunta veio de lá. Montado na
// primeira consulta porque `normalizar` está declarado abaixo — lê-lo aqui
// em cima estoura na carga do módulo.
let catalogoAchatado = null
const doCatalogo = (p) => {
  catalogoAchatado ??= new Set(SUGESTOES.map(normalizar))
  return catalogoAchatado.has(normalizar(p))
}

/**
 * Como a resposta é comparada.
 *
 * Minúsculas, sem acento, sem pontuação, espaços colapsados. É deliberado
 * que isto seja generoso: a pergunta de segurança existe para o dono passar,
 * não para o dono ser reprovado por ter digitado "Sao Paulo" em vez de
 * "São Paulo" três anos depois.
 *
 * O que NÃO se faz é ignorar as palavras: "rua das flores" e "flores" são
 * respostas diferentes, e continuam sendo.
 */
export const normalizar = (r) => String(r ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** Uma resposta serve? Curta demais não protege nada. */
export function conferirResposta_(r) {
  const n = normalizar(r)
  if (n.length < 3) return 'Cada resposta precisa de pelo menos 3 letras.'
  if (n.length > 200) return 'Resposta longa demais.'
  return null
}

/**
 * A pergunta tem que ser uma das do catálogo.
 *
 * Não é frescura de validação: é o que faz `perguntasDe` conseguir esconder
 * quem tem conta aqui. Uma pergunta escrita à mão é impossível de forjar para
 * um e-mail que não existe, e por isso denuncia todos os que existem.
 */
export function conferirPergunta_(p) {
  const t = String(p ?? '').trim()
  if (!t) return 'Escolha uma pergunta da lista.'
  if (!doCatalogo(t)) {
    return 'Escolha uma pergunta da lista. Pergunta escrita à mão entregaria '
      + 'que esta conta existe para quem estivesse varrendo endereços.'
  }
  return null
}

/**
 * Valida e prepara o conjunto que vai para o banco.
 *
 * Recusa perguntas repetidas e respostas repetidas: três perguntas com a
 * mesma resposta valem por uma, e quem faz isso normalmente não percebeu.
 */
export async function prepararConjunto(perguntas) {
  if (!Array.isArray(perguntas) || perguntas.length !== QUANTAS) {
    return { erro: `Escolha ${QUANTAS} perguntas e responda todas.` }
  }

  const vistas = new Set()
  const respostasVistas = new Set()
  const prontas = []

  for (const [i, item] of perguntas.entries()) {
    const p = String(item?.pergunta ?? '').trim()
    const r = String(item?.resposta ?? '')

    const problemaP = conferirPergunta_(p)
    if (problemaP) return { erro: problemaP }
    const problemaR = conferirResposta_(r)
    if (problemaR) return { erro: problemaR }

    const chaveP = normalizar(p)
    if (vistas.has(chaveP)) return { erro: 'Duas perguntas iguais não protegem mais que uma.' }
    vistas.add(chaveP)

    const chaveR = normalizar(r)
    if (respostasVistas.has(chaveR)) {
      return { erro: 'Duas respostas iguais não protegem mais que uma.' }
    }
    respostasVistas.add(chaveR)

    const s = await guardarSenha(chaveR)
    prontas.push({ ordem: i + 1, pergunta: p, hash: s.hash, sal: s.sal, params: s.params })
  }

  return { prontas }
}

export function gravarConjunto(banco, leitorId, prontas) {
  banco.prepare('DELETE FROM pergunta WHERE leitor_id = ?').run(leitorId)
  const poe = banco.prepare(
    `INSERT INTO pergunta (leitor_id, ordem, pergunta, resposta_hash, resposta_sal, resposta_params)
     VALUES (?,?,?,?,?,?)`)
  for (const p of prontas) poe.run(leitorId, p.ordem, p.pergunta, p.hash, p.sal, p.params)
}

/**
 * As perguntas de um e-mail — e o problema que isso cria.
 *
 * Para responder, a pessoa precisa VER as perguntas. Só que devolver
 * "não existe" para um e-mail e três perguntas para outro transforma este
 * endereço numa máquina de descobrir quem tem conta aqui, que é exatamente o
 * vazamento que o resto do módulo de contas evita com cuidado.
 *
 * A saída é responder sempre com três perguntas. Para um e-mail que não
 * existe elas são sorteadas do catálogo de sugestões de um jeito ESTÁVEL —
 * derivadas do próprio endereço — para que o mesmo e-mail inexistente
 * devolva sempre as mesmas três, como uma conta de verdade devolveria. As
 * respostas, claro, nunca conferem.
 *
 * Isto não engana o usuário sobre o produto: engana quem está varrendo a
 * base atrás de endereços válidos.
 */
export function perguntasDe(banco, email) {
  const l = banco.prepare('SELECT id FROM leitor WHERE email = ? AND desativado = 0').get(email)
  if (l) {
    const ps = banco.prepare(
      'SELECT ordem, pergunta FROM pergunta WHERE leitor_id = ? ORDER BY ordem').all(l.id)
    if (ps.length) return { perguntas: ps.map(p => ({ ordem: p.ordem, pergunta: p.pergunta })) }
  }
  return { perguntas: fingidas(banco, email) }
}

/**
 * O segredo desta instalação, criado na primeira vez que alguém precisa dele.
 *
 * Sem ele o disfarce não disfarça: `SUGESTOES` é público — `GET /api/sugestoes`
 * serve a lista inteira — então um hash sem chave sobre o e-mail pode ser
 * recalculado por qualquer um, e QUALQUER divergência entre o que a rota
 * devolve e o que o atacante calculou prova que a conta existe.
 *
 * Com a chave, o conjunto fingido deixa de ser previsível de fora.
 */
function segredoDaCasa(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS ajuste (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)`)
  const achado = banco.prepare("SELECT valor FROM ajuste WHERE chave = 'segredo_perguntas'").get()
  if (achado) return achado.valor
  const novo = randomBytes(32).toString('base64url')
  banco.prepare("INSERT INTO ajuste (chave, valor) VALUES ('segredo_perguntas', ?)").run(novo)
  return novo
}

function fingidas(banco, email) {
  const semente = createHash('sha256')
    .update(`${segredoDaCasa(banco)}:${email}`)
    .digest()
  const escolhidas = []
  for (let i = 0; escolhidas.length < QUANTAS && i < semente.length; i++) {
    const q = SUGESTOES[semente[i] % SUGESTOES.length]
    if (!escolhidas.includes(q)) escolhidas.push(q)
  }
  return escolhidas.map((pergunta, i) => ({ ordem: i + 1, pergunta }))
}

/**
 * As respostas batem?
 *
 * Gasta o mesmo tempo quando a conta não existe: sem isso, "não existe"
 * responde num piscar e "resposta errada" leva meio segundo, e o relógio
 * conta o que o corpo da resposta esconde.
 */
export async function conferirConjunto(banco, leitorId, respostas) {
  const guardadas = banco.prepare(
    'SELECT ordem, resposta_hash, resposta_sal, resposta_params FROM pergunta WHERE leitor_id = ? ORDER BY ordem',
  ).all(leitorId)

  if (guardadas.length !== QUANTAS) return false

  let acertos = 0
  for (const g of guardadas) {
    const dada = respostas?.find(r => Number(r?.ordem) === g.ordem)?.resposta
    const ok = await conferirSenha(normalizar(dada), g.resposta_hash, g.resposta_sal, g.resposta_params)
    if (ok) acertos++
  }
  return acertos >= PRECISA_ACERTAR
}

/** Um tempo à toa com a mesma cara do trabalho de verdade. */
export async function fingirTrabalho() {
  for (let i = 0; i < QUANTAS; i++) {
    await guardarSenha(randomBytes(12).toString('hex'))
  }
}
