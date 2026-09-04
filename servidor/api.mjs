// O servidor de contas.
//
//   node servidor/api.mjs
//
// Ele NÃO serve o site: o site é estático e mora no GitHub Pages (ou em
// qualquer lugar). Este processo cuida só do que exige um servidor — conta,
// sessão, senha e a sincronia do que o leitor marcou.
//
// Variáveis (veja .env.exemplo):
//   FIO_PORTA        padrão 8787
//   FIO_ORIGENS      lista separada por vírgula que pode chamar esta API
//   FIO_SITE         endereço do site, para montar o link de troca de senha
//   FIO_EMAIL_*      como mandar e-mail (sem isso, o link sai no log)

import { createServer } from 'node:http'
import { abrir } from './banco/base.mjs'
import * as contas from './contas.mjs'
import { Recusa } from './contas.mjs'
import { enviar } from './email.mjs'

const PORTA = Number(process.env.FIO_PORTA || 8787)
const SITE = process.env.FIO_SITE || 'http://localhost:5181'
const ORIGENS = (process.env.FIO_ORIGENS || SITE).split(',').map(s => s.trim()).filter(Boolean)

const banco = abrir()

// ─────────────────────────────────────────────────────────────
// CORS e CSRF, que são a mesma conversa
//
// O cookie de sessão é SameSite=Lax: um site qualquer não consegue fazer o
// navegador mandá-lo num POST. Sobre isso, duas travas:
//
//   1. lista de origens — só quem está nela recebe permissão de ler a
//      resposta E de mandar cookie (`credentials`).
//   2. cabeçalho `x-fio` obrigatório em toda escrita — um formulário HTML
//      comum não consegue mandar cabeçalho personalizado sem antes passar
//      pelo pedido de permissão, que a trava 1 recusa.
// ─────────────────────────────────────────────────────────────

function cors(req, res) {
  const origem = req.headers.origin
  if (origem && ORIGENS.includes(origem)) {
    res.setHeader('access-control-allow-origin', origem)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader('vary', 'origin')
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type,x-fio')
  res.setHeader('access-control-max-age', '600')
  return !origem || ORIGENS.includes(origem)
}

const SEGURO = process.env.FIO_INSEGURO !== '1' // só desligue em localhost

function porCookie(res, token, dias) {
  const pedacos = [
    `fio=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${dias * 24 * 3600}`,
  ]
  if (SEGURO) pedacos.push('Secure')
  res.setHeader('set-cookie', pedacos.join('; '))
}

const semCookie = (res) =>
  res.setHeader('set-cookie', `fio=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SEGURO ? '; Secure' : ''}`)

const lerCookie = (req) =>
  (req.headers.cookie ?? '').split(';').map(s => s.trim())
    .find(s => s.startsWith('fio='))?.slice(4) || null

async function corpo(req) {
  const pedacos = []
  let tamanho = 0
  for await (const p of req) {
    tamanho += p.length
    if (tamanho > 64 * 1024) throw new Recusa('Pedido grande demais.', 413)
    pedacos.push(p)
  }
  if (!pedacos.length) return {}
  try { return JSON.parse(Buffer.concat(pedacos).toString('utf8')) }
  catch { throw new Recusa('Não entendi o pedido.', 400) }
}

const responder = (res, status, dado) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(dado))
}

const ipDe = (req) =>
  (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress

// ─────────────────────────────────────────────────────────────

const ROTAS = {
  'GET /saude': () => ({ ok: true }),

  'GET /eu': (req) => {
    const pessoa = contas.deQuemE(banco, lerCookie(req))
    if (!pessoa) throw new Recusa('Não está entrado.', 401)
    return { pessoa }
  },

  'POST /criar': async (req, res, dado, ctx) => {
    const { pessoa, sessao } = await contas.criar(banco, dado, ctx)
    porCookie(res, sessao.token, sessao.dias)
    return { pessoa }
  },

  'POST /entrar': async (req, res, dado, ctx) => {
    const { pessoa, sessao } = await contas.entrar(banco, dado, ctx)
    porCookie(res, sessao.token, sessao.dias)
    return { pessoa }
  },

  'POST /sair': (req, res) => {
    contas.sair(banco, lerCookie(req))
    semCookie(res)
    return { ok: true }
  },

  'POST /esqueci': async (req, res, dado, ctx) => {
    const { aviso } = contas.pedirTroca(banco, dado, ctx)
    if (aviso) {
      const link = `${SITE}/#/trocar-senha?t=${encodeURIComponent(aviso.token)}`
      await enviar({
        para: aviso.email,
        assunto: 'Trocar a senha do Fio',
        titulo: `Olá, ${aviso.nome}`,
        texto: `Alguém pediu para trocar a senha desta conta. Se não foi você, ignore este e-mail — nada muda. O link vale por ${aviso.minutos} minutos e só funciona uma vez.`,
        botao: { rotulo: 'Escolher outra senha', url: link },
      })
    }
    // A resposta é a mesma exista ou não a conta. É de propósito.
    return { ok: true }
  },

  'POST /trocar-senha': async (req, res, dado) => {
    await contas.trocarSenha(banco, dado)
    semCookie(res)
    return { ok: true }
  },

  // ── o que o leitor guardou, entre aparelhos ──
  'GET /meus-dados': (req) => {
    const pessoa = contas.deQuemE(banco, lerCookie(req))
    if (!pessoa) throw new Recusa('Não está entrado.', 401)
    return {
      progresso: banco.prepare(
        'SELECT texto_id, capitulo_ord, fracao, atualizado_em FROM progresso WHERE leitor_id = ?',
      ).all(pessoa.id),
      marcacoes: banco.prepare(
        `SELECT m.id, m.capitulo_id, m.inicio, m.fim, m.trecho, m.cor, n.corpo nota
           FROM marcacao m LEFT JOIN nota n ON n.marcacao_id = m.id
          WHERE m.leitor_id = ?`,
      ).all(pessoa.id),
      estante: banco.prepare(
        'SELECT obra_id, estado, nota, mudou_em FROM estante WHERE leitor_id = ?',
      ).all(pessoa.id),
    }
  },

  // ── administração: convites ──
  'POST /convite': (req, res, dado) => {
    const pessoa = contas.deQuemE(banco, lerCookie(req))
    if (!pessoa || pessoa.papel !== 'admin') throw new Recusa('Não pode.', 403)
    return contas.criarConvite(banco, { criadoPor: pessoa.id, nota: dado.nota })
  },
}

const servidor = createServer(async (req, res) => {
  const origemOk = cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  const caminho = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/'
  const chave = `${req.method} ${caminho}`
  const rota = ROTAS[chave]

  try {
    if (!rota) throw new Recusa('Não existe.', 404)
    if (!origemOk) throw new Recusa('Origem não autorizada.', 403)

    // A trava do CSRF: escrita exige o cabeçalho que só código nosso manda.
    if (req.method === 'POST' && req.headers['x-fio'] !== '1') {
      throw new Recusa('Pedido sem identificação.', 403)
    }

    const dado = req.method === 'POST' ? await corpo(req) : {}
    const ctx = { ip: ipDe(req), agente: req.headers['user-agent'] }
    responder(res, 200, await rota(req, res, dado, ctx))
  } catch (e) {
    if (e instanceof Recusa) return responder(res, e.status, { erro: e.message })
    // Nunca devolva a mensagem interna: ela conta como o sistema é por dentro.
    console.error(`[fio] ${chave}`, e)
    responder(res, 500, { erro: 'Deu alguma coisa errada aqui. Tente de novo.' })
  }
})

servidor.listen(PORTA, () => {
  console.log(`fio/contas na porta ${PORTA}`)
  console.log(`  site ..... ${SITE}`)
  console.log(`  origens .. ${ORIGENS.join(', ')}`)
  if (!SEGURO) console.log('  ATENÇÃO: cookie sem Secure (FIO_INSEGURO=1). Só em localhost.')
})
