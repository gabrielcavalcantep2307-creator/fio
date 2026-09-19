// Entrar com o Google (18/09/2026).
//
// O fluxo é o "código de autorização com PKCE", o de servidor:
//
//   1. /api/google/entrar  sorteia `state` e o verificador PKCE, guarda os dois
//      NA MEMÓRIA do servidor (10 min) junto com um token que vai num cookie
//      deste navegador, e manda a pessoa ao Google.
//   2. /api/google/volta   só aceita o `state` se o cookie for o mesmo navegador
//      que começou (sem isso, alguém faria você entrar na conta DELE — "login
//      CSRF"), troca o código pelo id_token direto com o Google, por HTTPS.
//
// O id_token chega pelo canal de trás, do próprio Google, então a assinatura
// não precisa ser conferida de novo (OpenID Connect, §3.1.3.7); conferimos
// emissor, público, validade e e-mail verificado.
//
// A REGRA DE VÍNCULO, que é onde isto costuma dar errado:
//   - conta do Google já vinculada → entra nela;
//   - pessoa já entrada pedindo "vincular" → vincula à conta dela;
//   - senão, cria conta NOVA. Nunca junta com uma conta existente só porque o
//     e-mail bate: o e-mail do Fio não é verificado, e quem cadastrasse o seu
//     e-mail antes de você ficaria com a sua conta do Google na mão dele.
//
// Conta criada pelo Google nasce com senha sorteada (ninguém sabe) e sem
// perguntas: quem recupera é o Google. Ela pode definir uma senha depois.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { Recusa, abrirSessao } from './contas.mjs'
import { guardarSenha, freio, dicaDeIp, chaveDeIp, avaliarSenha } from './seguranca.mjs'
import { conferirUsuario, chaveDe, estaTomado } from './usuario.mjs'
import { cadastroAberto } from './ajustes.mjs'
import { marcarContaNova } from './gosto.mjs'

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const VALIDADE = 10 * 60_000
const pendentes = new Map() // state → { navegador, verificador, modo, volta, leitorId, em }

// Ligado só com as duas chaves E o interruptor: os endereços de volta precisam
// estar cadastrados no console do Google antes, senão a pessoa cai numa tela
// de erro dele ("redirect_uri_mismatch").
export const configurado = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.FIO_GOOGLE === 'ligado')

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS leitor_google (
      sub             TEXT PRIMARY KEY,
      leitor_id       INTEGER NOT NULL UNIQUE REFERENCES leitor(id) ON DELETE CASCADE,
      email           TEXT,
      senha_sorteada  INTEGER NOT NULL DEFAULT 0,
      desde           TEXT NOT NULL DEFAULT (datetime('now'))
    );`)
}

const b64url = (b) => Buffer.from(b).toString('base64url')
const faxina = () => { const agora = Date.now(); for (const [k, v] of pendentes) if (agora - v.em > VALIDADE) pendentes.delete(k) }

/** Só caminho da própria casa: nada de mandar a pessoa para fora depois de entrar. */
function voltaSegura(v) {
  const s = String(v ?? '')
  return /^\/(?!\/)[\w\-./#?=&%]*$/.test(s) && !s.includes('\\') ? s.slice(0, 200) : '/#/'
}

/** O endereço de volta é o do host em que a pessoa está (o cookie de sessão é por host). */
export function enderecoDeVolta(host, site) {
  const permitidos = new Set([new URL(site).host, ...String(process.env.FIO_HOSTS_GOOGLE ?? 'fio.142-93-57-2.sslip.io').split(',').map((h) => h.trim()).filter(Boolean)])
  const h = permitidos.has(String(host ?? '')) ? host : new URL(site).host
  const protocolo = /^localhost(:\d+)?$/.test(h) ? 'http' : 'https'
  return `${protocolo}://${h}/api/google/volta`
}

export function comecar(banco, { modo, volta, leitorId, redirectUri, ip }) {
  if (!configurado()) throw new Recusa('Entrar com o Google ainda não está ligado.', 404)
  if (!freio(banco, 'google', chaveDeIp(ip)).passa) throw new Recusa('Muitas tentativas. Tente daqui a pouco.', 429)
  faxina()
  if (pendentes.size > 5000) throw new Recusa('Muita gente entrando agora. Tente em instantes.', 503)
  const state = b64url(randomBytes(24))
  const navegador = b64url(randomBytes(24))
  const verificador = b64url(randomBytes(48))
  pendentes.set(state, { navegador, verificador, modo: modo === 'vincular' ? 'vincular' : 'entrar', volta: voltaSegura(volta), leitorId: leitorId ?? null, redirectUri, em: Date.now() })
  const url = new URL(AUTORIZAR)
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: b64url(createHash('sha256').update(verificador).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return { url: url.toString(), navegador }
}

const iguais = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }

/** Confere a volta e devolve quem o Google disse que é. */
export async function receber({ code, state, navegador }) {
  const p = pendentes.get(String(state ?? ''))
  pendentes.delete(String(state ?? ''))
  if (!p || Date.now() - p.em > VALIDADE) throw new Recusa('O pedido de entrada venceu. Tente de novo.', 400)
  if (!navegador || !iguais(navegador, p.navegador)) throw new Recusa('Este pedido de entrada não começou neste navegador.', 400)
  if (!code || String(code).length > 2000) throw new Recusa('O Google não mandou o código.', 400)

  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: p.redirectUri, grant_type: 'authorization_code', code_verifier: p.verificador,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null)
  if (!r?.ok) throw new Recusa('O Google não confirmou a entrada. Tente de novo.', 400)
  const { id_token: idToken } = await r.json()
  const partes = String(idToken ?? '').split('.')
  if (partes.length !== 3) throw new Recusa('Resposta do Google fora do formato.', 400)
  let c
  try { c = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) } catch { throw new Recusa('Resposta do Google fora do formato.', 400) }
  const agora = Date.now() / 1000
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(c.iss)) throw new Recusa('Emissor inesperado.', 400)
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new Recusa('Resposta para outro aplicativo.', 400)
  if (!(c.exp > agora - 60)) throw new Recusa('Resposta vencida.', 400)
  if (!c.sub || !/^[\w-]{1,255}$/.test(c.sub)) throw new Recusa('Resposta sem identificador.', 400)
  return {
    perfil: { sub: c.sub, email: c.email_verified ? String(c.email ?? '').toLowerCase().slice(0, 254) : null, nome: String(c.name ?? c.given_name ?? '').slice(0, 80) },
    modo: p.modo, volta: p.volta, leitorId: p.leitorId,
  }
}

function usuarioLivre(banco, base) {
  let b = String(base).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '')
  if (!/^[a-z]/.test(b)) b = 'l' + b
  b = b.slice(0, 20)
  if (b.length < 3) b = 'leitor'
  if (!conferirUsuario(b) && !estaTomado(banco, b)) return b
  for (let i = 2; i < 10000; i++) {
    const cand = `${b.slice(0, 20)}${i}`.slice(0, 24)
    if (!conferirUsuario(cand) && !estaTomado(banco, cand)) return cand
  }
  return 'leitor' + String(Date.now()).slice(-7)
}

/** Decide a conta. Devolve { leitorId, sessao?, novo, vinculou }. */
export async function resolver(banco, { perfil, modo, leitorId }, ctx = {}) {
  const ligado = banco.prepare('SELECT leitor_id FROM leitor_google WHERE sub = ?').get(perfil.sub)

  if (modo === 'vincular') {
    if (!leitorId) throw new Recusa('Entre na sua conta antes de vincular o Google.', 401)
    if (ligado && ligado.leitor_id !== leitorId) throw new Recusa('Essa conta do Google já está ligada a outra conta do Fio.', 409)
    if (banco.prepare('SELECT 1 FROM leitor_google WHERE leitor_id = ? AND sub <> ?').get(leitorId, perfil.sub)) {
      throw new Recusa('Sua conta já está ligada a outra conta do Google. Desligue antes.', 409)
    }
    if (!ligado) banco.prepare('INSERT INTO leitor_google (sub, leitor_id, email) VALUES (?,?,?)').run(perfil.sub, leitorId, perfil.email)
    return { leitorId, vinculou: true }
  }

  if (ligado) {
    const l = banco.prepare('SELECT id FROM leitor WHERE id = ? AND desativado = 0').get(ligado.leitor_id)
    if (!l) throw new Recusa('Essa conta está desativada.', 403)
    banco.prepare(`UPDATE leitor SET visto_em = datetime('now') WHERE id = ?`).run(l.id)
    return { leitorId: l.id, sessao: abrirSessao(banco, l.id, ctx) }
  }

  // O Gmail do DONO entra direto na conta dele, sem o passo de "ligar": a lista
  // vem do .env da VPS (FIO_GOOGLE_DONO, e-mails separados por vírgula) e o
  // e-mail tem de vir verificado pelo Google. Não é a regra "juntar pelo
  // e-mail do Fio" (que é recusada no topo): quem decide é o servidor.
  const donos = String(process.env.FIO_GOOGLE_DONO ?? '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean)
  if (perfil.email && donos.includes(perfil.email)) {
    const conta = banco.prepare('SELECT id FROM leitor WHERE usuario = ? AND desativado = 0').get(process.env.FIO_GOOGLE_DONO_CONTA || 'curador')
    if (conta && !banco.prepare('SELECT 1 FROM leitor_google WHERE leitor_id = ?').get(conta.id)) {
      banco.prepare('INSERT INTO leitor_google (sub, leitor_id, email) VALUES (?,?,?)').run(perfil.sub, conta.id, perfil.email)
      banco.prepare(`UPDATE leitor SET visto_em = datetime('now') WHERE id = ?`).run(conta.id)
      return { leitorId: conta.id, sessao: abrirSessao(banco, conta.id, ctx) }
    }
  }

  // conta nova — a mesma porta do cadastro comum
  if (!cadastroAberto(banco)) throw new Recusa('O cadastro está fechado: só entra quem tem convite. Se você já tem conta, entre com a senha e ligue o Google na página da conta.', 403)
  if (!freio(banco, 'criar', chaveDeIp(ctx.ip)).passa) throw new Recusa('Muitas contas criadas daqui. Tente mais tarde.', 429)
  const usuario = usuarioLivre(banco, perfil.email ? perfil.email.split('@')[0] : perfil.nome || 'leitor')
  // e-mail só se ninguém usa (não juntamos contas pelo e-mail — ver o topo)
  const email = perfil.email && !banco.prepare('SELECT 1 FROM leitor WHERE email = ? COLLATE NOCASE').get(perfil.email) ? perfil.email : null
  const s = await guardarSenha(b64url(randomBytes(32)))
  const id = Number(banco.prepare(
    `INSERT INTO leitor (usuario, usuario_chave, email, nome, senha_hash, senha_sal, senha_params) VALUES (?,?,?,?,?,?,?)`,
  ).run(usuario, chaveDe(usuario), email, perfil.nome || usuario, s.hash, s.sal, s.params).lastInsertRowid)
  banco.prepare('INSERT INTO leitor_google (sub, leitor_id, email, senha_sorteada) VALUES (?,?,?,1)').run(perfil.sub, id, perfil.email)
  try { marcarContaNova(banco, id) } catch {}
  return { leitorId: id, sessao: abrirSessao(banco, id, ctx), novo: true }
}

export function situacao(banco, leitorId) {
  const g = banco.prepare('SELECT email, senha_sorteada, desde FROM leitor_google WHERE leitor_id = ?').get(leitorId)
  return { disponivel: configurado(), ligado: !!g, email: g?.email ?? null, semSenha: !!g?.senha_sorteada, desde: g?.desde ?? null }
}

/** Conta criada pelo Google define a primeira senha sem saber a sorteada. */
export async function definirSenha(banco, leitorId, { nova }) {
  const g = banco.prepare('SELECT senha_sorteada FROM leitor_google WHERE leitor_id = ?').get(leitorId)
  if (!g?.senha_sorteada) throw new Recusa('Sua conta já tem senha: use "trocar a senha".', 409)
  const l = banco.prepare('SELECT usuario, email FROM leitor WHERE id = ?').get(leitorId)
  const vale = avaliarSenha(nova, { usuario: l.usuario, email: l.email ?? '' })
  if (vale.erro) throw new Recusa(vale.erro)
  const s = await guardarSenha(String(nova))
  banco.prepare('UPDATE leitor SET senha_hash = ?, senha_sal = ?, senha_params = ? WHERE id = ?').run(s.hash, s.sal, s.params, leitorId)
  banco.prepare('UPDATE leitor_google SET senha_sorteada = 0 WHERE leitor_id = ?').run(leitorId)
  return { ok: true }
}

export function desligar(banco, leitorId) {
  const g = banco.prepare('SELECT senha_sorteada FROM leitor_google WHERE leitor_id = ?').get(leitorId)
  if (!g) throw new Recusa('Sua conta não está ligada ao Google.', 404)
  if (g.senha_sorteada) throw new Recusa('Defina uma senha antes de desligar o Google — senão você fica sem como entrar.', 409)
  banco.prepare('DELETE FROM leitor_google WHERE leitor_id = ?').run(leitorId)
  return { ok: true }
}

// para os testes
export const _pendentes = pendentes
