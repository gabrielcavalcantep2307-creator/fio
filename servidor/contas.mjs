// As contas: criar, entrar, sair, esquecer a senha.
//
// Toda a regra de negócio mora aqui; api.mjs só traduz HTTP. Isso é o que
// permite testar login sem subir servidor nenhum (veja `npm test`).

import {
  guardarSenha, conferirSenha, gastarTempoAtoa, sortearToken, resumo,
  sortearConvite, freio, perdoar, conferirEmail, conferirSenha_, dicaDeIp,
} from './seguranca.mjs'

const DIAS_DE_SESSAO = 30
const MINUTOS_DE_RECUPERACAO = 30
const DIAS_DE_CONVITE = 14

/** Erro que PODE ser mostrado ao usuário. Qualquer outro vira "deu ruim". */
export class Recusa extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status }
}

const publico = (l) => ({ id: l.id, nome: l.nome, email: l.email, papel: l.papel })

// ─────────────────────────────────────────────────────────────
// Criar conta — só com convite
// ─────────────────────────────────────────────────────────────

export async function criar(banco, { nome, email, senha, convite }, ctx = {}) {
  const emLimite = freio(banco, 'criar', dicaDeIp(ctx.ip) ?? 'sem-ip')
  if (!emLimite.passa) throw new Recusa('Muitas tentativas. Tente daqui a pouco.', 429)

  const limpo = conferirEmail(email)
  if (!limpo) throw new Recusa('Esse e-mail não parece válido.')
  const problema = conferirSenha_(senha)
  if (problema) throw new Recusa(problema)
  const nomeLimpo = String(nome ?? '').trim().slice(0, 80)
  if (nomeLimpo.length < 2) throw new Recusa('Diga como quer ser chamado.')

  const conv = banco.prepare(
    `SELECT id FROM convite
      WHERE codigo_hash = ? AND usado_em IS NULL AND expira_em > datetime('now')`,
  ).get(resumo(String(convite ?? '').trim().toUpperCase()))
  if (!conv) throw new Recusa('Convite inválido, já usado ou vencido.')

  if (banco.prepare('SELECT 1 FROM leitor WHERE email = ?').get(limpo)) {
    // Aqui dá para contar: quem tem o convite já é de casa, e a alternativa
    // é a pessoa não entender por que não consegue criar a conta.
    throw new Recusa('Já existe conta com esse e-mail. Tente entrar.')
  }

  const s = await guardarSenha(senha)
  const id = Number(banco.prepare(
    `INSERT INTO leitor (email, nome, senha_hash, senha_sal, senha_params) VALUES (?,?,?,?,?)`,
  ).run(limpo, nomeLimpo, s.hash, s.sal, s.params).lastInsertRowid)

  banco.prepare(`UPDATE convite SET usado_por = ?, usado_em = datetime('now') WHERE id = ?`)
    .run(id, conv.id)

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
  banco.prepare(`DELETE FROM recuperacao WHERE expira_em < datetime('now', '-1 day')`).run()
}

// ─────────────────────────────────────────────────────────────
// Esqueci a senha
// ─────────────────────────────────────────────────────────────

/**
 * Devolve SEMPRE a mesma coisa, exista o e-mail ou não. Se a resposta
 * diferenciasse, este endereço viraria uma máquina de descobrir quem tem
 * conta aqui.
 */
export function pedirTroca(banco, { email }, ctx = {}) {
  const limpo = conferirEmail(email)
  const chave = limpo ?? dicaDeIp(ctx.ip) ?? 'sem-ip'
  if (!freio(banco, 'esqueci', chave).passa) {
    throw new Recusa('Muitas tentativas. Espere um pouco.', 429)
  }
  if (!limpo) return { aviso: null }

  const l = banco.prepare('SELECT id, nome FROM leitor WHERE email = ? AND desativado = 0').get(limpo)
  if (!l) return { aviso: null }

  const token = sortearToken()
  banco.prepare(
    `INSERT INTO recuperacao (leitor_id, token_hash, expira_em)
     VALUES (?,?, datetime('now', ?))`,
  ).run(l.id, resumo(token), `+${MINUTOS_DE_RECUPERACAO} minutes`)

  // quem chama decide como manda; aqui só se produz o que precisa ser mandado
  return { aviso: { email: limpo, nome: l.nome, token, minutos: MINUTOS_DE_RECUPERACAO } }
}

export async function trocarSenha(banco, { token, senha }) {
  const problema = conferirSenha_(senha)
  if (problema) throw new Recusa(problema)

  const r = banco.prepare(
    `SELECT id, leitor_id FROM recuperacao
      WHERE token_hash = ? AND usado_em IS NULL AND expira_em > datetime('now')`,
  ).get(resumo(String(token ?? '')))
  if (!r) throw new Recusa('Esse link já foi usado ou venceu. Peça outro.', 400)

  const s = await guardarSenha(senha)
  banco.prepare(
    `UPDATE leitor SET senha_hash = ?, senha_sal = ?, senha_params = ?,
            senha_mudou = datetime('now') WHERE id = ?`,
  ).run(s.hash, s.sal, s.params, r.leitor_id)
  banco.prepare(`UPDATE recuperacao SET usado_em = datetime('now') WHERE id = ?`).run(r.id)

  // Trocar a senha derruba todas as sessões. Se a conta foi invadida, é isso
  // que expulsa o invasor — e é o motivo de a pessoa ter trocado.
  sairDeTudo(banco, r.leitor_id)
  return { ok: true }
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
// Convites
// ─────────────────────────────────────────────────────────────

export function criarConvite(banco, { criadoPor = null, nota = null } = {}) {
  const codigo = sortearConvite()
  banco.prepare(
    `INSERT INTO convite (codigo_hash, criado_por, expira_em, nota)
     VALUES (?,?, datetime('now', ?), ?)`,
  ).run(resumo(codigo), criadoPor, `+${DIAS_DE_CONVITE} days`, nota)
  // é a única vez que o código existe em claro
  return { codigo, dias: DIAS_DE_CONVITE }
}
