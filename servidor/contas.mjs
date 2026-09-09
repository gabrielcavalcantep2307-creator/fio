// As contas: criar, entrar, sair, esquecer a senha.
//
// Toda a regra de negócio mora aqui; api.mjs só traduz HTTP. Isso é o que
// permite testar login sem subir servidor nenhum (veja `npm test`).

import {
  guardarSenha, conferirSenha, gastarTempoAtoa, sortearToken, resumo,
  sortearConvite, normalizarConvite, freio, perdoar, conferirEmail, conferirSenha_, dicaDeIp,
} from './seguranca.mjs'
import {
  prepararConjunto, gravarConjunto, perguntasDe, conferirConjunto, fingirTrabalho,
  SUGESTOES, QUANTAS,
} from './perguntas.mjs'

const DIAS_DE_SESSAO = 30
const DIAS_DE_CONVITE = 14

/** Erro que PODE ser mostrado ao usuário. Qualquer outro vira "deu ruim". */
export class Recusa extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status }
}

const publico = (l) => ({ id: l.id, nome: l.nome, email: l.email, papel: l.papel })

// ─────────────────────────────────────────────────────────────
// Criar conta
//
// A porta era fechada: sem convite, sem conta. O dono do acervo abriu — e a
// abertura é uma DECISÃO DE OPERAÇÃO, não uma linha apagada do código:
// `FIO_CONVITE=obrigatorio` fecha tudo de novo sem tocar em nada aqui.
//
// O convite continua existindo e continua sendo consumido quando vem. Quem
// tem um código na mão não recebe silêncio: código errado é recusado mesmo
// com a porta aberta — aceitar caladamente um convite inválido faria a
// pessoa achar que gastou o convite dela.
// ─────────────────────────────────────────────────────────────

export const portaAberta = () => process.env.FIO_CONVITE !== 'obrigatorio'

export async function criar(banco, { nome, email, senha, convite, perguntas }, ctx = {}) {
  const emLimite = freio(banco, 'criar', dicaDeIp(ctx.ip) ?? 'sem-ip')
  if (!emLimite.passa) throw new Recusa('Muitas tentativas. Tente daqui a pouco.', 429)

  const limpo = conferirEmail(email)
  if (!limpo) throw new Recusa('Esse e-mail não parece válido.')
  const problema = conferirSenha_(senha)
  if (problema) throw new Recusa(problema)
  const nomeLimpo = String(nome ?? '').trim().slice(0, 80)
  if (nomeLimpo.length < 2) throw new Recusa('Diga como quer ser chamado.')

  // As perguntas de segurança são OBRIGATÓRIAS, e são conferidas antes de a
  // conta existir. Sem elas não há recuperação nenhuma — não há link de
  // e-mail para cair de volta — e uma conta sem recuperação é uma conta que
  // se perde na primeira senha esquecida.
  const conjunto = await prepararConjunto(perguntas)
  if (conjunto.erro) throw new Recusa(conjunto.erro)

  const codigo = normalizarConvite(convite)
  let conv = null
  if (codigo) {
    conv = banco.prepare(
      `SELECT id FROM convite
        WHERE codigo_hash = ? AND usado_em IS NULL AND expira_em > datetime('now')`,
    ).get(resumo(codigo))
    if (!conv) throw new Recusa('Convite inválido, já usado ou vencido.')
  } else if (!portaAberta()) {
    throw new Recusa('Convite inválido, já usado ou vencido.')
  }

  if (banco.prepare('SELECT 1 FROM leitor WHERE email = ?').get(limpo)) {
    // Aqui dá para contar: quem cria conta já sabe o próprio e-mail, e a
    // alternativa é a pessoa não entender por que não consegue entrar.
    throw new Recusa('Já existe conta com esse e-mail. Tente entrar.')
  }

  const s = await guardarSenha(senha)
  const id = Number(banco.prepare(
    `INSERT INTO leitor (email, nome, senha_hash, senha_sal, senha_params) VALUES (?,?,?,?,?)`,
  ).run(limpo, nomeLimpo, s.hash, s.sal, s.params).lastInsertRowid)

  gravarConjunto(banco, id, conjunto.prontas)

  // A primeira conta da casa é a administradora. Sem isto, uma instalação
  // nova não tem ninguém que possa convidar ou revisar, e a única saída seria
  // mexer no banco por fora.
  if (banco.prepare('SELECT COUNT(*) q FROM leitor').get().q === 1) {
    banco.prepare("UPDATE leitor SET papel = 'admin' WHERE id = ?").run(id)
  }

  if (conv) {
    banco.prepare(`UPDATE convite SET usado_por = ?, usado_em = datetime('now') WHERE id = ?`)
      .run(id, conv.id)
  }
  // deu certo: o histórico de tentativas daquele IP some
  perdoar(banco, 'criar', dicaDeIp(ctx.ip) ?? 'sem-ip')

  const leitor = banco.prepare('SELECT * FROM leitor WHERE id = ?').get(id)
  return { pessoa: publico(leitor), sessao: abrirSessao(banco, id, ctx) }
}


// ─────────────────────────────────────────────────────────────
// Entrar
// ─────────────────────────────────────────────────────────────

export async function entrar(banco, { email, senha }, ctx = {}) {
  const limpo = conferirEmail(email) ?? 'nao-existe@invalido'

  // Duas contas: uma protege esta conta, outra protege todas.
  for (const chave of [limpo, dicaDeIp(ctx.ip) ?? 'sem-ip']) {
    if (!freio(banco, 'entrar', chave).passa) {
      throw new Recusa('Muitas tentativas. Espere alguns minutos.', 429)
    }
  }

  const l = banco.prepare('SELECT * FROM leitor WHERE email = ? AND desativado = 0').get(limpo)

  // Sempre gaste o mesmo tempo, exista a conta ou não.
  if (!l) {
    await gastarTempoAtoa()
    throw new Recusa('E-mail ou senha não conferem.', 401)
  }
  if (!(await conferirSenha(senha ?? '', l.senha_hash, l.senha_sal, l.senha_params))) {
    throw new Recusa('E-mail ou senha não conferem.', 401)
  }

  perdoar(banco, 'entrar', limpo)
  banco.prepare(`UPDATE leitor SET visto_em = datetime('now') WHERE id = ?`).run(l.id)
  return { pessoa: publico(l), sessao: abrirSessao(banco, l.id, ctx) }
}

// ─────────────────────────────────────────────────────────────
// Sessão
// ─────────────────────────────────────────────────────────────

const TETO_DE_SESSOES = 12

export function abrirSessao(banco, leitorId, ctx = {}) {
  // Teto de sessões por conta. Sem ele, cada login deixa uma linha para trás
  // e a tabela cresce para sempre — e quem tiver a senha pode abrir milhares
  // de sessões que sobrevivem à troca de aparelho. Doze cobre celular,
  // computador e navegador anônimo com folga; acima disso, a mais velha sai.
  banco.prepare(
    `DELETE FROM sessao WHERE leitor_id = ? AND id NOT IN (
       SELECT id FROM sessao WHERE leitor_id = ? ORDER BY visto_em DESC LIMIT ?)`,
  ).run(leitorId, leitorId, TETO_DE_SESSOES - 1)

  const token = sortearToken()
  banco.prepare(
    `INSERT INTO sessao (leitor_id, token_hash, expira_em, agente, ip_dica)
     VALUES (?,?, datetime('now', ?), ?, ?)`,
  ).run(leitorId, resumo(token), `+${DIAS_DE_SESSAO} days`,
    String(ctx.agente ?? '').slice(0, 160) || null, dicaDeIp(ctx.ip))

  limparVencidos(banco)
  return { token, dias: DIAS_DE_SESSAO }
}

/**
 * Quem é o dono deste token. Renova a validade quando já passou da metade —
 * quem usa não é deslogado, quem sumiu expira.
 */
export function deQuemE(banco, token) {
  if (!token) return null
  const s = banco.prepare(
    `SELECT s.id, s.expira_em, l.* FROM sessao s
       JOIN leitor l ON l.id = s.leitor_id
      WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND l.desativado = 0`,
  ).get(resumo(token))
  if (!s) return null

  banco.prepare(
    `UPDATE sessao SET visto_em = datetime('now'),
            expira_em = datetime('now', ?)
      WHERE id = ? AND expira_em < datetime('now', ?)`,
  ).run(`+${DIAS_DE_SESSAO} days`, s.id, `+${DIAS_DE_SESSAO / 2} days`)

  return publico(s)
}

export const sair = (banco, token) =>
  token && banco.prepare('DELETE FROM sessao WHERE token_hash = ?').run(resumo(token))

export const sairDeTudo = (banco, leitorId) =>
  banco.prepare('DELETE FROM sessao WHERE leitor_id = ?').run(leitorId)

const limparVencidos = (banco) => {
  banco.prepare(`DELETE FROM sessao WHERE expira_em < datetime('now')`).run()
  // A tabela  é do tempo do link por e-mail. A limpeza fica:
  // instalações antigas ainda têm linhas lá, e apagar a tabela obrigaria a
  // uma migração destrutiva sem ganho nenhum — ela simplesmente para de
  // receber linhas novas.
  banco.prepare(`DELETE FROM recuperacao WHERE expira_em < datetime('now', '-1 day')`).run()
}

// ─────────────────────────────────────────────────────────────
// Esqueci a senha
// ─────────────────────────────────────────────────────────────

/** As sugestões e quantas a conta guarda, para a tela de cadastro montar. */
export const perguntasSugeridas = () => ({ sugestoes: SUGESTOES, quantas: QUANTAS })

/**
 * Passo 1: quais são as perguntas deste e-mail.
 *
 * Responde SEMPRE com três perguntas, exista a conta ou não — ver o comentário
 * em perguntas.mjs. Devolver "não existe" para um endereço e três perguntas
 * para outro transformaria esta rota numa máquina de descobrir quem tem conta
 * aqui, que é o vazamento que o resto deste módulo evita com cuidado.
 */
export function perguntasParaRecuperar(banco, { email }, ctx = {}) {
  const limpo = conferirEmail(email)
  const chave = limpo ?? dicaDeIp(ctx.ip) ?? 'sem-ip'
  if (!freio(banco, 'esqueci', chave).passa) {
    throw new Recusa('Muitas tentativas. Espere um pouco.', 429)
  }
  if (!limpo) throw new Recusa('Esse e-mail não parece válido.')
  return perguntasDe(banco, limpo)
}

/**
 * Passo 2: as respostas, e a senha nova junto.
 *
 * Tudo de uma vez, de propósito. O caminho em duas etapas — confere as
 * respostas, devolve um token, troca a senha com o token — precisaria guardar
 * um "pode trocar" em algum lugar, e esse algum lugar vira o novo alvo. Aqui
 * não existe estado intermediário: ou as respostas vieram certas no mesmo
 * pedido, ou nada acontece.
 *
 * O freio é o de sempre e é o que importa: três perguntas de memória são
 * adivinháveis por força bruta, e o que impede a força bruta é o limite de
 * tentativas, não a dificuldade da pergunta.
 */
export async function recuperarComRespostas(banco, { email, respostas, senha }, ctx = {}) {
  const limpo = conferirEmail(email)
  const chave = limpo ?? dicaDeIp(ctx.ip) ?? 'sem-ip'
  if (!freio(banco, 'responder', chave).passa) {
    throw new Recusa('Muitas tentativas. Espere um pouco antes de tentar de novo.', 429)
  }
  const problema = conferirSenha_(senha)
  if (problema) throw new Recusa(problema)

  const l = limpo
    ? banco.prepare('SELECT id FROM leitor WHERE email = ? AND desativado = 0').get(limpo)
    : null

  // O mesmo tempo, exista a conta ou não.
  if (!l) {
    await fingirTrabalho()
    throw new Recusa('As respostas não conferem.', 401)
  }

  if (!(await conferirConjunto(banco, l.id, respostas))) {
    throw new Recusa('As respostas não conferem.', 401)
  }

  const s = await guardarSenha(senha)
  banco.prepare(
    `UPDATE leitor SET senha_hash = ?, senha_sal = ?, senha_params = ?,
            senha_mudou = datetime('now') WHERE id = ?`,
  ).run(s.hash, s.sal, s.params, l.id)

  perdoar(banco, 'responder', limpo)

  // Trocar a senha derruba todas as sessões. Se a conta foi invadida, é isso
  // que expulsa o invasor — e é o motivo de a pessoa ter trocado.
  sairDeTudo(banco, l.id)
  return { ok: true }
}

/**
 * Trocar as próprias perguntas, estando dentro e sabendo a senha.
 *
 * Exige a senha atual pelo mesmo motivo que trocar de senha exige: um
 * computador deixado aberto não pode virar dono da conta — e trocar as
 * perguntas é justamente como alguém tomaria a conta para sempre.
 */
export async function trocarMinhasPerguntas(banco, leitorId, { atual, perguntas }, ctx = {}) {
  if (!freio(banco, 'senha', String(leitorId)).passa) {
    throw new Recusa('Muitas tentativas. Espere um pouco.', 429)
  }
  const l = banco.prepare('SELECT * FROM leitor WHERE id = ? AND desativado = 0').get(leitorId)
  if (!l) throw new Recusa('Conta não encontrada.', 404)
  if (!(await conferirSenha(atual ?? '', l.senha_hash, l.senha_sal, l.senha_params))) {
    throw new Recusa('A senha atual não confere.', 401)
  }

  const conjunto = await prepararConjunto(perguntas)
  if (conjunto.erro) throw new Recusa(conjunto.erro)

  gravarConjunto(banco, leitorId, conjunto.prontas)
  perdoar(banco, 'senha', String(leitorId))
  return { ok: true }
}

/** Quais perguntas eu escolhi — o texto delas, nunca as respostas. */
export const minhasPerguntas = (banco, leitorId) =>
  banco.prepare('SELECT ordem, pergunta FROM pergunta WHERE leitor_id = ? ORDER BY ordem')
    .all(leitorId)

// ─────────────────────────────────────────────────────────────
// A conta por dentro: nome, senha e aparelhos
//
// Estas existem porque uma conta que só serve para entrar não é conta, é
// catraca. Quem tem conta precisa poder trocar a senha sabendo a antiga (sem
// depender de e-mail), ver de que aparelhos ela está aberta, e fechar todos
// de uma vez no dia em que perder o celular.
// ─────────────────────────────────────────────────────────────

/**
 * Trocar a senha estando dentro. Exige a senha atual: um computador deixado
 * aberto no laboratório da facul não pode virar dono da conta.
 *
 * Como no "esqueci", trocar derruba TODAS as sessões — inclusive a de quem
 * está trocando. É o que expulsa quem não deveria estar lá, e é justamente o
 * motivo de alguém trocar a senha. Por isso devolvemos uma sessão nova: quem
 * trocou continua dentro, e todo o resto cai.
 */
export async function trocarMinhaSenha(banco, leitorId, { atual, nova }, ctx = {}) {
  if (!freio(banco, 'senha', String(leitorId)).passa) {
    throw new Recusa('Muitas tentativas. Espere alguns minutos.', 429)
  }
  const problema = conferirSenha_(nova)
  if (problema) throw new Recusa(problema)

  const l = banco.prepare('SELECT * FROM leitor WHERE id = ?').get(leitorId)
  if (!l) throw new Recusa('Conta não encontrada.', 404)
  if (!(await conferirSenha(String(atual ?? ''), l.senha_hash, l.senha_sal, l.senha_params))) {
    throw new Recusa('A senha atual não confere.', 401)
  }
  if (String(atual) === String(nova)) throw new Recusa('A senha nova é igual à antiga.')

  const s = await guardarSenha(nova)
  banco.prepare(
    `UPDATE leitor SET senha_hash = ?, senha_sal = ?, senha_params = ?,
            senha_mudou = datetime('now') WHERE id = ?`,
  ).run(s.hash, s.sal, s.params, leitorId)

  sairDeTudo(banco, leitorId)
  perdoar(banco, 'senha', String(leitorId))
  return { pessoa: publico(l), sessao: abrirSessao(banco, leitorId, ctx) }
}

/** Como a pessoa quer ser chamada. É o único campo de perfil que ela edita. */
export function mudarNome(banco, leitorId, { nome }) {
  const limpo = String(nome ?? '').trim().slice(0, 80)
  if (limpo.length < 2) throw new Recusa('Diga como quer ser chamado.')
  banco.prepare('UPDATE leitor SET nome = ? WHERE id = ?').run(limpo, leitorId)
  return { pessoa: publico(banco.prepare('SELECT * FROM leitor WHERE id = ?').get(leitorId)) }
}

/**
 * Os aparelhos em que a conta está aberta.
 *
 * Devolve a DICA do agente e do IP, nunca o token nem o resumo dele: esta
 * lista existe para a pessoa reconhecer o próprio celular, não para entregar
 * a quem invadiu um mapa do que atacar.
 */
export function minhasSessoes(banco, leitorId, tokenAtual) {
  const atual = tokenAtual ? resumo(tokenAtual) : null
  const linhas = banco.prepare(
    `SELECT id, token_hash, criado_em, visto_em, expira_em, agente, ip_dica
       FROM sessao WHERE leitor_id = ? ORDER BY visto_em DESC`,
  ).all(leitorId)
  return {
    sessoes: linhas.map(s => ({
      id: s.id,
      aparelho: apelidoDeAgente(s.agente),
      de: s.ip_dica,
      desde: s.criado_em,
      visto: s.visto_em,
      expira: s.expira_em,
      esta: atual != null && Buffer.from(s.token_hash).equals(atual),
    })),
  }
}

/** "Sair dos outros aparelhos": mantém este, derruba o resto. */
export function sairDosOutros(banco, leitorId, tokenAtual) {
  const s = tokenAtual && banco.prepare(
    'SELECT id FROM sessao WHERE leitor_id = ? AND token_hash = ?').get(leitorId, resumo(tokenAtual))
  const fora = s
    ? banco.prepare('DELETE FROM sessao WHERE leitor_id = ? AND id <> ?').run(leitorId, s.id)
    : banco.prepare('DELETE FROM sessao WHERE leitor_id = ?').run(leitorId)
  return { encerradas: fora.changes }
}

/** Uma etiqueta legível a partir do user-agent. Grosseira de propósito. */
function apelidoDeAgente(agente) {
  const a = String(agente ?? '')
  if (!a) return 'aparelho desconhecido'
  const sistema = /iPhone|iPad/i.test(a) ? 'iPhone' : /Android/i.test(a) ? 'Android'
    : /Windows/i.test(a) ? 'Windows' : /Mac OS X|Macintosh/i.test(a) ? 'Mac'
    : /Linux/i.test(a) ? 'Linux' : 'aparelho'
  const navegador = /Edg[/]/i.test(a) ? 'Edge' : /OPR[/]/i.test(a) ? 'Opera'
    : /Chrome[/]/i.test(a) ? 'Chrome' : /Firefox[/]/i.test(a) ? 'Firefox'
    : /Safari[/]/i.test(a) ? 'Safari' : 'navegador'
  return `${navegador} no ${sistema}`
}

/**
 * Levar tudo embora (LGPD, art. 18, V).
 *
 * Sai a conta, o que foi lido, o que foi marcado e as preferências — no mesmo
 * JSON que o navegador guarda. Nada de sessão e nada de hash de senha:
 * exportar não pode virar um jeito de vazar credencial.
 */
export function exportarTudo(banco, leitorId) {
  const l = banco.prepare(
    'SELECT id, email, nome, jurisdicao, papel, criado_em, visto_em FROM leitor WHERE id = ?',
  ).get(leitorId)
  if (!l) throw new Recusa('Conta não encontrada.', 404)
  return {
    exportadoEm: new Date().toISOString(),
    conta: l,
    guardado: lerGuardado(banco, leitorId).itens,
    avaliacoes: banco.prepare(
      'SELECT obra_id, nota, resenha, criado_em, mudou_em FROM avaliacao WHERE leitor_id = ?',
    ).all(leitorId),
  }
}


// ─────────────────────────────────────────────────────────────
// O que o leitor guardou, entre aparelhos
//
// A junção é "quem escreveu por último vence", **por registro**. Não é o
// conjunto que vence: duas marcações feitas em dois celulares diferentes
// sobrevivem às duas, porque cada uma é uma linha com o seu próprio relógio.
//
// Apagar também é uma escrita: vem com `valor: null` e um relógio novo. Sem
// isso, apagar num aparelho seria desfeito pela sincronia do outro — que é o
// bug clássico de quem trata ausência como "ainda não sei".
// ─────────────────────────────────────────────────────────────

const TIPOS = new Set(['progresso', 'marcacao', 'estante', 'prefs'])
const TETO_DE_REGISTROS = 5000
const TETO_DE_VALOR = 8 * 1024

export function lerGuardado(banco, leitorId) {
  const linhas = banco.prepare(
    'SELECT tipo, chave, valor, mudou_em FROM guardado WHERE leitor_id = ? AND valor IS NOT NULL',
  ).all(leitorId)
  return {
    itens: linhas.map(l => ({ tipo: l.tipo, chave: l.chave, valor: JSON.parse(l.valor), mudouEm: l.mudou_em })),
  }
}

export function guardar(banco, leitorId, { itens }) {
  // Freio mesmo para quem já entrou: uma conta comprometida não pode virar
  // uma torneira de escrita no disco da máquina.
  if (!freio(banco, 'guardar', String(leitorId)).passa) {
    throw new Recusa('Sincronizando rápido demais. Tente daqui a pouco.', 429)
  }
  if (!Array.isArray(itens)) throw new Recusa('Formato inesperado.')
  if (itens.length > 500) throw new Recusa('Muitos registros de uma vez.')

  const { n } = banco.prepare('SELECT COUNT(*) n FROM guardado WHERE leitor_id = ?').get(leitorId)
  const grava = banco.prepare(
    `INSERT INTO guardado (leitor_id, tipo, chave, valor, mudou_em) VALUES (?,?,?,?,?)
     ON CONFLICT (leitor_id, tipo, chave) DO UPDATE
       SET valor = excluded.valor, mudou_em = excluded.mudou_em
       WHERE excluded.mudou_em > guardado.mudou_em`)

  let novos = n
  banco.exec('BEGIN')
  try {
    for (const item of itens) {
      if (!TIPOS.has(item?.tipo) || typeof item.chave !== 'string' || item.chave.length > 120) continue
      const quando = Number(item.mudouEm)
      if (!Number.isFinite(quando) || quando <= 0) continue

      const valor = item.valor == null ? null : JSON.stringify(item.valor)
      if (valor && valor.length > TETO_DE_VALOR) continue
      // O teto existe para que uma conta não consiga encher o disco da
      // máquina. Apagar sempre passa; só criar registro novo é barrado.
      if (valor && novos >= TETO_DE_REGISTROS) continue

      grava.run(leitorId, item.tipo, item.chave, valor, Math.min(quando, Date.now() + 60000))
      novos++
    }
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }

  return lerGuardado(banco, leitorId)
}

/**
 * Apaga o que o leitor guardou — no servidor.
 *
 * Isto NÃO é um detalhe de LGPD: sem ele, "apagar tudo" no navegador é uma
 * mentira. O aparelho esquece, a sincronia roda dois minutos depois, o
 * servidor devolve tudo, e o que a pessoa apagou volta. Apagar tem que
 * acontecer nos dois lados, e é o servidor que manda.
 */
export const apagarGuardado = (banco, leitorId) =>
  ({ apagados: banco.prepare('DELETE FROM guardado WHERE leitor_id = ?').run(leitorId).changes })

/**
 * Apaga a conta inteira. As sessões, o que foi guardado e o convite usado
 * caem junto por cascata — o que sobra é a linha do convite, sem dono.
 *
 * Apagar aqui é apagar mesmo: nada de `desativado = 1` disfarçado de exclusão.
 */
export function apagarConta(banco, leitorId) {
  banco.prepare('DELETE FROM leitor WHERE id = ?').run(leitorId)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────
// Nota e resenha
//
// É o que separa um catálogo de uma biblioteca: o que os leitores dizem
// uns aos outros sobre o que leram.
//
// Três decisões que valem estar escritas:
//
//   1. UMA por pessoa por obra. Escrever de novo é corrigir a sua, e não
//      empilhar mais uma — senão a média vira urna sem fiscal.
//   2. A nota é separada da resenha. Muita gente quer dar cinco estrelas
//      sem escrever nada, e algumas das melhores resenhas não querem dar
//      nota. Exigir as duas juntas faz perder as duas.
//   3. A resenha diz se conta o fim. É o mesmo anti-spoiler do resto do
//      site: quem ainda não leu vê a resenha fechada, com o aviso, e
//      escolhe abrir.
// ─────────────────────────────────────────────────────────────

const TETO_DE_RESENHA = 4000

/** O que a página da obra mostra: a média, quantas notas, e as resenhas. */
export function avaliacoesDa(banco, obraId, leitorId = null) {
  const resumo = banco.prepare(
    'SELECT COUNT(nota) quantas, AVG(nota) media FROM avaliacao WHERE obra_id = ?',
  ).get(obraId)

  const resenhas = banco.prepare(
    `SELECT a.leitor_id, a.nota, a.resenha, a.revela, a.mudou_em, l.nome
       FROM avaliacao a JOIN leitor l ON l.id = a.leitor_id
      WHERE a.obra_id = ? AND a.resenha IS NOT NULL AND a.resenha <> ''
      ORDER BY a.mudou_em DESC LIMIT 50`,
  ).all(obraId)

  const minha = leitorId
    ? banco.prepare('SELECT nota, resenha, revela FROM avaliacao WHERE obra_id = ? AND leitor_id = ?')
      .get(obraId, leitorId) ?? null
    : null

  return {
    quantas: resumo.quantas ?? 0,
    // uma casa decimal: mais que isso finge uma precisão que cinco votos
    // não têm
    media: resumo.media ? Math.round(resumo.media * 10) / 10 : null,
    minha,
    resenhas: resenhas.map(r => ({
      // o id do leitor NÃO sai daqui: quem escreveu aparece pelo nome, e
      // ligar nome a número seria entregar de graça um índice de quem leu
      // o quê
      quem: r.nome,
      minha: leitorId != null && r.leitor_id === leitorId,
      nota: r.nota,
      texto: r.resenha,
      revela: r.revela === 1,
      quando: r.mudou_em,
    })),
  }
}

export function avaliar(banco, leitorId, obraId, { nota, resenha, revela }) {
  if (!freio(banco, 'avaliar', String(leitorId)).passa) {
    throw new Recusa('Muitas avaliações seguidas. Espere um pouco.', 429)
  }
  if (!banco.prepare('SELECT 1 FROM obra WHERE id = ? AND publicada = 1').get(obraId)) {
    throw new Recusa('Essa obra não existe.', 404)
  }

  const n = nota == null || nota === '' ? null : Number(nota)
  if (n != null && (!Number.isInteger(n) || n < 1 || n > 5)) {
    throw new Recusa('A nota vai de 1 a 5.')
  }
  const texto = String(resenha ?? '').trim().slice(0, TETO_DE_RESENHA) || null
  if (n == null && !texto) throw new Recusa('Dê uma nota ou escreva alguma coisa.')

  banco.prepare(
    `INSERT INTO avaliacao (obra_id, leitor_id, nota, resenha, revela)
     VALUES (?,?,?,?,?)
     ON CONFLICT (obra_id, leitor_id) DO UPDATE
       SET nota = excluded.nota, resenha = excluded.resenha,
           revela = excluded.revela, mudou_em = datetime('now')`,
  ).run(obraId, leitorId, n, texto, revela ? 1 : 0)

  return avaliacoesDa(banco, obraId, leitorId)
}

export function desavaliar(banco, leitorId, obraId) {
  banco.prepare('DELETE FROM avaliacao WHERE obra_id = ? AND leitor_id = ?').run(obraId, leitorId)
  return avaliacoesDa(banco, obraId, leitorId)
}

/** As médias de todas as obras, para a publicação do catálogo. */
export const medias = (banco) => banco.prepare(
  `SELECT obra_id, COUNT(nota) quantas, ROUND(AVG(nota), 1) media
     FROM avaliacao WHERE nota IS NOT NULL GROUP BY obra_id`).all()

// ─────────────────────────────────────────────────────────────
// O que está sendo lido
//
// Contagem anônima: a linha guarda a obra e o instante, e mais nada. Não há
// como voltar dela para uma pessoa — o que é a única forma honesta de ter uma
// lista de "mais lidos" numa biblioteca fechada, onde qualquer contagem por
// leitor seria contagem por nome.
// ─────────────────────────────────────────────────────────────

export function registrarAbertura(banco, obraId, ctx = {}) {
  // Freio por IP para que um laço de script não invente popularidade. O IP
  // NÃO é gravado: serve só para contar as tentativas, na tabela de freio,
  // que se limpa sozinha em 24 h.
  if (!freio(banco, 'abrir', dicaDeIp(ctx.ip) ?? 'sem-ip').passa) return { ok: true }

  const existe = banco.prepare('SELECT 1 FROM obra WHERE id = ? AND publicada = 1').get(obraId)
  if (!existe) return { ok: true }

  banco.prepare('INSERT INTO abertura (obra_id) VALUES (?)').run(obraId)
  // 90 dias bastam para qualquer janela que a gente mostre
  banco.prepare("DELETE FROM abertura WHERE quando < datetime('now','-90 days')").run()
  return { ok: true }
}

export function maisLidos(banco, { dias = 30, quantos = 10 } = {}) {
  return banco.prepare(
    `SELECT obra_id, COUNT(*) vezes FROM abertura
      WHERE quando > datetime('now', ?)
      GROUP BY obra_id ORDER BY vezes DESC, obra_id LIMIT ?`,
  ).all(`-${dias} days`, quantos)
}

// ─────────────────────────────────────────────────────────────
// Convites
// ─────────────────────────────────────────────────────────────

export function criarConvite(banco, { criadoPor = null, nota = null } = {}) {
  const codigo = sortearConvite()
  banco.prepare(
    `INSERT INTO convite (codigo_hash, criado_por, expira_em, nota)
     VALUES (?,?, datetime('now', ?), ?)`,
  ).run(resumo(normalizarConvite(codigo)), criadoPor, `+${DIAS_DE_CONVITE} days`, nota)
  // é a única vez que o código existe em claro
  return { codigo, dias: DIAS_DE_CONVITE }
}
