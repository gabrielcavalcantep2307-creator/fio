// O roteador da API: cada rota DECLARA o que precisa, e o roteador aplica.
//
//   rota({ metodo: 'POST', caminho: '/api/publicacao/imagem', acesso: 'conta',
//          freio: { acao: 'upload' }, corpo: 'binario', teto: 8e6 }, (ctx) => …)
//
// ─────────────────────────────────────────────────────────────
// A ORDEM, que é a mesma para todas as rotas
//
//   1. a rota existe? (senão 404; caminho certo com método errado, 405)
//   2. a origem é a nossa? (403)
//   3. escrita traz `x-fio`? (403)
//   4. quem é: 'livre', 'conta' (senão 401) ou 'admin' (senão o MESMO 404 de
//      rota inexistente — um leitor comum não descobre que o painel existe)
//   5. freio, por faixa de IP ou por conta (429)
//   6. o corpo, com teto contado enquanto chega (413): JSON ou binário cru
//   7. a função da rota
//   8. erro esperado (Recusa) vira a mensagem dela; o resto vira 500 com
//      mensagem genérica — a interna fica no log, nunca na resposta.
//
// Até 19/09/2026 esta ordem existia em quinze lugares, escrita à mão: o mapa
// de rotas fazia 1–3 e 6–8, e cada rota fora do mapa (upload, livro, mangás,
// avaliações…) repetia o que lembrava. Algumas rotas de leitura nem conferiam
// a origem. Agora uma rota nova não tem como esquecer uma trava: ela só diz
// quais são as suas.
// ─────────────────────────────────────────────────────────────

import { Recusa } from '../contas.mjs'
import * as contas from '../contas.mjs'
import { freio, dicaDeIp } from '../seguranca.mjs'
import { origemOk, lerCookie, lerJson, bytesDoPedido, responder, ipDe } from './pedido.mjs'

// Parâmetros de caminho: `:id` é sempre número; `:nome` é um pedaço sem barra.
// Um parâmetro pode trazer o próprio padrão: `:arquivo(\w+\.jpg)`.
function compilar(caminho) {
  const nomes = []
  let re = ''
  for (let i = 0; i < caminho.length;) {
    const m = caminho.slice(i).match(/^:(\w+)/)
    if (!m) { re += caminho[i].replace(/[.*+?^${}|[\]\\]/g, '\\$&'); i++; continue }
    nomes.push(m[1])
    i += m[0].length
    if (caminho[i] === '(') {
      // o padrão próprio vai até o parêntese que fecha ESTE (pode ter grupos dentro)
      let fundo = 0, j = i
      for (; j < caminho.length; j++) {
        if (caminho[j] === '\\') { j++; continue }
        if (caminho[j] === '(') fundo++
        else if (caminho[j] === ')' && --fundo === 0) break
      }
      re += caminho.slice(i, j + 1)
      i = j + 1
    } else re += m[1] === 'id' ? '(\\d{1,9})' : '([^/]{1,120})'
  }
  return { re: new RegExp(`^${re}$`), nomes }
}

export function criarRoteador({ banco }) {
  const exatas = new Map()   // 'GET /api/eu' → rota
  const padroes = []         // rotas com parâmetro
  const caminhos = new Map() // caminho exato → métodos, para o 405

  function rota(def, fn) {
    const metodos = [def.metodo ?? 'GET'].flat()
    const r = { acesso: 'livre', corpo: def.metodo === 'POST' ? 'json' : false, teto: 64 * 1024, ...def, metodos, fn }
    if (r.caminho.includes(':')) padroes.push({ ...r, ...compilar(r.caminho) })
    else {
      for (const m of metodos) {
        if (exatas.has(`${m} ${r.caminho}`)) throw new Error(`rota repetida: ${m} ${r.caminho}`)
        exatas.set(`${m} ${r.caminho}`, r)
      }
      caminhos.set(r.caminho, [...(caminhos.get(r.caminho) ?? []), ...metodos])
    }
  }

  function achar(metodo, caminho) {
    const exata = exatas.get(`${metodo} ${caminho}`)
    if (exata) return { r: exata, params: {} }
    let metodoErrado = caminhos.has(caminho)
    for (const p of padroes) {
      const m = caminho.match(p.re)
      if (!m) continue
      if (!p.metodos.includes(metodo)) { metodoErrado = true; continue }
      return { r: p, params: Object.fromEntries(p.nomes.map((n, i) => [n, n === 'id' ? Number(m[i + 1]) : m[i + 1]])) }
    }
    return metodoErrado ? { metodoErrado: true } : null
  }

  const quemE = (req) => contas.deQuemE(banco, lerCookie(req))

  /** Atende um pedido da API. Devolve false se o caminho não é da API. */
  async function atender(req, res, caminho) {
    if (!caminho.startsWith('/api/')) return false
    const achado = achar(req.method, caminho.replace(/\/+$/, ''))
    const r = achado?.r
    try {
      if (!achado) throw new Recusa('Não existe.', 404)
      if (achado.metodoErrado) throw new Recusa('Método não permitido.', 405)
      if (!origemOk(req)) throw new Recusa('Origem não autorizada.', 403)
      if (req.method === 'POST' && req.headers['x-fio'] !== '1') throw new Recusa('Pedido sem identificação.', 403)

      const ip = ipDe(req)
      let pessoa = null
      if (r.acesso === 'conta' || r.acesso === 'admin') {
        pessoa = quemE(req)
        if (!pessoa) throw new Recusa('Não está entrado.', 401)
        if (r.acesso === 'admin' && pessoa.papel !== 'admin') throw new Recusa('Não existe.', 404)
      }
      if (r.freio) {
        const chave = r.freio.por === 'ip' ? (dicaDeIp(ip) ?? 'sem-ip') : `leitor-${pessoa.id}`
        if (!freio(banco, r.freio.acao, chave).passa) {
          throw new Recusa(r.freio.msg ?? 'Muitas ações seguidas. Espere um pouco.', 429)
        }
      }

      const ctx = {
        req, res, ip, pessoa, params: achado.params,
        agente: req.headers['user-agent'],
        busca: new URL(req.url, 'http://x').searchParams,
        // Quem está vendo, nas rotas livres que mudam conforme a conta
        // (o livro, as publicações). Só consulta a sessão se a rota pedir.
        quem: () => pessoa ?? (pessoa = quemE(req)),
        dado: r.corpo === 'json' ? await lerJson(req, r.teto) : {},
        bytes: r.corpo === 'binario' ? await bytesDoPedido(req, r.teto) : null,
      }
      const valor = await r.fn(ctx)
      if (r.cru) return true // a rota já escreveu a resposta
      responder(res, 200, valor, { cache: r.cache })
    } catch (e) {
      if (res.headersSent) { console.error(`[fio] ${req.method} ${caminho} (depois de responder)`, e); return true }
      // `publica`: erro de outro módulo cuja mensagem pode ir ao leitor (mangas.ErroManga)
      if (e instanceof Recusa || (e?.publica === true && Number.isInteger(e.status))) {
        responder(res, e.status, { erro: e.message })
      } else {
        // Nunca devolva a mensagem interna: ela conta como o sistema é por dentro.
        console.error(`[fio] ${req.method} ${caminho}`, e)
        responder(res, 500, { erro: r?.erro500 ?? 'Deu alguma coisa errada aqui. Tente de novo.' })
      }
    }
    return true
  }

  return { rota, atender, quemE, rotas: () => [...exatas.keys(), ...padroes.map((p) => `${p.metodos.join('|')} ${p.caminho}`)] }
}
