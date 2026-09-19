// O pedido e a resposta HTTP: ler o corpo com teto, responder JSON, cookies,
// IP e origem. Peças pequenas que o roteador (roteador.mjs) monta numa ordem
// fixa — é essa ordem que garante que nenhuma rota esquece uma trava.

import { ipDoPedido } from '../seguranca.mjs'
import { Recusa } from '../contas.mjs'

// Só é preciso quando o site NÃO vem deste processo (desenvolvimento, com o
// Vite na 5181). Em produção fica vazia, e aí nenhuma origem de fora entra.
export const ORIGENS = (process.env.FIO_ORIGENS || '').split(',').map((s) => s.trim()).filter(Boolean)

export const SEGURO = process.env.FIO_INSEGURO !== '1' // só desligue em localhost

// ─────────────────────────────────────────────────────────────
// CSRF
//
// Mesma origem + `SameSite=Lax` já impede que outro site faça o navegador
// mandar o cookie num POST. Sobre isso, duas travas a mais, que o roteador
// aplica em TODA rota da API (até 19/09 cada rota de upload repetia as duas à
// mão, e algumas rotas de leitura não conferiam a origem):
//
//   1. cabeçalho `x-fio` obrigatório em toda escrita — um <form> comum não
//      consegue mandar cabeçalho personalizado sem antes pedir permissão;
//   2. quando vier `Origin`, ela tem que ser a nossa (ou estar na lista).
// ─────────────────────────────────────────────────────────────

export function origemOk(req) {
  const origem = req.headers.origin
  if (!origem) return true // pedido de mesma origem costuma vir sem Origin
  if (ORIGENS.includes(origem)) return true
  try { return new URL(origem).host === req.headers.host } catch { return false }
}

export function cors(req, res) {
  const origem = req.headers.origin
  if (origem && ORIGENS.includes(origem)) {
    res.setHeader('access-control-allow-origin', origem)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader('vary', 'origin')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type,x-fio')
    res.setHeader('access-control-max-age', '600')
  }
}

// ─────────────────────────────────────────────────────────────
// O cookie da sessão
//
// `__Host-` não é enfeite: o navegador só aceita gravar um cookie com esse
// prefixo se ele vier por HTTPS, com `Path=/` e SEM `Domain`. Isso fecha o
// ataque em que um subdomínio qualquer (ou alguém em HTTP na mesma rede)
// grava um cookie de sessão que o site principal aceitaria.
//
// Em localhost sem HTTPS o prefixo é impossível, então lá o nome é o simples.
// ─────────────────────────────────────────────────────────────

export const NOME_COOKIE = SEGURO ? '__Host-fio' : 'fio'

/** Um `Set-Cookie` com as travas de sempre: HttpOnly, SameSite=Lax, Secure. */
export const cookie = (nome, valor, segundos) =>
  [`${nome}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${segundos}`, ...(SEGURO ? ['Secure'] : [])].join('; ')

export const porCookie = (res, token, dias) => res.setHeader('set-cookie', cookie(NOME_COOKIE, token, dias * 24 * 3600))
export const semCookie = (res) => res.setHeader('set-cookie', cookie(NOME_COOKIE, '', 0))

export const lerCookie = (req, nome = NOME_COOKIE) =>
  (req.headers.cookie ?? '').split(';').map((s) => s.trim())
    .find((s) => s.startsWith(`${nome}=`))?.slice(nome.length + 1) || null

// ─────────────────────────────────────────────────────────────

/**
 * Os bytes crus do pedido, com teto.
 *
 * O teto é contado ENQUANTO chega, e não depois: esperar o fim para conferir
 * o tamanho é deixar quem quiser encher a memória do processo com um pedido
 * que nunca termina. O `content-length` não serve de trava porque quem manda
 * escolhe o que escrever nele.
 */
export async function bytesDoPedido(req, teto) {
  const pedacos = []
  let tamanho = 0
  for await (const p of req) {
    tamanho += p.length
    if (tamanho > teto) throw new Recusa('Pedido grande demais.', 413)
    pedacos.push(p)
  }
  return Buffer.concat(pedacos)
}

export async function lerJson(req, teto = 64 * 1024) {
  const bytes = await bytesDoPedido(req, teto)
  if (!bytes.length) return {}
  try { return JSON.parse(bytes.toString('utf8')) } catch { throw new Recusa('Não entendi o pedido.', 400) }
}

export function responder(res, status, dado, { cache = 'no-store' } = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache })
  res.end(JSON.stringify(dado))
}

export const redirecionar = (res, location, cookies = null) => {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...(cookies ? { 'set-cookie': cookies } : {}) })
  res.end()
}

export const ipDe = (req) => ipDoPedido(req.headers['x-forwarded-for'], req.socket.remoteAddress)
